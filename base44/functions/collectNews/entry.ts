import { createClientFromRequest } from 'npm:@base44/sdk';
import { COLLECT_SCHEMA, SEED_SOURCES, buildCollectPrompt, collectDue, normalizeCollect, parseFeed, type ParsedItem } from '../../shared/news.ts';
import {
  COLLECT_DAILY_CAP,
  FETCH_BATCH,
  aiBatch,
  budapestDate,
  chunk,
  expiredIds,
  holdingsFromSnapshot,
  intervalHours,
  lastRun,
  parseAction,
  planFetch,
  readCappedText,
  selectNewItems,
  type ItemRow,
  type SourceRow,
} from './logic.ts';

// Log only safe fields, never payloads.
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

type Me = { id: string; digest_enabled?: boolean; news_interval_hours?: number; brief_snapshot?: unknown };
type UsageRow = { id: string; collect?: number; brief?: number };

const MODEL = 'gemini_3_8_flash';
const ROW_LIMIT = 5000;

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const body = await req.json().catch(() => ({}));
    const mode = parseAction(body);
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
    const nowIso = new Date().toISOString();
    const summary = { ran: false as boolean, reason: undefined as string | undefined, fetched: 0, created: 0, summarized: 0, deleted: 0, errors: 0 };

    // NewsSource/NewsItem/AiUsage are never client-creatable, so owner_id alone is trustworthy.
    let sources = ((await db.NewsSource.filter({ owner_id: ownerId }, 'created_date', ROW_LIMIT)) ?? []) as SourceRow[];
    sources = sources.filter((s) => (s as { owner_id?: string }).owner_id === ownerId);

    if (mode === 'scheduled' && me.digest_enabled !== true && sources.length === 0) {
      return json({ ...summary, reason: 'disabled' });
    }

    // 1. Seed the sources if none exist.
    if (sources.length === 0) {
      for (const s of SEED_SOURCES) {
        const row = (await db.NewsSource.create({
          owner_id: ownerId,
          name: s.name,
          url: s.url,
          default_tags: s.default_tags,
          active: true,
          last_fetched_at: null,
          last_error: null,
        })) as SourceRow;
        sources.push(row);
      }
    }

    // 2. Interval gate (scheduled path only).
    if (mode === 'scheduled' && !collectDue(lastRun(sources), nowIso, intervalHours(me.news_interval_hours))) {
      return json({ ...summary, reason: 'not_due' });
    }
    summary.ran = true;

    // 3. Fetch known sources in small batches; never fetch a url that isn't a seed url.
    const plan = planFetch(sources);
    for (const s of plan.unknown) {
      summary.errors++;
      if (s.last_error !== 'unknown source') {
        await db.NewsSource.update(s.id, { last_error: 'unknown source' }).catch((err: unknown) =>
          console.error('source update failed', safeErr(err)),
        );
      }
    }

    const perSource: { source: SourceRow; items: ParsedItem[] }[] = [];
    for (const batch of chunk(plan.fetch, FETCH_BATCH)) {
      const results = await Promise.all(
        batch.map(async (source) => {
          try {
            const res = await fetch(source.url!, {
              headers: { 'user-agent': 'Mozilla/5.0 (FinanceTracker news)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
              signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) {
              await res.body?.cancel().catch(() => {});
              return { source, error: `http ${res.status}` };
            }
            const read = await readCappedText(res);
            if (!read.ok) return { source, error: 'too large' };
            return { source, items: parseFeed(read.text) };
          } catch (err) {
            const e = safeErr(err);
            return { source, error: e.name === 'TimeoutError' ? 'timeout' : 'fetch failed' };
          }
        }),
      );
      for (const r of results) {
        try {
          if ('items' in r && r.items) {
            summary.fetched++;
            perSource.push({ source: r.source, items: r.items });
            await db.NewsSource.update(r.source.id, { last_fetched_at: nowIso, last_error: null });
          } else {
            summary.errors++;
            console.error('news fetch failed', { source_id: r.source.id, error: r.error });
            await db.NewsSource.update(r.source.id, { last_error: r.error ?? 'fetch failed' });
          }
        } catch (err) {
          console.error('source update failed', safeErr(err));
        }
      }
    }

    // 4. New items by link.
    const existing = ((await db.NewsItem.filter({ owner_id: ownerId }, '-created_date', ROW_LIMIT)) ?? []) as (ItemRow & {
      owner_id?: string;
    })[];
    const mine = existing.filter((r) => r.owner_id === ownerId);
    const known = new Set(mine.map((r) => r.link).filter((l): l is string => typeof l === 'string'));
    const fresh = selectNewItems(perSource, known, nowIso);
    if (fresh.length) {
      try {
        const created = await db.NewsItem.bulkCreate(
          fresh.map(({ source, item }) => ({
            owner_id: ownerId,
            source_id: source.id,
            source_name: source.name ?? '',
            title: item.title,
            link: item.link,
            published_at: item.published_at,
            summary: null,
            tags: Array.isArray(source.default_tags) ? source.default_tags : [],
            affects_portfolio: false,
            ai_done: false,
          })),
        );
        summary.created = Array.isArray(created) ? created.length : fresh.length;
      } catch (err) {
        summary.errors++;
        console.error('news create failed', { count: fresh.length, ...safeErr(err) });
      }
    }

    // 5. One AI labelling call, within the daily cap.
    try {
      const pendingRows = ((await db.NewsItem.filter({ owner_id: ownerId, ai_done: false }, '-created_date', 500)) ?? []) as (ItemRow & {
        owner_id?: string;
      })[];
      const batch = aiBatch(pendingRows.filter((r) => r.owner_id === ownerId));
      if (batch.length) {
        const date = budapestDate(nowIso);
        const usageRows = ((await db.AiUsage.filter({ owner_id: ownerId, date }, '-created_date', 5)) ?? []) as UsageRow[];
        let usage = usageRows[0];
        if (!usage) usage = (await db.AiUsage.create({ owner_id: ownerId, date, collect: 0, brief: 0 })) as UsageRow;
        const used = usage.collect ?? 0;
        if (used < COLLECT_DAILY_CAP) {
          const prompt = buildCollectPrompt(
            batch.map((r, i) => ({ i, title: r.title!, source: r.source_name ?? '' })),
            holdingsFromSnapshot(me.brief_snapshot),
          );
          let raw: unknown;
          try {
            raw = await base44.asServiceRole.integrations.Core.InvokeLLM({
              prompt,
              response_json_schema: COLLECT_SCHEMA,
              model: MODEL,
            } as Parameters<typeof base44.asServiceRole.integrations.Core.InvokeLLM>[0]);
          } finally {
            // A call was made: count it even if it failed.
            await db.AiUsage.update(usage.id, { collect: used + 1 }).catch((err: unknown) =>
              console.error('usage update failed', safeErr(err)),
            );
          }
          const entries = normalizeCollect(raw, batch.length);
          for (let i = 0; i < batch.length; i++) {
            const e = entries[i];
            if (!e) continue;
            try {
              await db.NewsItem.update(batch[i].id, { summary: e.summary, tags: e.tags, affects_portfolio: e.affects_portfolio, ai_done: true });
              summary.summarized++;
            } catch (err) {
              console.error('news label update failed', safeErr(err));
            }
          }
        } else {
          summary.reason = 'ai_cap';
        }
      }
    } catch (err) {
      summary.errors++;
      console.error('news ai failed', safeErr(err));
    }

    // 6. Delete expired items.
    for (const id of expiredIds(mine, nowIso)) {
      try {
        await db.NewsItem.delete(id);
        summary.deleted++;
      } catch (err) {
        console.error('news delete failed', safeErr(err));
      }
    }

    console.log('collectNews done', { mode, ...summary });
    return json(summary);
  } catch (err) {
    console.error('collectNews error', safeErr(err));
    return json({ error: 'internal' }, 500);
  }
}
