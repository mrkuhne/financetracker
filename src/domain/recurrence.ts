import type { ISODate, RecurringRule } from './types';
import { addDays, compareDates, daysInMonth, monthOf, nextMonth } from './dates';

const pad = (n: number) => String(n).padStart(2, '0');

function monthlyDate(start: ISODate, ym: string): ISODate {
  const day = Math.min(Number(start.slice(8, 10)), daysInMonth(ym));
  return `${ym}-${pad(day)}`;
}

/** Occurrences within [from, to] inclusive, anchored at start_date. Ignores active/last_materialized_date. */
export function occurrencesInRange(rule: RecurringRule, from: ISODate, to: ISODate): ISODate[] {
  const lo = compareDates(from, rule.start_date) > 0 ? from : rule.start_date;
  const hi = rule.end_date && compareDates(rule.end_date, to) < 0 ? rule.end_date : to;
  if (compareDates(lo, hi) > 0) return [];
  const out: ISODate[] = [];
  const push = (d: ISODate) => {
    if (compareDates(d, lo) >= 0 && compareDates(d, hi) <= 0) out.push(d);
  };

  if (rule.frequency === 'weekly') {
    let d = rule.start_date;
    while (compareDates(d, hi) <= 0) {
      push(d);
      d = addDays(d, 7);
    }
  } else if (rule.frequency === 'monthly') {
    let ym = monthOf(rule.start_date);
    while (compareDates(`${ym}-01`, hi) <= 0) {
      push(monthlyDate(rule.start_date, ym));
      ym = nextMonth(ym);
    }
  } else {
    const mm = rule.start_date.slice(5, 7);
    const startYear = Number(rule.start_date.slice(0, 4));
    for (let y = startYear; y <= Number(hi.slice(0, 4)); y++) {
      const ym = `${String(y).padStart(4, '0')}-${mm}`;
      push(monthlyDate(rule.start_date, ym));
    }
  }
  return out;
}

/** Active rules only: occurrences in (last_materialized_date ?? day before start, today]. */
export function dueOccurrences(rule: RecurringRule, today: ISODate): ISODate[] {
  if (!rule.active) return [];
  const from = rule.last_materialized_date ? addDays(rule.last_materialized_date, 1) : rule.start_date;
  return occurrencesInRange(rule, from, today);
}
