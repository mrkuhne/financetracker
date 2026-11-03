import { DEFAULT_ORDER, type Category } from '@/data/categories';
import type { ISODate, Txn } from '@/domain/types';

export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '000' | ',' | '⌫';
const BASE: Key[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
/** Keypad layout: HUF gets "000", currencies with cents get ",". */
export const keysFor = (decimals: boolean): Key[] => [...BASE, decimals ? ',' : '000', '0', '⌫'];
export const KEYS = keysFor(false);
export const MAX_DIGITS = 9;

/** Keypad reducer: max 9 integer digits, no leading zeros, ⌫, '000' (integers), ',' + max 2 decimals (when `decimals`). */
export function applyKey(amount: string, key: Key, decimals = false): string {
  if (key === '⌫') return amount.slice(0, -1);
  const [int, frac] = amount.split(',');
  if (key === ',') return decimals && frac === undefined ? (amount === '' ? '0,' : amount + ',') : amount;
  if (frac !== undefined) return key === '000' || frac.length >= 2 ? amount : amount + key;
  if (amount === '' && key.startsWith('0')) return '';
  if (int.length + key.length > MAX_DIGITS) return amount;
  return amount + key;
}

/** Drop the fraction when the currency has no decimals (HUF); no-op otherwise. */
export function normalizeAmountFor(amount: string, decimals: boolean): string {
  return decimals ? amount : amount.split(',')[0];
}

/** Display "12 500,5" style text for the in-progress amount. */
export function formatTyped(amount: string): string {
  if (!amount) return '0';
  const [int, frac] = amount.split(',');
  const head = Number(int).toLocaleString('hu-HU', { useGrouping: 'always' } as Intl.NumberFormatOptions).replace(/\s/g, ' ');
  return frac === undefined ? head : `${head},${frac}`;
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
  const rank = (c: Category) => {
    const i = DEFAULT_ORDER.indexOf(c.name);
    return i < 0 ? DEFAULT_ORDER.length : i;
  };
  for (const c of [...categories].sort((a, b) => rank(a) - rank(b))) {
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
  if (t.kind === 'income' || t.kind === 'invest_sell') return t.amount_huf_minor;
  if (t.kind === 'expense' || t.kind === 'invest_buy') return -t.amount_huf_minor;
  return 0;
}

/** Row title for an investment txn: "Invested · note" / "Sold · note". */
export function investTitle(t: Txn): string {
  const head = t.kind === 'invest_buy' ? 'Invested' : 'Sold';
  return t.note ? `${head} · ${t.note}` : head;
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
