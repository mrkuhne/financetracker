import { formatMoney } from '@/domain/money';
import type { SmsMessageRow } from '@/data/smsMessages';

export const SMS_SENDER = 'MBH Bank';
export const SAMPLE_SMS = 'MBH Bank: Kartyas vasarlas -15 500 HUF, MOL 1093 BUDAORS, 2026.11.11 08:17. Egyenleg: 412 380 HUF';

const LABELS: Record<SmsMessageRow['status'], string> = {
  parsed: 'Parsed',
  converted: 'Added',
  ignored: 'Ignored',
  failed: "Couldn't read",
};

export function smsStatusLabel(status: SmsMessageRow['status']): string {
  return LABELS[status];
}

export interface IngestResponse {
  status?: string;
  error?: string;
  amount_minor?: number;
  currency?: string;
  merchant?: string;
}

/** Toast text for the result of the "Send a test message" call. */
export function testToast(httpStatus: number, body: IngestResponse): string {
  if (httpStatus === 401) return 'Key not accepted';
  if (body.status === 'parsed') {
    const who = body.merchant || 'Expense';
    if (body.amount_minor == null || !body.currency) return `Test received: ${who}`;
    return `Test received: ${who} −${formatMoney(Math.abs(body.amount_minor), body.currency)}`;
  }
  if (body.status === 'duplicate') return 'Already received';
  return body.status ?? body.error ?? `Error ${httpStatus}`;
}
