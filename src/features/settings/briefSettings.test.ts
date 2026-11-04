import { describe, expect, it } from 'vitest';
import { HOUR_OPTIONS, aiLimitReached, firstPushTomorrow, normalizeHour, normalizeInterval } from './briefSettings';

describe('briefSettings', () => {
  it('offers 24 whole hours', () => {
    expect(HOUR_OPTIONS).toHaveLength(24);
    expect(HOUR_OPTIONS[0]).toBe('00:00');
    expect(HOUR_OPTIONS[23]).toBe('23:00');
  });
  it('rounds a stored time up to the next whole hour', () => {
    expect(normalizeHour('07:00')).toBe('07:00');
    expect(normalizeHour('07:30')).toBe('08:00');
    expect(normalizeHour('23:15')).toBe('00:00');
    expect(normalizeHour('7:05')).toBe('08:00');
    expect(normalizeHour('garbage')).toBe('07:00');
    expect(normalizeHour('25:00')).toBe('07:00');
  });
  it('normalises the interval', () => {
    expect(normalizeInterval(8)).toBe(8);
    expect(normalizeInterval(3)).toBe(4);
    expect(normalizeInterval('4')).toBe(4);
    expect(normalizeInterval(undefined)).toBe(4);
  });
  it('detects the daily AI limit', () => {
    expect(aiLimitReached({ collect: 9, brief: 1 })).toBe(false);
    expect(aiLimitReached({ collect: 10, brief: 0 })).toBe(true);
    expect(aiLimitReached({ collect: 0, brief: 2 })).toBe(true);
  });
});

describe('firstPushTomorrow', () => {
  const d = (date: string, push_status: 'sent' | 'skipped' | null) => ({ date, push_status });
  it('only when on and today\'s digest was skipped', () => {
    expect(firstPushTomorrow(true, d('2026-11-04', 'skipped'), '2026-11-04')).toBe(true);
    expect(firstPushTomorrow(false, d('2026-11-04', 'skipped'), '2026-11-04')).toBe(false);
    expect(firstPushTomorrow(true, d('2026-11-03', 'skipped'), '2026-11-04')).toBe(false);
    expect(firstPushTomorrow(true, d('2026-11-04', 'sent'), '2026-11-04')).toBe(false);
    expect(firstPushTomorrow(true, null, '2026-11-04')).toBe(false);
  });
});
