// When the morning brief is due. Pure, no imports, so vitest can cover it.

export const DEFAULT_TZ = 'Europe/Budapest';
export const DEFAULT_DIGEST_TIME = '07:00';

/** The user's IANA time zone, or Budapest when it is missing or unknown to Intl. */
export function safeTz(tz: unknown): string {
  if (typeof tz !== 'string' || !tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** 'HH:MM' (00:00–23:59), else 07:00. */
export function normalizeDigestTime(raw: unknown): string {
  return typeof raw === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : DEFAULT_DIGEST_TIME;
}

/** Local calendar date ('YYYY-MM-DD') and 24h time ('HH:MM') of an instant in `tz`. */
export function localDateTime(nowIso: string, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowIso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` };
}

/** True once the local time has reached `digestTime` and there is no digest for today yet. */
export function briefDue(nowIso: string, tz: string, digestTime: string, hasTodayDigest: boolean): boolean {
  if (hasTodayDigest) return false;
  return localDateTime(nowIso, tz).time >= normalizeDigestTime(digestTime);
}
