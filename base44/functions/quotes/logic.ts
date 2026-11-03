// Pure logic for the quotes function. Web-standard globals only (Deno + Node 20).
// Intentionally self-contained: no npm:/jsr: imports, nothing from src/.

const SYMBOL_RE = /^[A-Za-z0-9.\-=^]{1,20}$/;

/** 1-20 symbols, each matching SYMBOL_RE; null when the body is invalid. */
export function validateSymbols(body: unknown): string[] | null {
  const symbols = (body as { symbols?: unknown } | null)?.symbols;
  if (!Array.isArray(symbols) || symbols.length < 1 || symbols.length > 20) return null;
  if (!symbols.every((s) => typeof s === 'string' && SYMBOL_RE.test(s))) return null;
  return symbols as string[];
}

export function chartUrl(symbol: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
}

function budapestDate(iso: string): string {
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
