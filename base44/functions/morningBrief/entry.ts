import { createClientFromRequest } from 'npm:@base44/sdk';
import { secrets } from 'base44:runtime';
import { budapestDate, chartUrl } from '../../shared/chart.ts';
import { chunk, duplicateIds, usageTotals, type UsageRow } from '../../shared/rows.ts';
import {
  BRIEF_SCHEMA,
  briefCatalogNames,
  briefNumbers,
  buildBriefPrompt,
  fallbackNotification,
  limitsFor,
  normalizeBrief,
  pickNews,
  type BriefSnapshot,
  type Move,
} from './brief.ts';
import { briefDue, localDateTime, normalizeDigestTime, safeTz } from './due.ts';
import {
  BRIEF_DAILY_CAP,
  FETCH_BATCH,
  asSnapshot,
  frankfurterUrls,
  fxFromRates,
  latestDigest,
  marketSymbols,
  monthBuysMinor,
  movesFromChart,
  needsUsd,
  parseBriefAction,
  parseFrankfurterRate,
  testPayload,
  type DigestRow,
  type Payload,
} from './logic.ts';
import { handleAnalyze } from './analyze.ts';
import { classifyPushResult, sendPush } from './push.ts';
import { digestPushStatus, initialPushState } from './pushResult.ts';

// Log only safe fields, never payloads (no notification text, no news titles).
const safeErr = (err: unknown) => {
  const e = err as { name?: string; status?: number; response?: { status?: number }; message?: unknown } | null;
  return {
    name: e?.name,
    status: e?.status ?? e?.response?.status,
    message: String(e?.message ?? '').slice(0, 200),
  };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Me = { id: string; digest_time?: string; timezone?: string; digest_enabled?: boolean; brief_snapshot?: unknown };

type SubRow = {
  id: string;
  owner_id?: string;
  created_by_id?: string;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  active?: boolean;
};

type NewsRow = {
  id: string;
  owner_id?: string;
  title?: string;
  summary?: string | null;
  source_name?: string;
  published_at?: string | null;
  affects_portfolio?: boolean;
  tags?: string[] | null;
};

const MODEL = 'claude-sonnet-5';
const ROW_LIMIT = 5000;
const NEWS_LIMIT = 500;
const UA = { 'user-agent': 'Mozilla/5.0', accept: 'application/json' };

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`http ${res.status}`);
  }
  return await res.json();
}

/** Day/week moves per symbol; a failed fetch gives null moves (the brief is then marked incomplete). */
async function fetchMoves(symbols: string[]): Promise<Record<string, Move>> {
  const moves: Record<string, Move> = {};
  for (const batch of chunk(symbols, FETCH_BATCH)) {
    await Promise.all(
      batch.map(async (symbol) => {
        try {
          moves[symbol] = movesFromChart(await fetchJson(chartUrl(symbol, '1mo')));
        } catch (err) {
          console.error('brief chart failed', { symbol, ...safeErr(err) });
          moves[symbol] = { day: null, week: null };
        }
      }),
    );
  }
  return moves;
}

