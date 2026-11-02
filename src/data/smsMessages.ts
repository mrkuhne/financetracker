import { base44 } from '@/data/client';
import { pick } from '@/data/records';

export interface SmsMessageRow {
  id: string;
  owner_id: string;
  sender: string;
  text: string | null;
  text_hash: string;
  received_at: string;
  status: 'parsed' | 'ignored' | 'failed' | 'converted';
  reason: string | null;
  kind: 'expense' | 'income' | null;
  amount_minor: number | null;
  currency: string | null;
  merchant: string | null;
  date: string | null;
  category_name: string | null;
  transaction_id: string | null;
  created_date?: string;
}

const KEYS = [
  'owner_id', 'sender', 'text', 'text_hash', 'received_at', 'status', 'reason', 'kind',
  'amount_minor', 'currency', 'merchant', 'date', 'category_name', 'transaction_id',
];
const NULLABLE = ['text', 'reason', 'kind', 'amount_minor', 'currency', 'merchant', 'date', 'category_name', 'transaction_id'];
const toRow = (r: Record<string, unknown>): SmsMessageRow => ({
  ...pick<SmsMessageRow>(r, KEYS, NULLABLE),
  created_date: r.created_date as string | undefined,
});

export async function listRecentSms(limit = 20): Promise<SmsMessageRow[]> {
  return (await base44.entities.SmsMessage.list('-created_date', limit)).map(toRow);
}

export async function listPendingSms(): Promise<SmsMessageRow[]> {
  return (await base44.entities.SmsMessage.filter({ status: 'parsed' }, '-created_date')).map(toRow);
}

export async function listConvertedSmsByHashes(hashes: string[]): Promise<SmsMessageRow[]> {
  if (hashes.length === 0) return [];
  return (
    await base44.entities.SmsMessage.filter({ status: 'converted', text_hash: { $in: hashes } }, '-created_date', 5000)
  ).map(toRow);
}

/** A null transactionId marks a duplicate whose original transaction is unknown. */
export async function markSmsConverted(id: string, transactionId: string | null): Promise<void> {
  await base44.entities.SmsMessage.update(id, { status: 'converted', transaction_id: transactionId });
}

export async function getSms(id: string): Promise<SmsMessageRow | null> {
  try {
    const rows = await base44.entities.SmsMessage.filter({ id });
    return rows[0] ? toRow(rows[0]) : null;
  } catch {
    return null;
  }
}
