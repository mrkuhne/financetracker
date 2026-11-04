import { describe, expect, it } from 'vitest';
import { briefDue, localDateTime, normalizeDigestTime, safeTz } from './due.ts';

describe('briefDue', () => {
  it('is false before the digest time and true from it', () => {
    expect(briefDue('2026-11-04T05:59:00Z', 'Europe/Budapest', '07:00', false)).toBe(false);
    expect(briefDue('2026-11-04T06:00:00Z', 'Europe/Budapest', '07:00', false)).toBe(true);
    expect(briefDue('2026-11-04T18:00:00Z', 'Europe/Budapest', '07:00', false)).toBe(true);
  });
  it('is false once today has a digest', () => {
    expect(briefDue('2026-11-04T06:00:00Z', 'Europe/Budapest', '07:00', true)).toBe(false);
  });
  it('follows the CET/CEST switch', () => {
    expect(briefDue('2026-07-01T05:00:00Z', 'Europe/Budapest', '07:00', false)).toBe(true);
    expect(briefDue('2026-07-01T04:59:00Z', 'Europe/Budapest', '07:00', false)).toBe(false);
  });
  it('falls back to Budapest and 07:00 on bad settings', () => {
    expect(briefDue('2026-11-04T06:00:00Z', 'Not/AZone', 'nope', false)).toBe(true);
    expect(briefDue('2026-11-04T05:59:00Z', '', '', false)).toBe(false);
  });
});

describe('localDateTime / normalizeDigestTime / safeTz', () => {
  it('gives the local date and 24h time', () => {
    expect(localDateTime('2026-11-04T23:30:00Z', 'Europe/Budapest')).toEqual({ date: '2026-11-05', time: '00:30' });
    expect(localDateTime('2026-11-04T11:05:00Z', 'Europe/Budapest')).toEqual({ date: '2026-11-04', time: '12:05' });
  });
  it('accepts HH:MM only', () => {
    expect(normalizeDigestTime('06:30')).toBe('06:30');
    expect(normalizeDigestTime('6:30')).toBe('07:00');
    expect(normalizeDigestTime('24:00')).toBe('07:00');
    expect(normalizeDigestTime(undefined)).toBe('07:00');
  });
  it('rejects unknown time zones', () => {
    expect(safeTz('Europe/London')).toBe('Europe/London');
    expect(safeTz('Mars/Base')).toBe('Europe/Budapest');
    expect(safeTz(42)).toBe('Europe/Budapest');
  });
});
