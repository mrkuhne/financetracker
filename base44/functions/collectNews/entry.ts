import { createClientFromRequest } from 'npm:@base44/sdk';
import { COLLECT_SCHEMA, buildCollectPrompt, normalizeCollect, parseFeed, type ParsedItem } from '../../shared/news.ts';
import {
  COLLECT_DAILY_CAP,
  FETCH_BATCH,
  aiBatch,
  continueExpiry,
  expiredIds,
  holdingsFromSnapshot,
  intervalHours,
  isDue,
  lastRun,
  missingSeeds,
  parseAction,
  planFetch,
  readCappedText,
  selectNewItems,
  type ItemRow,
  type SourceRow,
} from './logic.ts';
import { budapestDate } from '../../shared/chart.ts';
import { chunk, duplicateIds, usageTotals, type UsageRow } from '../../shared/rows.ts';

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

type Me = { id: string; news_interval_hours?: number; brief_snapshot?: unknown };

const ROW_LIMIT = 5000;
// Feeds only carry their recent items (typically the last days), so a link that can reappear in a feed was stored
// within far fewer than the newest 2000 rows (~150-250 new items/day). Older rows can't collide with feed items.
const KNOWN_LINKS_LIMIT = 2000;
// Expiry walks the table oldest-first in pages, bounded per run; a backlog drains over the next runs.
const EXPIRY_PAGE = 500;
const EXPIRY_MAX_PAGES = 5;

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
    const readSources = async () =>
      (((await db.NewsSource.filter({ owner_id: ownerId }, 'created_date', ROW_LIMIT)) ?? []) as (SourceRow & { owner_id?: string })[]).filter(
        (s) => s.owner_id === ownerId,
      );
    // Collect regardless of digest_enabled: the News tab promises news on its own (AI calls are capped per day).
    let sources: SourceRow[] = await readSources();

    // 1. Seed: top up any missing seed urls, then drop newer duplicates (an overlapping run may have seeded too).
    const toSeed = missingSeeds(sources);
    if (toSeed.length) {
      for (const s of toSeed) {
        await db.NewsSource.create({
          owner_id: ownerId,
          name: s.name,
          url: s.url,
          default_tags: s.default_tags,
          active: true,
          last_fetched_at: null,
          last_error: null,
        });
      }
      sources = await readSources();
      const dupes = new Set(duplicateIds(sources, (s) => s.url));
      for (const id of dupes) {
        await db.NewsSource.delete(id).catch((err: unknown) => console.error('source dedupe failed', safeErr(err)));
      }
      sources = sources.filter((s) => !dupes.has(s.id));
    }

    // 2. Interval gate (scheduled path only).
    if (mode === 'scheduled' && !isDue(lastRun(sources), nowIso, intervalHours(me.news_interval_hours))) {
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
          if ('items' in r && r.items && r.items.length === 0) {
            // A dead feed: record it, but advance last_fetched_at so it isn't hammered every run.
            summary.errors++;
            console.error('news feed empty', { source_id: r.source.id });
            await db.NewsSource.update(r.source.id, { last_fetched_at: nowIso, last_error: 'empty feed' });
          } else if ('items' in r && r.items) {
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
    const readItems = async () =>
      (((await db.NewsItem.filter({ owner_id: ownerId }, '-created_date', KNOWN_LINKS_LIMIT)) ?? []) as (ItemRow & { owner_id?: string })[]).filter(
        (r) => r.owner_id === ownerId,
      );
    const mine = await readItems();
    const removed = new Set<string>();
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
      // An overlapping run may have created the same links: keep the oldest row per link.
      try {
        const dupes = duplicateIds(await readItems(), (r) => r.link);
        for (const id of dupes) {
          try {
            await db.NewsItem.delete(id);
            removed.add(id);
          } catch (err) {
            console.error('news dedupe failed', safeErr(err));
          }
        }
        summary.created = Math.max(0, summary.created - dupes.length);
      } catch (err) {
        console.error('news dedupe read failed', safeErr(err));
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
        const readUsage = async () =>
          (((await db.AiUsage.filter({ owner_id: ownerId, date }, 'created_date', 50)) ?? []) as (UsageRow & { owner_id?: string })[]).filter(
            (r) => r.owner_id === ownerId,
          );
        if ((await readUsage()).length === 0) await db.AiUsage.create({ owner_id: ownerId, date, collect: 0, brief: 0 });
        // Re-read right before the call: an overlapping run may have used the last slot.
        const before = usageTotals(await readUsage());
        if (before.primary && before.collect < COLLECT_DAILY_CAP) {
          const prompt = buildCollectPrompt(
            batch.map((r, i) => ({ i, title: r.title!, source: r.source_name ?? '' })),
            holdingsFromSnapshot(me.brief_snapshot),
          );
          let raw: unknown;
          try {
            raw = await base44.asServiceRole.integrations.Core.InvokeLLM({
              prompt,
              response_json_schema: COLLECT_SCHEMA,
              // No model: the Automatic preset is the cheap default the spec asks for.
            } as Parameters<typeof base44.asServiceRole.integrations.Core.InvokeLLM>[0]);
          } finally {
            // A call was made: count it even if it failed. Re-read to narrow the lost-update window.
            try {
              const now = usageTotals(await readUsage()).primary ?? before.primary;
              await db.AiUsage.update(now.id, { collect: (now.collect ?? 0) + 1 });
            } catch (err) {
              console.error('usage update failed', safeErr(err));
            }
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

    // 6. Delete expired items: oldest first, re-reading while a full page still yields expired rows (bounded).
    try {
      for (let page = 0; page < EXPIRY_MAX_PAGES; page++) {
        const raw = ((await db.NewsItem.filter({ owner_id: ownerId }, 'created_date', EXPIRY_PAGE)) ?? []) as (ItemRow & {
          owner_id?: string;
        })[];
        const oldest = raw.filter((r) => r.owner_id === ownerId);
        const ids = expiredIds(oldest, nowIso).filter((id) => !removed.has(id));
        let failed = false;
        for (const id of ids) {
          try {
            await db.NewsItem.delete(id);
            removed.add(id);
            summary.deleted++;
          } catch (err) {
            failed = true;
            console.error('news delete failed', safeErr(err));
          }
        }
        if (!continueExpiry(raw.length, ids.length, EXPIRY_PAGE) || failed) break;
      }
    } catch (err) {
      summary.errors++;
      console.error('news expiry failed', safeErr(err));
    }

    console.log('collectNews done', { mode, ...summary });
    return json(summary);
  } catch (err) {
    console.error('collectNews error', safeErr(err));
    return json({ error: 'internal' }, 500);
  }
}
