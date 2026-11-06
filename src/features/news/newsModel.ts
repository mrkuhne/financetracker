export interface NewsRow {
  id: string;
  source_id: string;
  source_name: string;
  title: string;
  title_hu: string | null;
  link: string;
  published_at: string | null;
  summary: string | null;
  tags: string[];
  affects_portfolio: boolean;
}

/** Hungarian title when the AI produced one, else the English headline. */
export function displayTitle(n: Pick<NewsRow, 'title' | 'title_hu'>): string {
  return n.title_hu?.trim() || n.title || 'Untitled';
}

export const NEWS_FILTERS = ['Mine', 'All', 'Rates', 'Forint', 'Markets', 'Housing'] as const;
export type NewsFilter = (typeof NEWS_FILTERS)[number];

const FILTER_TAGS: Record<Exclude<NewsFilter, 'Mine' | 'All'>, string[]> = {
  Rates: ['rates', 'inflation'],
  Forint: ['forint', 'hungary'],
  Markets: ['markets', 'etf', 'stocks', 'bonds', 'crypto'],
  Housing: ['housing'],
};

export function filterNews<T extends Pick<NewsRow, 'tags' | 'affects_portfolio'>>(items: T[], filter: NewsFilter): T[] {
  if (filter === 'All') return items;
  if (filter === 'Mine') return items.filter((i) => i.affects_portfolio === true);
  const want = FILTER_TAGS[filter];
  return items.filter((i) => Array.isArray(i.tags) && i.tags.some((t) => want.includes(t)));
}

const HOUR_MS = 60 * 60 * 1000;

/** "now" under an hour (or in the future), then "N h", then "N d". Empty when the time is unknown. */
export function ago(publishedIso: string | null, nowIso: string): string {
  if (!publishedIso) return '';
  const diff = Date.parse(nowIso) - Date.parse(publishedIso);
  if (!Number.isFinite(diff)) return '';
  if (diff < HOUR_MS) return 'now';
  const h = Math.floor(diff / HOUR_MS);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

/** Ratio -> "+0.6%" / "−0.4%" (U+2212) / "0.0%", one decimal; "no data" when missing. */
export function pctLabel(x: number | null): string {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 'no data';
  const v = Math.round(x * 1000) / 10;
  if (v === 0) return '0.0%';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
}

/** Only http(s) links are rendered. */
export function safeLink(link: unknown): string | null {
  return typeof link === 'string' && /^https?:\/\//i.test(link) ? link : null;
}

/** The row's chip: portfolio items first, else the first tag. */
export function newsChip(i: Pick<NewsRow, 'tags' | 'affects_portfolio'>): { label: string; mine: boolean } | null {
  if (i.affects_portfolio) return { label: 'Yours', mine: true };
  const t = Array.isArray(i.tags) ? i.tags.find((x) => typeof x === 'string' && x.length > 0) : undefined;
  return t ? { label: t[0].toUpperCase() + t.slice(1), mine: false } : null;
}

/** "Wed 4 Nov" for an ISO date. */
export function briefTitle(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Brief';
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return 'Brief';
  const wd = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const mo = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${wd} ${d.getUTCDate()} ${mo}`;
}

/** Empty-state copy for the News tab's brief card, using the user's digest time. */
export function firstBriefCopy(digestTime: string, tz: string, now: Date = new Date(), first = true): string {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(digestTime) ? digestTime : '07:00';
  let current = '00:00';
  try {
    current = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  } catch {
    /* unknown zone: assume the time has not passed */
  }
  return `Your ${first ? 'first' : 'next'} brief arrives ${current < time ? 'today' : 'tomorrow'} at ${time}.`;
}

// ---- Digest numbers, parsed defensively (the stored object is server-written JSON). ----

export type Move = { day: number | null; week: number | null };
export type Fx = { rate: number; weekChange: number | null };
export interface HoldingMove { name: string; asset_type: string; day: number | null; week: number | null; fixed: boolean }
export interface NumbersView {
  stale: boolean;
  holdingsKnown: boolean;
  holdings: HoldingMove[];
  eurHuf: Fx | null;
  usdHuf: Fx | null;
  market: Move | null;
  portfolioWeek: number | null;
  month: { suggestedMinor: number | null; investedMinor: number | null; leftMinor: number | null; pullForwardRoomMinor: number | null } | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function fx(v: unknown): Fx | null {
  const o = obj(v);
  const rate = num(o?.rate);
  return o && rate !== null ? { rate, weekChange: num(o.weekChange) } : null;
}

export function parseNumbers(raw: unknown): NumbersView | null {
  const o = obj(raw);
  if (!o) return null;
  const holdings: HoldingMove[] = Array.isArray(o.holdings)
    ? o.holdings.flatMap((h) => {
        const r = obj(h);
        if (!r || typeof r.name !== 'string' || !r.name) return [];
        return [{
          name: r.name,
          asset_type: typeof r.asset_type === 'string' ? r.asset_type : '',
          day: num(r.day),
          week: num(r.week),
          fixed: r.fixed === true,
        }];
      })
    : [];
  const m = obj(o.month);
  const mk = obj(o.market);
  return {
    stale: o.stale === true,
    holdingsKnown: o.holdingsKnown === true,
    holdings,
    eurHuf: fx(o.eurHuf),
    usdHuf: fx(o.usdHuf),
    market: mk ? { day: num(mk.day), week: num(mk.week) } : null,
    portfolioWeek: num(o.portfolioWeek),
    month: m
      ? {
          suggestedMinor: num(m.suggestedMinor),
          investedMinor: num(m.investedMinor),
          leftMinor: num(m.leftMinor),
          pullForwardRoomMinor: num(m.pullForwardRoomMinor),
        }
      : null,
  };
}
