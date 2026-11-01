import type { RecurringRule } from '@/domain/types';

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
