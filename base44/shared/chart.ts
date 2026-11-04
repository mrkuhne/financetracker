// Yahoo chart helpers shared by the quotes and morningBrief functions (via `../../shared/chart.ts`).
// No imports on purpose: functions bundle this file on its own. Web-standard globals only (Deno + Node 20).

/** Yahoo chart endpoint. The quotes function uses the default `1d` range; the brief asks for `1mo` of daily closes. */
export function chartUrl(symbol: string, range = '1d'): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=1d`;
}

/** YYYY-MM-DD of an ISO instant in Budapest. */
export function budapestDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function parseChart(
  _symbol: string,
  json: unknown,
): { price: number; currency: string; as_of: string } | null {
  const meta = (json as { chart?: { result?: { meta?: Record<string, unknown> }[] | null } } | null)?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const { regularMarketPrice: price, currency, regularMarketTime: time } = meta;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
  if (typeof currency !== 'string' || !currency) return null;
  if (typeof time !== 'number' || !Number.isFinite(time)) return null;
  return { price, currency, as_of: budapestDate(new Date(time * 1000).toISOString()) };
}

type ChartJson = {
  chart?: { result?: { timestamp?: unknown; indicators?: { quote?: { close?: unknown }[] } }[] | null };
} | null;

/**
 * Daily closes from a chart response, oldest first, dated by Budapest. Null/invalid closes are skipped;
 * when two closes fall on the same Budapest date the later one wins.
 */
export function parseCloses(json: unknown): { date: string; close: number }[] {
  const result = (json as ChartJson)?.chart?.result?.[0];
  const ts = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(closes)) return [];
  const byDate = new Map<string, { t: number; close: number }>();
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const c = closes[i];
    if (typeof t !== 'number' || !Number.isFinite(t)) continue;
    if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) continue;
    const date = budapestDate(new Date(t * 1000).toISOString());
    const prev = byDate.get(date);
    if (!prev || t >= prev.t) byDate.set(date, { t, close: c });
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, v]) => ({ date, close: v.close }));
}

function minusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Change of the last close against the last close at least `days` calendar days earlier, as a ratio
 * (0.008 = +0.8%). `days = 1` is the day change (previous close), `days = 7` the week change.
 * Null when there is no such earlier close.
 */
export function changeOver(closes: { date: string; close: number }[], days: number): number | null {
  if (closes.length < 2) return null;
  const last = closes[closes.length - 1];
  const cutoff = minusDays(last.date, days);
  for (let i = closes.length - 2; i >= 0; i--) {
    if (closes[i].date <= cutoff) return last.close / closes[i].close - 1;
  }
  return null;
}
