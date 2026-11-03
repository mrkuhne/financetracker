import { base44 } from '@/data/client';
import type { Holding, InvestmentTxn, PriceQuote } from '@/domain/types';
import { pick, stripNulls } from '@/data/records';

const HOLDING_KEYS = ['asset_type', 'product_id', 'name', 'ticker', 'platform', 'platform_name', 'currency', 'bond_rate_pct'];
const HOLDING_NULLABLE = ['ticker', 'platform_name', 'bond_rate_pct'];
const toHolding = (r: Record<string, unknown>): Holding => pick<Holding>(r, HOLDING_KEYS, HOLDING_NULLABLE);

const TXN_KEYS = ['holding_id', 'side', 'amount_huf_minor', 'quantity', 'price', 'currency', 'date', 'account_id', 'transaction_id'];
const TXN_NULLABLE = ['quantity', 'price'];
const toTxn = (r: Record<string, unknown>): InvestmentTxn => pick<InvestmentTxn>(r, TXN_KEYS, TXN_NULLABLE);

const QUOTE_KEYS = ['ticker', 'price', 'currency', 'as_of'];
const toQuote = (r: Record<string, unknown>): PriceQuote => pick<PriceQuote>(r, QUOTE_KEYS);

export async function listHoldings(): Promise<Holding[]> {
  return (await base44.entities.Holding.list()).map(toHolding);
}
export async function createHolding(h: Omit<Holding, 'id'>): Promise<Holding> {
  return toHolding(await base44.entities.Holding.create(stripNulls(h)));
}
export async function updateHolding(id: string, patch: Partial<Omit<Holding, 'id'>>): Promise<Holding> {
  return toHolding(await base44.entities.Holding.update(id, patch));
}
export async function deleteHolding(id: string): Promise<void> {
  await base44.entities.Holding.delete(id);
}

export async function listInvestmentTxns(): Promise<InvestmentTxn[]> {
  return (await base44.entities.InvestmentTransaction.list()).map(toTxn);
}
export async function createInvestmentTxn(t: Omit<InvestmentTxn, 'id'>): Promise<InvestmentTxn> {
  return toTxn(await base44.entities.InvestmentTransaction.create(stripNulls(t)));
}
export async function deleteInvestmentTxnRow(id: string): Promise<void> {
  await base44.entities.InvestmentTransaction.delete(id);
}

export async function listQuotes(tickers: string[]): Promise<PriceQuote[]> {
  if (tickers.length === 0) return [];
  const wanted = new Set(tickers);
  return (await base44.entities.PriceQuote.list()).map(toQuote).filter((q) => wanted.has(q.ticker));
}

/** One row per ticker: updates the existing row, creates one otherwise. */
export async function upsertQuote(q: Omit<PriceQuote, 'id'>): Promise<void> {
  const existing = await base44.entities.PriceQuote.filter({ ticker: q.ticker });
  if (existing.length > 0) await base44.entities.PriceQuote.update(existing[0].id, q);
  else await base44.entities.PriceQuote.create(q);
}
