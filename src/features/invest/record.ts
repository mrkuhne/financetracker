import { daysBetweenInclusive } from '@/domain/dates';
import type { Position } from '@/domain/invest';
import type { Account, ISODate, Platform, Txn } from '@/domain/types';
import { findProduct } from './catalog';

/** Days either side of a buy within which its bank SMS may land. */
export const SMS_MATCH_DAYS = 3;

/**
 * A buy as the user enters it. `amountMinor` is in the pay-from ACCOUNT's currency (accounts may be
 * EUR); the HUF value is derived at record time. `bondRatePct` overrides the catalog rate for bonds.
 */
export interface BuyInput {
  productId: string; amountMinor: number; quantity: number | null; price: number | null;
  date: ISODate; platform: Platform; platformName: string | null; accountId: string; bondRatePct: number | null;
}

/** A typed decimal ("0,5", "1.25"); null when empty, NaN when not a number. */
export function parseDecimal(text: string): number | null {
  const t = text.replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  return /^\d*\.?\d+$|^\d+\.$/.test(t) ? Number(t) : NaN;
}

/** Accounts a buy can be paid from (and a sell paid into): live checking and cash accounts. */
export function payableAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => !a.archived && (a.type === 'checking' || a.type === 'cash'));
}

/** Error copy for an invalid buy, or null. */
export function validateBuy(i: BuyInput, accounts: Account[]): string | null {
  const product = findProduct(i.productId);
  if (!product) return 'Pick a product from the list';
  if (!Number.isInteger(i.amountMinor) || i.amountMinor <= 0) return 'Enter the amount you paid';
  if (i.quantity !== null && !(i.quantity > 0)) return 'Enter a quantity above 0';
  // A market-priced product is valued from its quantity: without one (or a price to derive it) it is never priced.
  if (product.type !== 'bond' && i.quantity === null && i.price === null) return 'Add the quantity or the price per unit';
  if (!payableAccounts(accounts).some((a) => a.id === i.accountId)) return 'Pay from a current account or cash';
  return null;
}

/**
 * Units bought when only the price is known: the amount (minor units, account currency) converted to
 * HUF and then into the quote currency, divided by the price per unit (a plain number in the quote
 * currency). Rounded to 8 decimals.
 */
export function deriveQuantity(amountMinor: number, accountHufPerUnit: number, quoteHufPerUnit: number, price: number): number {
  const inQuote = ((amountMinor / 100) * accountHufPerUnit) / quoteHufPerUnit;
  return Number((inQuote / price).toFixed(8));
}

const daysApart = (a: ISODate, b: ISODate): number => Math.abs(daysBetweenInclusive(a, b) - 1);

/**
 * Bank SMS debits that may be this buy: SMS-sourced (or SMS-linked), non-recurring expenses on the same account with
 * exactly `amountMinor` (account currency) within ±3 days. Empty when the account receives no SMS.
 */
export function findSmsCandidates(
  i: { accountId: string; amountMinor: number; date: ISODate },
  txns: Txn[],
  accounts: Account[],
): Txn[] {
  const account = accounts.find((a) => a.id === i.accountId);
  if (!account?.sms_sender) return [];
  return txns.filter(
    (t) =>
      t.account_id === i.accountId &&
      t.kind === 'expense' &&
      (t.source === 'sms' || !!t.sms_message_id) &&
      t.recurring_rule_id === null &&
      t.amount_minor === i.amountMinor &&
      daysApart(t.date, i.date) <= SMS_MATCH_DAYS,
  );
}

const EPS = 1e-9;
const fmtQty = (q: number): string => String(Number(q.toFixed(8)));

/**
 * Error copy for an invalid sell, or null. `amountMinor` is the sell's HUF value (the caller
 * converts from the pay-into account's currency). A sell without a quantity on a position without
 * quantity closes the whole position, so it has no upper cap.
 */
export function planSell(position: Position, i: { amountMinor: number; quantity: number | null }): string | null {
  if (!Number.isInteger(i.amountMinor) || i.amountMinor <= 0) return 'Enter the amount you received';
  if (i.quantity !== null) {
    if (!(i.quantity > 0)) return 'Enter a quantity above 0';
    if (position.quantity === null) return 'Enter only the amount: this holding has no quantity';
    if (i.quantity > position.quantity + EPS) return `You hold ${fmtQty(position.quantity)}`;
    return null;
  }
  // A no-quantity sell closes the whole position, so any amount (a gain included) is fine.
  if (position.quantity === null && position.costMinor === 0) return 'Nothing left to sell';
  return null;
}
