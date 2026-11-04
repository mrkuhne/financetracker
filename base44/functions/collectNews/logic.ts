// Pure helpers for collectNews. No SDK imports, so vitest can cover them.
import { SEED_SOURCES, isExpired, newItems, type ParsedItem } from '../../shared/news.ts';

export const FETCH_BATCH = 6;
export const MAX_NEW_ITEMS = 40;
export const MAX_AI_ITEMS = 40;
export const COLLECT_DAILY_CAP = 10;
export const MAX_BODY_CHARS = 2_000_000;
export const DEFAULT_INTERVAL_HOURS = 4;

export type SourceRow = {
  id: string;
  name?: string;
  url?: string;
  default_tags?: string[];
  active?: boolean;
  last_fetched_at?: string | null;
  last_error?: string | null;
};

export type ItemRow = {
  id: string;
  link?: string;
  title?: string;
  source_name?: string;
  published_at?: string | null;
  created_date?: string;
  ai_done?: boolean;
};

export type PromptHolding = { name: string; asset_type: string; ticker: string | null; currency: string };

/** Empty body or no action -> scheduled; {action:'now'} -> now; anything else -> null (400). */
export function parseAction(body: unknown): 'scheduled' | 'now' | null {
  if (body == null || typeof body !== 'object') return 'scheduled';
  const action = (body as { action?: unknown }).action;
  if (action === undefined || action === null) return 'scheduled';
  return action === 'now' ? 'now' : null;
}

/** Today's calendar date in Budapest, 'YYYY-MM-DD'. */
export function budapestDate(nowIso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(nowIso),
  );
}

const SEED_URLS = new Set(SEED_SOURCES.map((s) => s.url));

export function isKnownSourceUrl(url: unknown): boolean {
  return typeof url === 'string' && SEED_URLS.has(url);
}

/** Active sources split into ones we may fetch and ones whose url is not a seed url. */
export function planFetch(sources: SourceRow[]): { fetch: SourceRow[]; unknown: SourceRow[] } {
  const fetch: SourceRow[] = [];
  const unknown: SourceRow[] = [];
  for (const s of sources) {
    if (s.active === false) continue;
    (isKnownSourceUrl(s.url) ? fetch : unknown).push(s);
  }
  return { fetch, unknown };
}

/** Latest last_fetched_at across sources, or null. */
export function lastRun(sources: SourceRow[]): string | null {
  let best: number | null = null;
  for (const s of sources) {
    const t = s.last_fetched_at ? Date.parse(s.last_fetched_at) : NaN;
    if (!Number.isNaN(t) && (best === null || t > best)) best = t;
  }
  return best === null ? null : new Date(best).toISOString();
}

export function intervalHours(raw: unknown): number {
  return typeof raw === 'number' && raw > 0 ? raw : DEFAULT_INTERVAL_HOURS;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function isHttpLink(link: unknown): link is string {
  return typeof link === 'string' && /^https?:\/\//i.test(link);
}

/** New items across all sources: http(s) links only, not already known, not already expired, newest first, capped. */
export function selectNewItems(
  perSource: { source: SourceRow; items: ParsedItem[] }[],
  knownLinks: Set<string>,
  nowIso: string,
  max = MAX_NEW_ITEMS,
): { source: SourceRow; item: ParsedItem }[] {
  const owner = new Map<string, SourceRow>();
  const all: ParsedItem[] = [];
  for (const { source, items } of perSource) {
    for (const it of items) {
      if (!isHttpLink(it.link)) continue;
      if (it.published_at && isExpired(it.published_at, nowIso)) continue;
      if (!owner.has(it.link)) owner.set(it.link, source);
      all.push(it);
    }
  }
  return newItems(all, knownLinks, max).map((item) => ({ source: owner.get(item.link)!, item }));
}

const itemTime = (r: ItemRow) => {
  const t = Date.parse(r.published_at ?? r.created_date ?? '');
  return Number.isNaN(t) ? -Infinity : t;
};

/** Unlabelled items, newest first (published_at, else created_date), capped. */
export function aiBatch(rows: ItemRow[], max = MAX_AI_ITEMS): ItemRow[] {
  return rows
    .filter((r) => r.ai_done !== true && typeof r.title === 'string' && r.title)
    .sort((a, b) => itemTime(b) - itemTime(a))
    .slice(0, Math.max(0, max));
}

/** Ids of items older than the retention window, by published_at, else created_date. */
export function expiredIds(rows: ItemRow[], nowIso: string): string[] {
  return rows
    .filter((r) => {
      const ref = r.published_at ?? r.created_date;
      return typeof ref === 'string' && !Number.isNaN(Date.parse(ref)) && isExpired(ref, nowIso);
    })
    .map((r) => r.id);
}

/** Holdings from the User's brief_snapshot, reduced to identifiers for the prompt. */
export function holdingsFromSnapshot(snapshot: unknown): PromptHolding[] {
  const list = (snapshot as { holdings?: unknown } | null | undefined)?.holdings;
  if (!Array.isArray(list)) return [];
  const out: PromptHolding[] = [];
  for (const h of list) {
    if (!h || typeof h !== 'object') continue;
    const { name, asset_type, quote_symbol, currency } = h as Record<string, unknown>;
    if (typeof name !== 'string' || !name) continue;
    out.push({
      name,
      asset_type: typeof asset_type === 'string' ? asset_type : 'other',
      ticker: typeof quote_symbol === 'string' && quote_symbol ? quote_symbol : null,
      currency: typeof currency === 'string' ? currency : 'HUF',
    });
  }
  return out;
}

/** Read a response body as text, giving up once it exceeds `max` chars. */
export async function readCappedText(res: Response, max = MAX_BODY_CHARS): Promise<{ ok: true; text: string } | { ok: false }> {
  const len = Number(res.headers.get('content-length'));
  if (Number.isFinite(len) && len > max * 4) {
    await res.body?.cancel().catch(() => {});
    return { ok: false };
  }
  if (!res.body) {
    const text = await res.text();
    return text.length > max ? { ok: false } : { ok: true, text };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.length > max) {
      await reader.cancel().catch(() => {});
      return { ok: false };
    }
  }
  text += decoder.decode();
  return text.length > max ? { ok: false } : { ok: true, text };
}
