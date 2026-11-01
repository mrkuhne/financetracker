import type { Category } from '@/data/categories';
import type { ISODate, Txn } from '@/domain/types';

export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '000' | '⌫';
export const KEYS: Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];
export const MAX_DIGITS = 9;

/** Keypad reducer: digits only, max 9, no leading zeros, ⌫ deletes, '000' adds three zeros if they fit. */
export function applyKey(amount: string, key: Key): string {
  if (key === '⌫') return amount.slice(0, -1);
  if (amount === '' && key.startsWith('0')) return '';
  if (amount.length + key.length > MAX_DIGITS) return amount;
  return amount + key;
}

/** Most recently used category ids of `kind` (by txn date, newest first), padded from the default order. */
export function recentCategoryIds(
  txns: Txn[],
  categories: Category[],
  n: number,
  kind: 'expense' | 'income' = 'expense',
): string[] {
  const valid = new Set(categories.filter((c) => c.kind === kind).map((c) => c.id));
  const out: string[] = [];
  const sorted = txns.filter((t) => t.kind === kind).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const t of sorted) {
    if (out.length >= n) break;
    if (t.category_id && valid.has(t.category_id) && !out.includes(t.category_id)) out.push(t.category_id);
  }
  for (const c of categories) {
    if (out.length >= n) break;
    if (c.kind === kind && !out.includes(c.id)) out.push(c.id);
  }
  return out;
}

export interface DayGroup {
  date: ISODate;
  txns: Txn[];
  totalHufMinor: number;
}

/** Signed HUF effect of a txn on the day total; transfers net to zero and are excluded. */
export function signedHuf(t: Txn): number {
  if (t.kind === 'income') return t.amount_huf_minor;
  if (t.kind === 'expense') return -t.amount_huf_minor;
  return 0;
}

/** Group by date, newest day first; keeps input order within a day. */
export function groupByDay(txns: Txn[]): DayGroup[] {
  const map = new Map<ISODate, DayGroup>();
  for (const t of txns) {
    let g = map.get(t.date);
    if (!g) map.set(t.date, (g = { date: t.date, txns: [], totalHufMinor: 0 }));
    g.txns.push(t);
    g.totalHufMinor += signedHuf(t);
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Editing amount, currency or date invalidates the stored HUF value. */
export function needsHufRecompute(
  old: Pick<Txn, 'amount_minor' | 'currency' | 'date'>,
  next: Pick<Txn, 'amount_minor' | 'currency' | 'date'>,
): boolean {
  return old.amount_minor !== next.amount_minor || old.currency !== next.currency || old.date !== next.date;
}

const COLOR_BY_NAME: Record<string, string> = {
  Groceries: 'groceries', 'Dining out': 'dining', Transport: 'transport', Housing: 'housing',
  Utilities: 'utilities', Subscriptions: 'subs', Health: 'health', Shopping: 'shopping',
  Entertainment: 'fun', Travel: 'travel', Gifts: 'gifts', Other: 'other',
};

export function categoryColor(c: Pick<Category, 'name' | 'kind'> | undefined): string {
  if (!c) return 'var(--c-other)';
  if (c.kind === 'income') return 'var(--c-income)';
  return `var(--c-${COLOR_BY_NAME[c.name] ?? 'other'})`;
}

/** "Today", "Yesterday", else "Mon, 2 Nov" (calendar math on UTC noon, no timezone drift). */
export function dayLabel(date: ISODate, today: ISODate): string {
  const ms = (d: ISODate) => Date.parse(`${d}T12:00:00Z`);
  const diff = Math.round((ms(today) - ms(date)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(ms(date));
}

export function monthLabel(m: string): string {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${m}-01T12:00:00Z`));
}
