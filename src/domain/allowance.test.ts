import { describe, expect, it } from 'vitest';
import { computeMonthlyAllowance, computeWeeklyAllowance } from './allowance';
import type { RecurringRule, Settings, Txn } from './types';

const base = {
  id: 't', account_id: 'a1', amount_minor: 0, currency: 'HUF', amount_huf_minor: 0,
  category_id: null, source: 'manual', needs_review: false, recurring_rule_id: null, transfer_pair_id: null,
} as const;
const mk = (kind: Txn['kind'], date: string, amount: number, over: Partial<Txn> = {}): Txn => ({
  ...base, kind, date, amount_minor: amount, amount_huf_minor: amount, ...over,
});
const expense = (d: string, a: number, o: Partial<Txn> = {}) => mk('expense', d, a, o);
const income = (d: string, a: number, o: Partial<Txn> = {}) => mk('income', d, a, o);
const transferOut = (d: string, a: number, o: Partial<Txn> = {}) => mk('transfer_out', d, a, o);
const transferIn = (d: string, a: number, o: Partial<Txn> = {}) => mk('transfer_in', d, a, o);

const rule = (id: string, kind: RecurringRule['kind'], amt: number, start: string): RecurringRule => ({
  id, name: id, kind, amount_minor: amt, currency: 'HUF', amount_huf_minor: amt, category_id: null,
  account_id: 'a1', frequency: 'monthly', start_date: start, end_date: null, last_materialized_date: null, active: true,
});
const rules = [
  rule('salary', 'income', 600_000_00, '2026-01-10'),
  rule('rent', 'expense', 200_000_00, '2026-01-01'),
  rule('netflix', 'expense', 5_000_00, '2026-01-15'),
];
const settings: Settings = {
  base_currency: 'HUF', monthly_savings_target_minor: 100_000_00, monthly_investment_amount_minor: 30_000_00,
  emergency_fund_months: 3, week_start: 'monday', digest_time: '20:00', timezone: 'Europe/Budapest',
};

const txns = [
  expense('2026-11-02', 15_000_00),
  expense('2026-11-03', 10_000_00),
  income('2026-11-20', 20_000_00),
  expense('2026-11-01', 200_000_00, { recurring_rule_id: 'rent' }),
  transferOut('2026-11-05', 50_000_00), transferIn('2026-11-05', 50_000_00),
  expense('2026-11-06', 1_000_00, { currency: 'EUR', amount_minor: 2_53, amount_huf_minor: 1_000_00 }),
];

describe('allowance', () => {
  it('monthly', () => {
    const nov = computeMonthlyAllowance({ month: '2026-11', rules, txns, settings, previousDeficitMinor: 0 });
    expect(nov.freeMinor).toBe(285_000_00);
    expect(nov.spentMinor).toBe(26_000_00);
    expect(nov.remainingMinor).toBe(259_000_00);
    expect(computeMonthlyAllowance({ month: '2026-11', rules, txns, settings, previousDeficitMinor: 40_000_00 }).freeMinor)
      .toBe(245_000_00);
  });

  it('weekly', () => {
    const wk = computeWeeklyAllowance({ today: '2026-11-04', rules, txns, settings, previousDeficitMinor: 0 });
    expect(wk).toEqual({ weekStart: '2026-11-02', weekEnd: '2026-11-08',
      budgetMinor: 6_879_310, spentMinor: 26_000_00, remainingMinor: 6_879_310 - 26_000_00 });
  });

  it('cross-month week', () => {
    const cross = computeWeeklyAllowance({ today: '2026-11-30', rules, txns, settings, previousDeficitMinor: 0 });
    expect(cross.budgetMinor).toBe(25_900_000 + 5_129_032);
  });

  it('deficit belongs to the month containing today', () => {
    const dec = computeWeeklyAllowance({ today: '2026-12-02', rules, txns, settings, previousDeficitMinor: 40_000_00 });
    expect(dec.weekStart).toBe('2026-11-30');
    expect(dec.budgetMinor).toBe(25_900_000 + 4_354_838);
  });

  it('overspent clamps', () => {
    const broke = [...txns, expense('2026-11-10', 400_000_00)];
    expect(computeMonthlyAllowance({ month: '2026-11', rules, txns: broke, settings, previousDeficitMinor: 0 }).remainingMinor)
      .toBe(-141_000_00);
    expect(computeWeeklyAllowance({ today: '2026-11-16', rules, txns: broke, settings, previousDeficitMinor: 0 }).budgetMinor).toBe(0);
  });
});
