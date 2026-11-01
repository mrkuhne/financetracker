import type { MonthlyAllowance } from './allowance';
import { compareDates, firstDay, monthOf, nextMonth, prevMonth } from './dates';
import type { ISODate, MonthClose, YearMonth } from './types';

export function monthsToClose(
  today: ISODate,
  earliestDataMonth: YearMonth | null,
  closes: MonthClose[],
): YearMonth[] {
  if (earliestDataMonth === null) return [];
  const current = monthOf(today);
  const closed = new Set(closes.map((c) => c.month));
  const out: YearMonth[] = [];
  for (let m = earliestDataMonth; compareDates(firstDay(m), firstDay(current)) < 0; m = nextMonth(m)) {
    if (!closed.has(m)) out.push(m);
  }
  return out;
}

export function closeOutcome(a: MonthlyAllowance): { leftoverMinor: number; deficitMinor: number } {
  return {
    leftoverMinor: Math.max(0, a.remainingMinor),
    deficitMinor: Math.max(0, -a.remainingMinor),
  };
}

export function previousDeficit(month: YearMonth, closes: MonthClose[]): number {
  const prev = prevMonth(month);
  return closes.find((c) => c.month === prev)?.deficit_minor ?? 0;
}
