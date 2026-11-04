import { describe, expect, it } from 'vitest';
import { daysLeftInMonth, leftThisMonthMinor, pullForwardRoomMinor } from './brief';

const base = { emergencyDone: true, suggestedMinor: 4_000_000, investedMinor: 4_000_000, remainingMinor: 10_000_000, dailySpendMinor: 200_000, daysLeft: 20 };

describe('pullForwardRoomMinor', () => {
  it('is 0 before the emergency fund is done', () => expect(pullForwardRoomMinor({ ...base, emergencyDone: false })).toBe(0));
  it('takes half the free money after expected spend', () => expect(pullForwardRoomMinor(base)).toBe(2_000_000));
  it('is capped by the remaining allowance beyond the suggestion', () =>
    expect(pullForwardRoomMinor({ ...base, remainingMinor: 5_000_000 })).toBe(1_000_000));
  it('shrinks by what was already invested above the suggestion', () =>
    expect(pullForwardRoomMinor({ ...base, investedMinor: 5_000_000, remainingMinor: 5_000_000 })).toBe(1_000_000));
  it('shrinks by the excess', () =>
    expect(pullForwardRoomMinor({ ...base, investedMinor: 5_000_000 })).toBe(1_000_000));
  it('is never negative', () => {
    expect(pullForwardRoomMinor({ ...base, remainingMinor: -1 })).toBe(0);
    expect(pullForwardRoomMinor({ ...base, dailySpendMinor: 9_000_000 })).toBe(0);
  });
});

describe('daysLeftInMonth', () => {
  it('counts today', () => {
    expect(daysLeftInMonth('2026-11-30')).toBe(1);
    expect(daysLeftInMonth('2026-11-01')).toBe(30);
    expect(daysLeftInMonth('2026-02-01')).toBe(28);
  });
});

describe('leftThisMonthMinor', () => {
  it('is max(0, s - i)', () => {
    expect(leftThisMonthMinor(4, 1)).toBe(3);
    expect(leftThisMonthMinor(4, 9)).toBe(0);
  });
});
