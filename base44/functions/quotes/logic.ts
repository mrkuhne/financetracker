// Pure logic for the quotes function. Web-standard globals only (Deno + Node 20).
// No npm:/jsr: imports and nothing from src/; only the import-free base44/shared helpers.

const SYMBOL_RE = /^[A-Za-z0-9.\-=^]{1,20}$/;

/** 1-20 symbols, each matching SYMBOL_RE; null when the body is invalid. */
export function validateSymbols(body: unknown): string[] | null {
  const symbols = (body as { symbols?: unknown } | null)?.symbols;
  if (!Array.isArray(symbols) || symbols.length < 1 || symbols.length > 20) return null;
  if (!symbols.every((s) => typeof s === 'string' && SYMBOL_RE.test(s))) return null;
  return symbols as string[];
}

// Chart helpers live in base44/shared/chart.ts (also used by morningBrief); re-exported so callers stay unchanged.
export { chartUrl, parseChart } from '../../shared/chart.ts';
