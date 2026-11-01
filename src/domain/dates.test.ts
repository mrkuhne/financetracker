import { describe, it, expect } from 'vitest';
import {
  todayInTz, addDays, monthOf, daysInMonth, firstDay, lastDay,
  nextMonth, prevMonth, weekStart, daysBetweenInclusive, compareDates,
} from './dates';

describe('dates', () => {
  it('todayInTz respects timezone', () => {
    expect(todayInTz('Europe/Budapest', new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
  });
  it('weekStart is Monday', () => {
    expect(weekStart('2026-11-04')).toBe('2026-11-02');
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
  });
  it('month helpers', () => {
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(monthOf('2026-11-15')).toBe('2026-11');
    expect(firstDay('2026-11')).toBe('2026-11-01');
    expect(lastDay('2026-11')).toBe('2026-11-30');
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(prevMonth('2026-01')).toBe('2025-12');
  });
  it('day arithmetic', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(daysBetweenInclusive('2026-11-02', '2026-11-30')).toBe(29);
    expect(compareDates('2026-01-01', '2026-01-02')).toBeLessThan(0);
    expect(compareDates('2026-01-02', '2026-01-02')).toBe(0);
  });
});
