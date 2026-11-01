import { addDays } from '@/domain/dates';
import type { ISODate, RecurringRule } from '@/domain/types';

/** Monthly HUF-minor equivalent of a rule: weekly x52/12, yearly /12. */
export function monthlyHufMinor(r: Pick<RecurringRule, 'frequency' | 'amount_huf_minor'>): number {
  if (r.frequency === 'weekly') return Math.round((r.amount_huf_minor * 52) / 12);
  if (r.frequency === 'yearly') return Math.round(r.amount_huf_minor / 12);
  return r.amount_huf_minor;
}

const ord = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function frequencyLabel(r: Pick<RecurringRule, 'frequency' | 'start_date'>): string {
  const [y, m, d] = r.start_date.split('-').map(Number);
  if (r.frequency === 'monthly') return `Monthly on the ${d}${ord(d)}`;
  if (r.frequency === 'yearly') return `Yearly on ${MONTHS[m - 1]} ${d}`;
  return `Weekly on ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}s`;
}

export type RuleFields = Omit<RecurringRule, 'id' | 'last_materialized_date' | 'active'>;

/**
 * Patch for saving an edited rule. Never touches last_materialized_date: a changed schedule or amount
 * applies only to occurrences after it (no backfill, no deletion of written entries).
 */
export function rulePatchForEdit(fields: RuleFields): Partial<Omit<RecurringRule, 'id'>> {
  const { last_materialized_date: _l, active: _a, id: _i, ...rest } = fields as RuleFields & Partial<RecurringRule>;
  return rest;
}

/** Pause / resume. Resuming skips the paused period: materialization restarts from `today` (user timezone). */
export function rulePatchForToggle(rule: RecurringRule, today: ISODate): Partial<Omit<RecurringRule, 'id'>> {
  return rule.active ? { active: false } : { active: true, last_materialized_date: addDays(today, -1) };
}
