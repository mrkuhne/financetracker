import { base44 } from '@/data/client';
import type { Account, Holding, InvestmentTxn, ISODate, PriceQuote, Txn } from '@/domain/types';
import { pick, stripNulls } from '@/data/records';
import { listAccounts } from '@/data/accounts';
import { getHufPerUnit } from '@/data/fx';
import { createTransaction, deleteTransaction, getTransaction, updateTransaction } from '@/data/transactions';
import { positionOf } from '@/domain/invest';
import { toHufMinor } from '@/domain/money';
import { findProduct } from '@/features/invest/catalog';
import { findSmsCandidates, payableAccounts, planSell, validateBuy, type BuyInput } from '@/features/invest/record';

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

function payable(accounts: Account[], id: string): Account {
  const account = payableAccounts(accounts).find((a) => a.id === id);
  if (!account) throw new Error('Pay from a current account or cash');
  return account;
}

function moneyTxn(kind: 'invest_buy' | 'invest_sell', account: Account, amountMinor: number, amountHufMinor: number, date: ISODate, note: string): Omit<Txn, 'id'> {
  return {
    account_id: account.id, kind, amount_minor: amountMinor, currency: account.currency, amount_huf_minor: amountHufMinor,
    category_id: null, date, note, source: 'manual', needs_review: false, recurring_rule_id: null, transfer_pair_id: null,
  };
}

/** Undo steps run newest first; each failure is logged so the original error still surfaces. */
async function rollback(steps: (() => Promise<unknown>)[]): Promise<void> {
  for (const step of steps.reverse()) {
    try {
      await step();
    } catch (e) {
      console.error('Investment rollback step failed', e);
    }
  }
}

/**
 * Record a buy: find or create the Holding (by product and platform), book the money movement as an
 * `invest_buy` Transaction and add the InvestmentTxn. `i.amountMinor` is in the pay-from account's
 * currency; the HUF value uses that day's rate. With `linkTxnId` the bank's SMS expense (one of
 * `findSmsCandidates`, re-checked here) becomes the buy instead of a second debit, and the buy takes
 * that transaction's (bank) date so it never carries two dates. A failure undoes what was written.
 */
export async function recordBuy(i: BuyInput, linkTxnId: string | null): Promise<void> {
  const accounts = await listAccounts();
  const error = validateBuy(i, accounts);
  if (error) throw new Error(error);
  const product = findProduct(i.productId)!;
  const account = payable(accounts, i.accountId);

  let linked: Txn | null = null;
  if (linkTxnId) {
    // Re-check with the same rules the candidate list used: it may have changed since it was shown.
    const fresh = await getTransaction(linkTxnId);
    if (!fresh || findSmsCandidates(i, [fresh], accounts).length === 0) {
      throw new Error('That bank payment no longer matches this buy');
    }
    linked = fresh;
  }

  const undo: (() => Promise<unknown>)[] = [];
  try {
    let holding = (await listHoldings()).find((h) => h.product_id === product.id && h.platform === i.platform);
    if (!holding) {
      const created = await createHolding({
        asset_type: product.type,
        product_id: product.id,
        name: product.name,
        ticker: product.quote_symbol,
        platform: i.platform,
        platform_name: i.platformName,
        currency: product.quote_currency ?? 'HUF',
        bond_rate_pct: product.type === 'bond' ? (i.bondRatePct ?? product.rate_pct) : null,
      });
      holding = created;
      undo.push(() => deleteHolding(created.id));
    }

    let txn: Txn;
    if (linked) {
      const before = linked;
      txn = await updateTransaction(before.id, { kind: 'invest_buy', category_id: null, needs_review: false, note: product.name });
      undo.push(() =>
        updateTransaction(before.id, { kind: before.kind, category_id: before.category_id, needs_review: before.needs_review, note: before.note ?? '' }),
      );
    } else {
      const amountHuf = toHufMinor(i.amountMinor, await getHufPerUnit(account.currency, i.date));
      txn = await createTransaction(moneyTxn('invest_buy', account, i.amountMinor, amountHuf, i.date, product.name));
      const createdId = txn.id;
      undo.push(() => deleteTransaction(createdId));
    }

    await createInvestmentTxn({
      holding_id: holding.id, side: 'buy', amount_huf_minor: txn.amount_huf_minor, quantity: i.quantity, price: i.price,
      currency: account.currency, date: linked ? linked.date : i.date, account_id: account.id, transaction_id: txn.id,
    });
  } catch (e) {
    await rollback(undo);
    throw e;
  }
}

/**
 * Record a sell of `holding`: an `invest_sell` Transaction into a checking/cash account plus the
 * InvestmentTxn. `i.amountMinor` is in that account's currency; its HUF value is checked against the
 * position by `planSell`. No SMS linking for credits. A failure undoes the Transaction.
 */
export async function recordSell(
  holding: Holding,
  i: { amountMinor: number; quantity: number | null; price: number | null; date: ISODate; accountId: string },
): Promise<void> {
  const account = payable(await listAccounts(), i.accountId);
  if (!Number.isInteger(i.amountMinor) || i.amountMinor <= 0) throw new Error('Enter the amount you received');
  const amountHuf = toHufMinor(i.amountMinor, await getHufPerUnit(account.currency, i.date));
  const error = planSell(positionOf(holding, await listInvestmentTxns()), { amountMinor: amountHuf, quantity: i.quantity });
  if (error) throw new Error(error);

  const txn = await createTransaction(moneyTxn('invest_sell', account, i.amountMinor, amountHuf, i.date, holding.name));
  try {
    await createInvestmentTxn({
      holding_id: holding.id, side: 'sell', amount_huf_minor: amountHuf, quantity: i.quantity, price: i.price,
      currency: account.currency, date: i.date, account_id: account.id, transaction_id: txn.id,
    });
  } catch (e) {
    await rollback([() => deleteTransaction(txn.id)]);
    throw e;
  }
}

/**
 * Delete an investment buy/sell and its money movement. A Transaction that came from a bank SMS is
 * not deleted (the debit really happened): it goes back to a normal expense (income for a sell)
 * awaiting review. The Holding is deleted once it has no txns left. Safe to retry after a failure.
 */
export async function deleteInvestmentTxn(t: InvestmentTxn): Promise<void> {
  const txn = await getTransaction(t.transaction_id);
  if (txn && (txn.kind === 'invest_buy' || txn.kind === 'invest_sell')) {
    if (txn.sms_message_id) {
      await updateTransaction(txn.id, { kind: txn.kind === 'invest_buy' ? 'expense' : 'income', needs_review: true });
    } else {
      await deleteTransaction(txn.id);
    }
  }
  await deleteInvestmentTxnRow(t.id);
  if (!(await listInvestmentTxns()).some((x) => x.holding_id === t.holding_id)) await deleteHolding(t.holding_id);
}
