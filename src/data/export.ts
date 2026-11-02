import { listAccounts } from '@/data/accounts';
import { listCategories, type Category } from '@/data/categories';
import { listAllTransactions } from '@/data/transactions';
import { listRules } from '@/data/recurring';
import { listMonthCloses } from '@/data/monthCloses';
import { getSettings } from '@/data/settings';
import type { Account, MonthClose, RecurringRule, Settings, Txn } from '@/domain/types';

export const CSV_HEADER = 'date,account,kind,amount,currency,amount_huf,category,note,source';

/** Minor units -> major-unit string with '.' decimals (HUF has 2 decimals in storage, shown the same way). */
function major(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * For user/bank-supplied text only. Neutralizes spreadsheet formulas (prefix ' when the field starts
 * with = + - @ tab or CR), then RFC 4180: quote when it contains a comma, quote, CR or LF; double inner quotes.
 */
export function csvField(v: string): string {
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildTransactionsCsv(txns: Txn[], accounts: Pick<Account, 'id' | 'name'>[], categories: Pick<Category, 'id' | 'name'>[]): string {
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const sorted = [...txns].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.created_date ?? '').localeCompare(b.created_date ?? ''),
  );
  // Generated columns (date, kind, amounts, currency, source) are joined as-is so negatives keep their minus.
  const rows = sorted.map((t) =>
    [
      t.date,
      csvField(acc.get(t.account_id) ?? ''),
      t.kind,
      major(t.amount_minor),
      t.currency,
      major(t.amount_huf_minor),
      csvField(t.category_id ? (cat.get(t.category_id) ?? '') : ''),
      csvField(t.note ?? ''),
      t.source,
    ].join(','),
  );
  return [CSV_HEADER, ...rows].join('\r\n') + '\r\n';
}

export interface ExportData {
  accounts: Account[];
  categories: Category[];
  transactions: Txn[];
  recurring_rules: RecurringRule[];
  month_closes: MonthClose[];
  settings: Settings;
}

export function buildExportJson(data: ExportData, now: Date = new Date()): string {
  return JSON.stringify({ exported_at: now.toISOString(), version: 1, ...data }, null, 2);
}

export async function exportAllJson(): Promise<Blob> {
  const [accounts, categories, transactions, recurring_rules, month_closes, settings] = await Promise.all([
    listAccounts(), listCategories(), listAllTransactions(), listRules(), listMonthCloses(), getSettings(),
  ]);
  return new Blob([buildExportJson({ accounts, categories, transactions, recurring_rules, month_closes, settings })], { type: 'application/json' });
}

export async function exportTransactionsCsv(): Promise<Blob> {
  const [txns, accounts, categories] = await Promise.all([listAllTransactions(), listAccounts(), listCategories()]);
  return new Blob([buildTransactionsCsv(txns, accounts, categories)], { type: 'text/csv;charset=utf-8' });
}

/** Saves a blob: iOS standalone -> share sheet when possible; otherwise an object-URL download. */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
  if (standalone && typeof nav.share === 'function') {
    const file = new File([blob], filename, { type: blob.type });
    if (!nav.canShare || nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file] });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        /* fall through to the download link */
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
