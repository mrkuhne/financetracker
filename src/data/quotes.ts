import { base44 } from '@/data/client';
import { listQuotes, upsertQuote } from '@/data/investments';
import type { ISODate, PriceQuote } from '@/domain/types';

interface FetchedQuote { symbol: string; price: number; currency: string; as_of: string }

/** One quote per ticker: when duplicate rows exist, the latest as_of wins. */
function latestPerTicker(rows: PriceQuote[]): PriceQuote[] {
  const best = new Map<string, PriceQuote>();
  for (const q of rows) {
    const cur = best.get(q.ticker);
    if (!cur || q.as_of > cur.as_of) best.set(q.ticker, q);
  }
  return [...best.values()];
}

/**
 * Returns the cached quotes, first refreshing those older than `today` through the `quotes`
 * function. Errors are swallowed: the old cache stays and the app shows "Price not updated".
 */
export async function refreshQuotes(symbols: string[], today: ISODate): Promise<PriceQuote[]> {
  const wanted = [...new Set(symbols)];
  if (wanted.length === 0) return [];
  let cached = latestPerTicker(await listQuotes(wanted));
  const fresh = new Set(cached.filter((q) => q.as_of >= today).map((q) => q.ticker));
  const stale = wanted.filter((s) => !fresh.has(s));
  if (stale.length === 0) return cached;
  try {
    const res = (await base44.functions.invoke('quotes', { symbols: stale })) as unknown;
    const body = ((res as { data?: unknown } | null)?.data ?? res) as { quotes?: FetchedQuote[] } | null;
    const fetched = Array.isArray(body?.quotes) ? body.quotes : [];
    for (const f of fetched) {
      await upsertQuote({ ticker: f.symbol, price: f.price, currency: f.currency, as_of: f.as_of });
    }
    if (fetched.length > 0) cached = latestPerTicker(await listQuotes(wanted));
  } catch (err) {
    console.error('quote refresh failed', (err as { message?: string } | null)?.message);
  }
  return cached;
}
