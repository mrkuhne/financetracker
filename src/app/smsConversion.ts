import type { Category } from '@/data/categories';
import type { SmsMessageRow } from '@/data/smsMessages';
import { formatMoney, toHufMinor } from '@/domain/money';
import type { Account, Txn } from '@/domain/types';

const norm = (s: string) => s.trim().toLowerCase();

/** Account for an SMS sender: matching sms_sender, else default, else first; archived never chosen. */
export function pickSmsAccount(sender: string, accounts: Account[]): Account | null {
  const live = accounts.filter((a) => !a.archived);
  const s = norm(sender);
  return (
    live.find((a) => a.sms_sender != null && norm(a.sms_sender) === s) ??
    live.find((a) => a.is_default) ??
    live[0] ??
    null
  );
}

export function convertMinor(amountMinor: number, fromHufPerUnit: number, toHufPerUnit: number): number {
  return Math.round((amountMinor * fromHufPerUnit) / toHufPerUnit);
}

export function planSmsTxn(
  msg: SmsMessageRow,
  account: Account,
  categories: Category[],
  rates: { msg: number; account: number },
): Omit<Txn, 'id'> {
  const origMinor = msg.amount_minor as number;
  const origCurrency = msg.currency as string;
  const converted = origCurrency !== account.currency;
  const amountMinor = converted ? convertMinor(origMinor, rates.msg, rates.account) : origMinor;
  const catName = msg.category_name ? norm(msg.category_name) : null;
  const category = catName ? categories.find((c) => c.kind === msg.kind && norm(c.name) === catName) : undefined;
  const note = [msg.merchant ?? '', converted ? formatMoney(origMinor, origCurrency) : '']
    .filter((p) => p !== '')
    .join(' · ');
  return {
    account_id: account.id,
    kind: msg.kind as 'expense' | 'income',
    amount_minor: amountMinor,
    currency: account.currency,
    amount_huf_minor: toHufMinor(amountMinor, rates.account),
    category_id: category?.id ?? null,
    date: msg.date as string,
    note,
    source: 'sms',
    needs_review: true,
    recurring_rule_id: null,
    transfer_pair_id: null,
    sms_message_id: msg.id,
  };
}

const olderFirst = (a: SmsMessageRow, b: SmsMessageRow): number =>
  a.received_at.localeCompare(b.received_at) || (a.created_date ?? '').localeCompare(b.created_date ?? '');

/**
 * Split pending SMS into ones to convert and duplicates. Per text_hash the oldest (received_at,
 * then created_date) is kept; the rest point at it (`of`). A hash already converted earlier is a
 * duplicate with `of: null`. `convert` keeps the input order.
 */
export function dedupePending(
  pending: SmsMessageRow[],
  convertedHashes: Set<string>,
): { convert: SmsMessageRow[]; duplicates: { msg: SmsMessageRow; of: SmsMessageRow | null }[] } {
  const keep = new Map<string, SmsMessageRow>();
  for (const m of pending) {
    if (convertedHashes.has(m.text_hash)) continue;
    const cur = keep.get(m.text_hash);
    if (!cur || olderFirst(m, cur) < 0) keep.set(m.text_hash, m);
  }
  const convert: SmsMessageRow[] = [];
  const duplicates: { msg: SmsMessageRow; of: SmsMessageRow | null }[] = [];
  for (const m of pending) {
    const kept = keep.get(m.text_hash);
    if (kept === m) convert.push(m);
    else duplicates.push({ msg: m, of: kept ?? null });
  }
  return { convert, duplicates };
}
