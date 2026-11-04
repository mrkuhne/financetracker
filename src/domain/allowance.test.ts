import { describe, expect, it } from 'vitest';
import { computeMonthlyAllowance, computeWeeklyAllowance, savingsTargetFor } from './allowance';
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
  emergency_fund_months: 3, week_start: 'monday', digest_time: '20:00', timezone: 'Europe/Budapest', month_overrides: {}, has_expensive_debt: null, risk_profile: 'cautious', risk_checkin_at: null, invest_suggested_log: {},
};

const txns = [
  mk('invest_buy', '2026-11-04', 30_000_00),
  mk('invest_buy', '2026-12-04', 30_000_00),
  expense('2026-11-02', 15_000_00),
  expense('2026-11-03', 10_000_00),
  income('2026-11-20', 20_000_00),
  expense('2026-11-01', 200_000_00, { recurring_rule_id: 'rent' }),
  transferOut('2026-11-05', 50_000_00), transferIn('2026-11-05', 50_000_00),
  expense('2026-11-06', 1_000_00, { currency: 'EUR', amount_minor: 2_53, amount_huf_minor: 1_000_00 }),
];

describe('investment txns', () => {
  const s: Settings = { ...settings, monthly_savings_target_minor: 0, monthly_investment_amount_minor: 5_000_000 };
  const r = [rule('salary', 'income', 60_000_000, '2026-01-10')];
  const run = (t: Txn[]) => computeMonthlyAllowance({ month: '2026-11', rules: r, txns: t, settings: s, previousDeficitMinor: 0 });
  it('investment comes from recorded buys, not the setting', () => {
    const a = run([mk('invest_buy', '2026-11-05', 2_000_000)]);
    expect(a.investmentMinor).toBe(2_000_000);
    expect(a.freeMinor).toBe(58_000_000);
  });
  it('an invest_sell is not income', () => {
    const a = run([mk('invest_sell', '2026-11-05', 1_000_000)]);
    expect(a.oneOffIncomeMinor).toBe(0);
    expect(a.freeMinor).toBe(run([]).freeMinor);
  });
  it('an invest_buy is not day-to-day spend', () => {
    expect(run([mk('invest_buy', '2026-11-05', 2_000_000)]).spentMinor).toBe(0);
  });
});

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
    expect(wk).toMatchObject({ weekStart: '2026-11-02', weekEnd: '2026-11-08', countedFrom: '2026-11-02',
      budgetMinor: 6_879_310, spentMinor: 26_000_00, remainingMinor: 6_879_310 - 26_000_00 });
    expect(wk.portions).toHaveLength(1);
  });

  it('cross-month week', () => {
    const cross = computeWeeklyAllowance({ today: '2026-11-30', rules, txns, settings, previousDeficitMinor: 0 });
    expect(cross.budgetMinor).toBe(25_900_000 + 5_129_032);
  });

  it('deficit belongs to the month containing today', () => {
    const dec = computeWeeklyAllowance({ today: '2026-12-02', rules, txns, settings, previousDeficitMinor: 40_000_00 });
    expect(dec.weekStart).toBe('2026-11-30');
    expect(dec.budgetMinor).toBe(4_354_838);
    expect(dec.countedFrom).toBe('2026-12-01');
    expect(dec.spentMinor).toBe(0);
    expect(dec.portions.map((p) => p.month)).toEqual(['2026-12']);
  });

  it('excludes days before the current month (closes to Savings)', () => {
    const r = [rule('salary', 'income', 650_000_00, '2026-09-10')];
    const s2: Settings = { ...settings, monthly_savings_target_minor: 20_000_00, monthly_investment_amount_minor: null };
    const t = [expense('2026-11-01', 2_400_00), expense('2026-10-28', 5_000_00)];
    const wk = computeWeeklyAllowance({ today: '2026-11-01', rules: r, txns: t, settings: s2, previousDeficitMinor: 0 });
    expect(wk.weekStart).toBe('2026-10-26');
    expect(wk.budgetMinor).toBe(21_000_00);
    expect(wk.spentMinor).toBe(2_400_00);
    expect(wk.remainingMinor).toBe(18_600_00);
  });

  it('overspent clamps', () => {
    const broke = [...txns, expense('2026-11-10', 400_000_00)];
    expect(computeMonthlyAllowance({ month: '2026-11', rules, txns: broke, settings, previousDeficitMinor: 0 }).remainingMinor)
      .toBe(-141_000_00);
    expect(computeWeeklyAllowance({ today: '2026-11-16', rules, txns: broke, settings, previousDeficitMinor: 0 }).budgetMinor).toBe(0);
  });

  describe('recurring totals do not rewrite the past', () => {
    const noSettings: Settings = { ...settings, monthly_savings_target_minor: 0, monthly_investment_amount_minor: null };
    const weekly = (o: Partial<RecurringRule> = {}): RecurringRule => ({
      ...rule('gym', 'expense', 10_000_00, '2026-11-02'), frequency: 'weekly', ...o,
    });
    const linked = (d: string, a: number, id = 'gym') => expense(d, a, { recurring_rule_id: id, source: 'recurring' });
    const month = (r: RecurringRule[], t: Txn[]) =>
      computeMonthlyAllowance({ month: '2026-11', rules: r, txns: t, settings: noSettings, previousDeficitMinor: 0 });

    it('counts the materialized txn instead of its occurrence', () => {
      // Occurrences: 11-02, 09, 16, 23, 30. One materialized at a different (old) amount.
      const r = [weekly({ last_materialized_date: '2026-11-02' })];
      expect(month(r, [linked('2026-11-02', 9_000_00)]).recurringExpensesMinor).toBe(9_000_00 + 4 * 10_000_00);
    });

    it('paused after its charge: charge still counted, later occurrences not', () => {
      const r = [weekly({ active: false, last_materialized_date: '2026-11-09' })];
      const t = [linked('2026-11-02', 10_000_00), linked('2026-11-09', 10_000_00)];
      expect(month(r, t).recurringExpensesMinor).toBe(20_000_00);
    });

    it("deleted rule's txns still counted", () => {
      expect(month([], [linked('2026-11-02', 10_000_00)]).recurringExpensesMinor).toBe(10_000_00);
      expect(month([], [linked('2026-11-02', 10_000_00)]).spentMinor).toBe(0);
    });

    it('re-priced rule: past at the old amount, future at the new', () => {
      const r = [weekly({ amount_minor: 12_000_00, amount_huf_minor: 12_000_00, last_materialized_date: '2026-11-09' })];
      const t = [linked('2026-11-02', 10_000_00), linked('2026-11-09', 10_000_00)];
      expect(month(r, t).recurringExpensesMinor).toBe(2 * 10_000_00 + 3 * 12_000_00);
    });

    it('rule with end_date before the month counts 0', () => {
      expect(month([weekly({ start_date: '2026-09-07', end_date: '2026-10-31' })], []).recurringExpensesMinor).toBe(0);
    });

    it('rule-linked income txn is recurring income, not one-off', () => {
      const t = [income('2026-11-10', 600_000_00, { recurring_rule_id: 'gone', source: 'recurring' }), income('2026-11-12', 5_000_00)];
      const a = month([], t);
      expect(a.recurringIncomeMinor).toBe(600_000_00);
      expect(a.oneOffIncomeMinor).toBe(5_000_00);
    });

    it('does not count occurrences up to last_materialized_date that were never written (schedule edit / re-activation)', () => {
      const r = [weekly({ last_materialized_date: '2026-11-15' })];
      expect(month(r, []).recurringExpensesMinor).toBe(3 * 10_000_00); // 16, 23, 30
    });
  });

  it('month override replaces the savings target for that month only', () => {
    const s = { ...settings, monthly_savings_target_minor: 10_000_000, month_overrides: { '2026-12': { savings_target_minor: 5_000_000 } } };
    expect(savingsTargetFor(s, '2026-12')).toBe(5_000_000);
    expect(savingsTargetFor(s, '2026-11')).toBe(10_000_000);
    expect(savingsTargetFor(s, '2027-01')).toBe(10_000_000);
    expect(computeMonthlyAllowance({ month: '2026-12', rules: [], txns: [], settings: s, previousDeficitMinor: 0 }).savingsTargetMinor).toBe(5_000_000);
    expect(computeMonthlyAllowance({ month: '2027-01', rules: [], txns: [], settings: s, previousDeficitMinor: 0 }).savingsTargetMinor).toBe(10_000_000);
  });
});
