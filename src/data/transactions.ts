import { base44 } from '@/data/client';
import type { ISODate, Txn } from '@/domain/types';
import { toHufMinor } from '@/domain/money';
import { getHufPerUnit } from '@/data/fx';
import { pick, stripNulls } from '@/data/records';

const KEYS = [
  'account_id', 'kind', 'amount_minor', 'currency', 'amount_huf_minor', 'category_id', 'date',
  'note', 'source', 'needs_review', 'recurring_rule_id', 'transfer_pair_id', 'sms_message_id',
];
const NULLABLE = ['category_id', 'recurring_rule_id', 'transfer_pair_id', 'sms_message_id'];
const toTxn = (r: Record<string, unknown>): Txn => ({
  ...pick<Txn>(r, KEYS, NULLABLE),
  needs_review: !!r.needs_review,
  created_date: r.created_date as string | undefined,
});

const MAX = 5000;

export async function listTransactions(range: { from: ISODate; to: ISODate }): Promise<Txn[]> {
  const rows = await base44.entities.Transaction.filter(
    { date: { $gte: range.from, $lte: range.to } },
    '-date',
    MAX,
  );
  return rows.map(toTxn);
}

export async function listAllTransactions(): Promise<Txn[]> {
  return (await base44.entities.Transaction.list('-date', MAX)).map(toTxn);
}

export async function getTransaction(id: string): Promise<Txn | null> {
  const rows = await base44.entities.Transaction.filter({ id });
  return rows[0] ? toTxn(rows[0]) : null;
}

export async function listTransactionsBySmsIds(ids: string[]): Promise<Txn[]> {
  if (ids.length === 0) return [];
  return (await base44.entities.Transaction.filter({ sms_message_id: { $in: ids } }, '-date', MAX)).map(toTxn);
}

export async function createTransaction(t: Omit<Txn, 'id'>): Promise<Txn> {
  return toTxn(await base44.entities.Transaction.create(stripNulls(t)));
}

export async function updateTransaction(id: string, patch: Partial<Omit<Txn, 'id'>>): Promise<Txn> {
  return toTxn(await base44.entities.Transaction.update(id, patch));
}

export async function deleteTransaction(id: string): Promise<void> {
  const rows = await base44.entities.Transaction.filter({ id });
  const pairId = rows[0]?.transfer_pair_id as string | undefined;
  await base44.entities.Transaction.delete(id);
  if (pairId) {
    const partners = await base44.entities.Transaction.filter({ transfer_pair_id: pairId });
    for (const p of partners) if (p.id !== id) await base44.entities.Transaction.delete(p.id as string);
  }
}

export async function createTransfer(i: {
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  currency: string;
  date: ISODate;
  note?: string;
}): Promise<string> {
  const pairId = crypto.randomUUID();
  const rate = await getHufPerUnit(i.currency, i.date);
  const amountHuf = toHufMinor(i.amountMinor, rate);
  const leg = (kind: 'transfer_out' | 'transfer_in', accountId: string): Omit<Txn, 'id'> => ({
    account_id: accountId,
    kind,
    amount_minor: i.amountMinor,
    currency: i.currency,
    amount_huf_minor: amountHuf,
    category_id: null,
    date: i.date,
    note: i.note,
    source: 'manual',
    needs_review: false,
    recurring_rule_id: null,
    transfer_pair_id: pairId,
  });
  await base44.entities.Transaction.bulkCreate([
    stripNulls(leg('transfer_out', i.fromAccountId)),
    stripNulls(leg('transfer_in', i.toAccountId)),
  ]);
  return pairId;
}
