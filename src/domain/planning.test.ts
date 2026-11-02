import { describe, expect, test } from 'vitest';
import {
  averageMonthlyExpensesMinor, averageMonthlyIncomeMinor, buildPlanningModel, completeMonthTotals,
  emergencyAfterMinor, simulateOption, typicalMonthlySpendMinor,
} from './planning';
import type { RecurringRule, Settings, Txn } from './types';

const txn = (date: string, kind: Txn['kind'], amountMinor: number, ruleId: string | null = null): Txn => ({
  id: `${date}-${kind}-${amountMinor}-${ruleId}`, account_id: 'a1', kind, amount_minor: amountMinor, currency: 'HUF',
  amount_huf_minor: amountMinor, category_id: null, date, source: 'manual', needs_review: false,
  recurring_rule_id: ruleId, transfer_pair_id: null,
});
const rule = (o: Partial<RecurringRule>): RecurringRule => ({
  id: 'rule', name: 'rule', kind: 'expense', amount_minor: 0, currency: 'HUF', amount_huf_minor: 0, category_id: null,
  account_id: 'a1', frequency: 'monthly', start_date: '2026-01-01', end_date: null, last_materialized_date: null, active: true,
  ...o,
});
const SETTINGS: Settings = {
  base_currency: 'HUF', monthly_savings_target_minor: 0, monthly_investment_amount_minor: 0,
  emergency_fund_months: 3, week_start: 'monday', digest_time: '20:00', timezone: 'Europe/Budapest',
  month_overrides: {}, has_expensive_debt: null,
};

const hist = [txn('2026-09-03', 'expense', 30_000_000), txn('2026-09-05', 'expense', 20_000_000, 'r1'),
  txn('2026-10-03', 'expense', 36_000_000), txn('2026-10-05', 'expense', 20_000_000, 'r1'),
  txn('2026-10-01', 'income', 65_000_000, 'r2'), txn('2026-10-09', 'transfer_out', 9_000_000)];

describe('averages', () => {
  test('typical spend averages complete months, excluding recurring and transfers', () =>
    expect(typicalMonthlySpendMinor(hist, '2026-11-15')).toBe(33_000_000));
  test('average expenses include recurring-linked expenses', () =>
    expect(averageMonthlyExpensesMinor(hist, [], SETTINGS, '2026-11-15')).toBe(53_000_000));
  test('average income over complete months', () =>
    expect(averageMonthlyIncomeMinor(hist, [], SETTINGS, '2026-11-15')).toBe(32_500_000));
  test('tracked months counts complete months', () =>
    expect(completeMonthTotals(hist, '2026-11-15').map((m) => m.month)).toEqual(['2026-09', '2026-10']));
  test('only the last 3 complete months count', () => {
    const t = [txn('2026-06-10', 'expense', 90_000_000),
      ...['2026-07', '2026-08', '2026-09', '2026-10'].map((m) => txn(`${m}-10`, 'expense', 30_000_000))];
    expect(typicalMonthlySpendMinor(t, '2026-11-15')).toBe(30_000_000);
  });
  test('no complete month: extrapolates this month', () =>
    expect(typicalMonthlySpendMinor([txn('2026-11-02', 'expense', 10_000_000)], '2026-11-10')).toBe(30_000_000));
  test('no complete month: expenses = projected recurring + typical spend', () => {
    const rent = rule({ amount_huf_minor: 20_000_000, amount_minor: 20_000_000, start_date: '2026-11-05', frequency: 'monthly', kind: 'expense' });
    expect(averageMonthlyExpensesMinor([txn('2026-11-02', 'expense', 10_000_000)], [rent], SETTINGS, '2026-11-10')).toBe(50_000_000);
  });
  test('no complete month: income = recurring + one-off', () => {
    const pay = rule({ id: 'pay', kind: 'income', amount_huf_minor: 60_000_000, amount_minor: 60_000_000, start_date: '2026-11-05' });
    expect(averageMonthlyIncomeMinor([txn('2026-11-02', 'income', 5_000_000)], [pay], SETTINGS, '2026-11-10')).toBe(65_000_000);
  });
  test('no data at all gives zeros, not NaN', () => {
    expect(typicalMonthlySpendMinor([], '2026-11-10')).toBe(0);
    expect(averageMonthlyExpensesMinor([], [], SETTINGS, '2026-11-10')).toBe(0);
  });
});

