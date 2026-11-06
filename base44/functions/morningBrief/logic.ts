// Pure helpers for the morningBrief run. No npm:/jsr: imports, so vitest can cover them.
import { changeOver, parseCloses } from '../../shared/chart.ts';
import { WORLD_ETF_SYMBOL, type BriefSnapshot, type Move } from './brief.ts';

export const BRIEF_DAILY_CAP = 2;
export const FETCH_BATCH = 6;

export type Payload = { title: string; body: string; url: string };
export const TEST_PAYLOAD: Payload = { title: 'Morning brief', body: 'Test notification from Finance Tracker.', url: '/news' };

/** Empty body or no action -> scheduled; 'test', 'now' and 'analyze' as named; anything else -> null (400). */
export function parseBriefAction(body: unknown): 'scheduled' | 'test' | 'now' | 'analyze' | null {
  if (body == null || typeof body !== 'object') return 'scheduled';
  const action = (body as { action?: unknown }).action;
  if (action === undefined || action === null) return 'scheduled';
  return action === 'test' || action === 'now' || action === 'analyze' ? action : null;
}

/** {action:'analyze', id, refresh?}: the news item id, or null when it is missing or not a non-empty string. */
export function parseAnalyzeBody(body: unknown): { id: string; refresh: boolean } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { id?: unknown; refresh?: unknown };
  if (typeof b.id !== 'string' || !b.id) return null;
  return { id: b.id, refresh: b.refresh === true };
}

/** A news row may be analysed only by its owner (NewsItem is never client-creatable, so owner_id is trustworthy). */
export function canAnalyze(row: { id?: string; owner_id?: string } | null | undefined, ownerId: string): boolean {
  return !!row && row.owner_id === ownerId;
}

/** The User's brief_snapshot when it has the shape briefNumbers relies on, else null. */
export function asSnapshot(raw: unknown): BriefSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<BriefSnapshot>;
  if (typeof s.month !== 'string' || !Array.isArray(s.holdings)) return null;
  if (!s.suggestion || typeof s.suggestion !== 'object') return null;
  return raw as BriefSnapshot;
}

/** Chart symbols to fetch: the non-bond holdings' quote symbols, or the world ETF when holdings are empty/unknown. */
export function marketSymbols(snapshot: BriefSnapshot | null): string[] {
  const holdings = snapshot?.holdings ?? [];
  if (holdings.length === 0) return [WORLD_ETF_SYMBOL];
  const out = new Set<string>();
  for (const h of holdings) if (h.asset_type !== 'bond' && typeof h.quote_symbol === 'string' && h.quote_symbol) out.add(h.quote_symbol);
  return [...out];
}

export function needsUsd(snapshot: BriefSnapshot | null): boolean {
  return (snapshot?.holdings ?? []).some((h) => h.currency === 'USD');
}

/** Sum of the user's own buys dated in `month` ('YYYY-MM'). InvestmentTransaction rows are client-created: trust created_by_id. */
export function monthBuysMinor(
  rows: { created_by_id?: string; side?: unknown; date?: unknown; amount_huf_minor?: unknown }[],
  userId: string,
  month: string,
): number {
  let sum = 0;
  for (const r of rows) {
    if (r.created_by_id !== userId || r.side !== 'buy') continue;
    if (typeof r.date !== 'string' || r.date.slice(0, 7) !== month) continue;
    if (typeof r.amount_huf_minor !== 'number' || !Number.isFinite(r.amount_huf_minor)) continue;
    sum += r.amount_huf_minor;
  }
  return sum;
}

export function minusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function frankfurterUrls(from: 'EUR' | 'USD', today: string): { latest: string; weekAgo: string } {
  return {
    latest: `https://api.frankfurter.app/latest?from=${from}&to=HUF`,
    weekAgo: `https://api.frankfurter.app/${minusDays(today, 7)}?from=${from}&to=HUF`,
  };
}

export function parseFrankfurterRate(json: unknown): number | null {
  const v = (json as { rates?: { HUF?: unknown } } | null)?.rates?.HUF;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

export function fxFromRates(latest: number | null, weekAgo: number | null): { rate: number; weekChange: number | null } | null {
  if (latest === null) return null;
  return { rate: latest, weekChange: weekAgo === null ? null : latest / weekAgo - 1 };
}

export function movesFromChart(json: unknown): Move {
  const closes = parseCloses(json);
  return { day: changeOver(closes, 1), week: changeOver(closes, 7) };
}

export type DigestRow = { id: string; date?: string; notification?: string | null; created_date?: string };

/** The digest with the newest date; among same-date duplicates the oldest row (the one dedupe keeps). */
export function latestDigest<T extends DigestRow>(rows: T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (typeof r.date !== 'string') continue;
    if (!best || r.date > best.date! || (r.date === best.date && (r.created_date ?? '') < (best.created_date ?? ''))) best = r;
  }
  return best;
}

/** {action:'test'}: the latest digest's notification, else the fixed test text. */
export function testPayload(digest: DigestRow | null): Payload {
  if (digest && typeof digest.date === 'string' && typeof digest.notification === 'string' && digest.notification.trim()) {
    return { title: 'Morning brief', body: digest.notification, url: `/brief/${digest.date}` };
  }
  return TEST_PAYLOAD;
}