async function fetchFx(from: 'EUR' | 'USD', today: string): Promise<{ rate: number; weekChange: number | null } | null> {
  const urls = frankfurterUrls(from, today);
  const rate = async (url: string) => {
    try {
      return parseFrankfurterRate(await fetchJson(url));
    } catch (err) {
      console.error('brief fx failed', { from, ...safeErr(err) });
      return null;
    }
  };
  const [latest, weekAgo] = await Promise.all([rate(urls.latest), rate(urls.weekAgo)]);
  return fxFromRates(latest, weekAgo);
}

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const body = await req.json().catch(() => ({}));
    const mode = parseBriefAction(body);
    if (!mode) return json({ error: 'unknown_action' }, 400);

    // A scheduled workflow run authenticates as the app owner (the single user).
    const base44 = createClientFromRequest(req);
    let me: Me;
    try {
      const u = (await base44.auth.me()) as Me | null;
      if (!u?.id) return json({ error: 'unauthorized' }, 401);
      me = u;
    } catch {
      return json({ error: 'unauthorized' }, 401);
    }
    const ownerId = me.id;
    const db = base44.asServiceRole.entities;

    // Only trust rows the user created for themselves: owner_id must agree with created_by_id.
    const readSubs = async () =>
      (((await db.PushSubscription.filter({ owner_id: ownerId, active: true })) ?? []) as SubRow[]).filter(
        (r) => r.active === true && r.owner_id === ownerId && r.created_by_id === ownerId && r.endpoint && r.p256dh && r.auth,
      );

    const loadVapid = async () => {
      const publicKey = await secrets.get('VAPID_PUBLIC_KEY');
      const privateKey = await secrets.get('VAPID_PRIVATE_KEY');
      const subject = await secrets.get('VAPID_SUBJECT');
      return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
    };

    /** Sends to each subscription, deactivating gone ones. Never throws. */
    const pushAll = async (subs: SubRow[], payload: Payload, vapid: { publicKey: string; privateKey: string; subject: string }) => {
      const kinds: ('sent' | 'gone' | 'failed')[] = [];
      const errors: string[] = [];
      let firstFailed: string | undefined;
      for (const s of subs) {
        const r = await sendPush({ endpoint: s.endpoint!, p256dh: s.p256dh!, auth: s.auth! }, payload, vapid);
        const kind = classifyPushResult(r);
        kinds.push(kind);
        if (kind === 'sent') continue;
        const error = r.ok ? 'unknown' : r.error;
        errors.push(error);
        if (kind === 'failed' && firstFailed === undefined) firstFailed = error;
        try {
          await db.PushSubscription.update(s.id, kind === 'gone' ? { active: false, last_error: error } : { last_error: error });
        } catch (err) {
          console.error('push row update failed', safeErr(err));
        }
      }
      return { kinds, errors, firstFailed };
    };

    // DailyDigest is never client-creatable, so owner_id alone is trustworthy.
    const readDigests = async (date?: string) =>
      (((await db.DailyDigest.filter(date ? { owner_id: ownerId, date } : { owner_id: ownerId }, '-created_date', date ? 50 : 20)) ??
        []) as (DigestRow & { owner_id?: string })[]).filter((r) => r.owner_id === ownerId && (!date || r.date === date));

    /** This month's own buys total (InvestmentTransaction rows are client-created: monthBuysMinor trusts created_by_id). */
    const readInvestedThisMonth = async (month: string) => {
      const buys = ((await db.InvestmentTransaction.filter({ created_by_id: ownerId, side: 'buy' }, '-date', ROW_LIMIT)) ?? []) as {
        created_by_id?: string;
        side?: unknown;
        date?: unknown;
        amount_huf_minor?: unknown;
      }[];
      return monthBuysMinor(buys, ownerId, month);
    };

    // ---- {action:'analyze'}: the stored or freshly built Hungarian analysis of one news item ----
    if (mode === 'analyze') {
      const nowIso = new Date().toISOString();
      const result = await handleAnalyze({
        body,
        ownerId,
        snapshot: asSnapshot(me.brief_snapshot),
        nowIso,
        db: db as unknown as Parameters<typeof handleAnalyze>[0]['db'],
        investedThisMonthMinor: () => readInvestedThisMonth(budapestDate(nowIso).slice(0, 7)),
        invokeLLM: (prompt, schema) =>
          base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt,
            response_json_schema: schema,
            model: MODEL,
          } as Parameters<typeof base44.asServiceRole.integrations.Core.InvokeLLM>[0]),
        fetchImpl: fetch,
      });
      return json(result);
    }

    // ---- {action:'test'}: resend the latest digest (or a fixed text) to every subscription ----
    if (mode === 'test') {
      const vapid = await loadVapid();
      if (!vapid) return json({ error: 'vapid_not_configured' }, 500);
      const payload = testPayload(latestDigest(await readDigests()));
      const { kinds, errors } = await pushAll(await readSubs(), payload, vapid);
      return json({ sent: kinds.filter((k) => k === 'sent').length, failed: kinds.filter((k) => k !== 'sent').length, errors });
    }

    // ---- scheduled / now: build today's digest if it is missing ----
    const nowIso = new Date().toISOString();
    const tz = safeTz(me.timezone);
    const today = localDateTime(nowIso, tz).date;
    const summary = { ran: false as boolean, reason: undefined as string | undefined, date: today, ai_ok: false, push_status: 'skipped' as string };

    if ((await readDigests(today)).length > 0) return json({ ...summary, reason: 'exists' });

    const snapshot: BriefSnapshot | null = asSnapshot(me.brief_snapshot);
    const subs = await readSubs();
    if (mode === 'scheduled') {
      if (!snapshot && subs.length === 0) return json({ ...summary, reason: 'no_data' });
      if (!briefDue(nowIso, tz, normalizeDigestTime(me.digest_time), false)) return json({ ...summary, reason: 'not_due' });
    }
    summary.ran = true;

    // 1. Inputs: this month's buys, market moves, FX, news.
    const investedThisMonthMinor = await readInvestedThisMonth(today.slice(0, 7));

    const [moves, eurHuf, usdHuf] = await Promise.all([
      fetchMoves(marketSymbols(snapshot)),
      fetchFx('EUR', today),
      needsUsd(snapshot) ? fetchFx('USD', today) : Promise.resolve(null),
    ]);
    // FxRate is not upserted here: its rows are client-owned (RLS by created_by_id) and cache per-transaction-date
    // rates from frankfurter.dev; a service-role row may not be visible to (or match the semantics of) the client cache.

    // The newest 500 cover far more than the 7 days pickNews looks at.
    const news = (((await db.NewsItem.filter({ owner_id: ownerId }, '-created_date', NEWS_LIMIT)) ?? []) as NewsRow[]).filter(
      (r) => r.owner_id === ownerId,
    );

    // 2. Numbers and news pick.
    const numbers = briefNumbers({ snapshot, today, investedThisMonthMinor, moves, eurHuf });
    const pickedIds = pickNews(
      news.map((r) => ({
        id: r.id,
        published_at: r.published_at ?? null,
        affects_portfolio: r.affects_portfolio === true,
        tags: Array.isArray(r.tags) ? r.tags : null,
      })),
      nowIso,
    );
    const byId = new Map(news.map((r) => [r.id, r]));
    const picked = pickedIds
      .map((id) => byId.get(id))
      .filter((r): r is NewsRow => !!r && typeof r.title === 'string' && !!r.title)
      .map((r) => ({ id: r.id, title: r.title!, summary: r.summary ?? '', source: r.source_name ?? '' }));

    // 3. One AI call within the daily cap.
    let ai: ReturnType<typeof normalizeBrief> | null = null;
    try {
      const usageDate = budapestDate(nowIso);
      const readUsage = async () =>
        (((await db.AiUsage.filter({ owner_id: ownerId, date: usageDate }, 'created_date', 50)) ?? []) as (UsageRow & {
          owner_id?: string;
        })[]).filter((r) => r.owner_id === ownerId);
      if ((await readUsage()).length === 0) await db.AiUsage.create({ owner_id: ownerId, date: usageDate, collect: 0, brief: 0 });
      // Re-read right before the call: an overlapping run may have used the last slot.
      const before = usageTotals(await readUsage());
      if (before.primary && before.brief < BRIEF_DAILY_CAP) {
        const prompt = buildBriefPrompt(
          numbers,
          picked,
          snapshot?.split ?? null,
          briefCatalogNames(snapshot?.split ?? null, (snapshot?.holdings ?? []).map((h) => h.name)),
        );
        let raw: unknown;
        try {
          raw = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt,
            response_json_schema: BRIEF_SCHEMA,
            model: MODEL,
          } as Parameters<typeof base44.asServiceRole.integrations.Core.InvokeLLM>[0]);
        } finally {
          // A call was made: count it even if it failed. Re-read to narrow the lost-update window.
          try {
            const now = usageTotals(await readUsage()).primary ?? before.primary;
            await db.AiUsage.update(now.id, { brief: (now.brief ?? 0) + 1 });
          } catch (err) {
            console.error('usage update failed', safeErr(err));
          }
        }
        ai = normalizeBrief(raw, new Set(picked.map((p) => p.id)), limitsFor(numbers));
      } else {
        summary.reason = 'ai_cap';
      }
    } catch (err) {
      ai = null;
      console.error('brief ai failed', safeErr(err));
    }
    summary.ai_ok = ai !== null;

    // 4. Notification text.
    const notification = ai?.notification ?? fallbackNotification(numbers);

    // 5. Create the digest: never a second one for the same date. Re-check right before the create.
    if ((await readDigests(today)).length > 0) return json({ ...summary, ran: false, reason: 'exists' });
    const willPush = me.digest_enabled === true && subs.length > 0;
    const created = (await db.DailyDigest.create({
      owner_id: ownerId,
      date: today,
      // usdHuf is additive: BriefNumbers has no slot for it, the client may show it.
      numbers: usdHuf ? { ...numbers, usdHuf } : numbers,
      notification,
      what_happened: ai?.what_happened ?? null,
      this_month: ai?.this_month ?? null,
      news_ids: ai?.news_ids ?? [],
      incomplete: numbers.incomplete,
      ai_ok: ai !== null,
      // Until the push completes the row says 'interrupted', so a run that dies mid-way never reads as 'skipped'.
      ...initialPushState(willPush),
    })) as { id: string };

    // An overlapping run may have created one too: keep the oldest, delete the rest.
    let kept = true;
    try {
      const dupes = duplicateIds(await readDigests(today), (r) => r.date);
      for (const id of dupes) {
        if (id === created.id) kept = false;
        await db.DailyDigest.delete(id).catch((err: unknown) => console.error('digest dedupe failed', safeErr(err)));
      }
    } catch (err) {
      console.error('digest dedupe read failed', safeErr(err));
    }
    if (!kept) return json({ ...summary, reason: 'duplicate' });

    // 6. Push.
    if (willPush) {
      const vapid = await loadVapid();
      let status: { status: 'sent' | 'failed' | 'skipped'; error: string | null };
      if (!vapid) {
        status = { status: 'failed', error: 'vapid_not_configured' };
      } else {
        const { kinds, firstFailed } = await pushAll(subs, { title: 'Morning brief', body: notification, url: `/brief/${today}` }, vapid);
        status = digestPushStatus(kinds, firstFailed);
      }
      summary.push_status = status.status;
      try {
        await db.DailyDigest.update(created.id, { push_status: status.status, push_error: status.error });
      } catch (err) {
        console.error('digest push status update failed', safeErr(err));
      }
    }

    console.log('morningBrief done', { mode, ...summary, incomplete: numbers.incomplete });
    return json(summary);
  } catch (err) {
    console.error('morningBrief error', safeErr(err));
    return json({ error: 'internal' }, 500);
  }
}