describe('buildPlanningModel', () => {
  test('does not throw on empty data', () => {
    expect(buildPlanningModel({ today: '2026-11-10', rules: [], txns: [], settings: SETTINGS, closes: [] }))
      .toMatchObject({ month: '2026-11', remainingMinor: 0, setAsideMinor: 0, typicalSpendMinor: 0, trackedMonths: 0 });
  });
  test('set-aside is next month free minus typical spend; remaining uses carried deficit', () => {
    const pay = rule({ id: 'pay', kind: 'income', amount_huf_minor: 60_000_000, amount_minor: 60_000_000 });
    const m = buildPlanningModel({
      today: '2026-11-15', rules: [pay], txns: hist, settings: SETTINGS,
      closes: [{ month: '2026-10', deficit_minor: 1_000_000 } as never],
    });
    expect(m.typicalSpendMinor).toBe(33_000_000);
    expect(m.setAsideMinor).toBe(27_000_000);
    expect(m.remainingMinor).toBe(59_000_000);
    expect(m.trackedMonths).toBe(2);
  });
});

const base = { remainingMinor: 15_000_000, setAsideMinor: 12_000_000, currentMonth: '2026-11' };
const one = (price: number) => ({ payment: 'one_time' as const, price_minor: price, installment_minor: null, installment_count: null });
const inst = (m: number, n = 12) => ({ payment: 'installments' as const, price_minor: m * n, installment_minor: m, installment_count: n });

describe('simulateOption', () => {
  test('one-time that fits now', () => expect(simulateOption({ ...base, option: one(10_000_000) }))
    .toEqual({ leftThisMonthMinor: 5_000_000, touchesSavingsMinor: 0, monthlyCostMinor: 10_000_000, safeMonth: '2026-11' }));
  test('one-time that fits next month', () => expect(simulateOption({ ...base, option: one(18_900_000) }))
    .toEqual({ leftThisMonthMinor: -3_900_000, touchesSavingsMinor: 3_900_000, monthlyCostMinor: 18_900_000, safeMonth: '2026-12' }));
  test('one-time five months out', () => expect(simulateOption({ ...base, option: one(69_000_000) }).safeMonth).toBe('2027-04'));
  test('never affordable when set-aside is 0', () => expect(simulateOption({ ...base, setAsideMinor: 0, option: one(20_000_000) }).safeMonth).toBeNull());
  test('beyond 24 months is null', () => expect(simulateOption({ ...base, setAsideMinor: 100_000, option: one(500_000_000) }).safeMonth).toBeNull());
  test('negative remaining counts as 0 for saving up', () => expect(simulateOption({ ...base, remainingMinor: -5_000_000, option: one(10_000_000) }))
    .toEqual({ leftThisMonthMinor: -15_000_000, touchesSavingsMinor: 15_000_000, monthlyCostMinor: 10_000_000, safeMonth: '2026-12' }));
  test('installments that fit', () => expect(simulateOption({ ...base, option: inst(3_000_000) }))
    .toEqual({ leftThisMonthMinor: 12_000_000, touchesSavingsMinor: 0, monthlyCostMinor: 3_000_000, safeMonth: '2026-11' }));
  test('installment above set-aside never fits', () => expect(simulateOption({ ...base, option: inst(13_000_000) }).safeMonth).toBeNull());
  test('installment above remaining starts next month', () => expect(simulateOption({ ...base, remainingMinor: 5_000_000, option: inst(11_000_000) }).safeMonth).toBe('2026-12'));
});

describe('emergencyAfterMinor', () => {
  const ea = { ...base, emergencySavedMinor: 124_000_000 };
  test('cuts cover the gap: emergency untouched', () =>
    expect(emergencyAfterMinor({ ...ea, option: one(32_000_000), plannedMonth: '2026-12', cutsMinor: 5_000_000 })).toBe(124_000_000));
  test('gap comes out of savings', () =>
    expect(emergencyAfterMinor({ ...ea, option: one(32_000_000), plannedMonth: '2026-12', cutsMinor: 0 })).toBe(119_000_000));
  test('installment shortfall over every month', () =>
    expect(emergencyAfterMinor({ ...ea, option: inst(13_000_000), plannedMonth: '2026-11', cutsMinor: 0 })).toBe(112_000_000));
  test('never below zero', () =>
    expect(emergencyAfterMinor({ ...ea, emergencySavedMinor: 1_000_000, option: one(90_000_000), plannedMonth: '2026-11', cutsMinor: 0 })).toBe(0));
});
