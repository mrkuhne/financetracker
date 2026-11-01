import type { ISODate, YearMonth } from './types';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

// All math on UTC-noon Dates so DST/timezone never shifts a calendar day.
function toUtcNoon(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12));
}

function fromUtc(dt: Date): ISODate {
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function todayInTz(tz: string, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  const dt = toUtcNoon(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUtc(dt);
}

export function monthOf(d: ISODate): YearMonth {
  return d.slice(0, 7);
}

export function daysInMonth(m: YearMonth): number {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0, 12)).getUTCDate();
}

export function firstDay(m: YearMonth): ISODate {
  return `${m}-01`;
}

export function lastDay(m: YearMonth): ISODate {
  return `${m}-${pad(daysInMonth(m))}`;
}

export function nextMonth(m: YearMonth): YearMonth {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${pad(y + 1, 4)}-01` : `${pad(y, 4)}-${pad(mo + 1)}`;
}

export function prevMonth(m: YearMonth): YearMonth {
  const [y, mo] = m.split('-').map(Number);
  return mo === 1 ? `${pad(y - 1, 4)}-12` : `${pad(y, 4)}-${pad(mo - 1)}`;
}

/** Monday of the week containing d. */
export function weekStart(d: ISODate): ISODate {
  const dow = toUtcNoon(d).getUTCDay(); // 0 = Sunday
  return addDays(d, -((dow + 6) % 7));
}

export function daysBetweenInclusive(a: ISODate, b: ISODate): number {
  return Math.round((toUtcNoon(b).getTime() - toUtcNoon(a).getTime()) / 86_400_000) + 1;
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
