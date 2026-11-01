import { toMinor } from '@/domain/money';

/** Parse a typed amount ("1 250,50", "12.5") to minor units. null when empty or not a number. */
export function parseAmountInput(text: string): number | null {
  const t = text.replace(/\s/g, '').replace(',', '.');
  if (t === '' || t === '-' || !/^-?\d*\.?\d*$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? toMinor(n) : null;
}
