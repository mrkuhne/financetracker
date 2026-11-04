export const INTERVAL_OPTIONS = [2, 4, 8, 12] as const;
export type NewsInterval = (typeof INTERVAL_OPTIONS)[number];

/** "00:00" … "23:00". The scheduler ticks hourly, so only whole hours are offered. */
export const HOUR_OPTIONS: string[] = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

/** A stored HH:MM shown as the whole hour the scheduler will actually use (next whole hour; invalid → 07:00). */
export function normalizeHour(time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
  if (!m) return '07:00';
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return '07:00';
  if (min > 0) h = (h + 1) % 24;
  return `${String(h).padStart(2, '0')}:00`;
}

export function normalizeInterval(v: unknown): NewsInterval {
  return INTERVAL_OPTIONS.includes(v as NewsInterval) ? (v as NewsInterval) : 4;
}

export const COLLECT_DAILY_CAP = 10;
export const BRIEF_DAILY_CAP = 2;

export function aiLimitReached(u: { collect: number; brief: number }): boolean {
  return u.collect >= COLLECT_DAILY_CAP || u.brief >= BRIEF_DAILY_CAP;
}

/**
 * True when notifications are on but today's digest was already built without a push (one brief per day),
 * so the first notification comes tomorrow. `today` is in the user's timezone, like the digest date.
 */
export function firstPushTomorrow(on: boolean, digest: { date: string; push_status: string | null } | null, today: string): boolean {
  return on && !!digest && digest.date === today && digest.push_status === 'skipped';
}
