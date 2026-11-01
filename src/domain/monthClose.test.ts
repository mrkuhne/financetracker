import { describe, expect, it } from 'vitest';
import { closeOutcome, monthsToClose, previousDeficit } from './monthClose';
import type { MonthlyAllowance } from './allowance';
import type { MonthClose } from './types';

const close = (month: string, o: Partial<MonthClose> = {}): MonthClose => ({
  id: `c-${month}`, month, final_remaining_minor: 0, deficit_minor: 0,
  leftover_action: 'none', transfer_pair_id: null, ...o,
});
const a: MonthlyAllowance = {
  month: '2026-11', recurringIncomeMinor: 0, oneOffIncomeMinor: 0, recurringExpensesMinor: 0,
  savingsTargetMinor: 0, investmentMinor: 0, previousDeficitMinor: 0,
  freeMinor: 0, spentMinor: 0, remainingMinor: 0,
};

describe('monthsToClose', () => {
  it('lists unclosed past months oldest first', () => {
    expect(monthsToClose('2027-01-15', '2026-11', [])).toEqual(['2026-11', '2026-12']);
  });
  it('skips closed months', () => {
    expect(monthsToClose('2027-01-15', '2026-11', [close('2026-11')])).toEqual(['2026-12']);
  });
  it('returns [] with no data or only current month', () => {
    expect(monthsToClose('2026-11-15', null, [])).toEqual([]);
    expect(monthsToClose('2026-11-15', '2026-11', [])).toEqual([]);
  });
});

describe('closeOutcome', () => {
  it('leftover when positive', () => {
    expect(closeOutcome({ ...a, remainingMinor: 259_000_00 })).toEqual({ leftoverMinor: 259_000_00, deficitMinor: 0 });
  });
  it('deficit when negative', () => {
    expect(closeOutcome({ ...a, remainingMinor: -40_000_00 })).toEqual({ leftoverMinor: 0, deficitMinor: 40_000_00 });
  });
  it('zero', () => {
    expect(closeOutcome(a)).toEqual({ leftoverMinor: 0, deficitMinor: 0 });
  });
});

describe('previousDeficit', () => {
  it('reads previous month close', () => {
    expect(previousDeficit('2026-12', [close('2026-11', { deficit_minor: 40_000_00 })])).toBe(40_000_00);
  });
  it('is 0 without a close', () => {
    expect(previousDeficit('2026-12', [])).toBe(0);
  });
  it('handles year boundary', () => {
    expect(previousDeficit('2027-01', [close('2026-12', { deficit_minor: 5 })])).toBe(5);
  });
});
