import { describe, expect, it } from 'vitest';
import type { Account, MonthClose, RecurringRule, Settings, Txn } from '@/domain/types';
import { buildHomeModel, closeRecord, summarizeClose } from './homeModel';

const base = {
  id: 't', account_id: 'a1', amount_minor: 0, currency: 'HUF', amount_huf_minor: 0,
  category_id: null, source: 'manual', needs_review: false, recurring_rule_id: null, transfer_pair_id: null,
} as const;
let n = 0;
const mk = (kind: Txn['kind'], date: string, amount: number, over: Partial<Txn> = {}): Txn => ({
  ...base, id: `t${n++}`, kind, date, amount_minor: amount, amount_huf_minor: amount, ...over,
});
const rule = (id: string, kind: RecurringRule['kind'], amt: number, start: string): RecurringRule => ({
  id, name: id, kind, amount_minor: amt, currency: 'HUF', amount_huf_minor: amt, category_id: null,
  account_id: 'a1', frequency: 'monthly', start_date: start, end_date: null, last_materialized_date: null, active: true,
});
const rules = [rule('salary', 'income', 600_000_00, '2026-01-10'), rule('rent', 'expense', 200_000_00, '2026-01-01'), rule('netflix', 'expense', 5_000_00, '2026-01-15')];
const settings: Settings = {
  base_currency: 'HUF', monthly_savings_target_minor: 100_000_00, monthly_investment_amount_minor: 30_000_00,
  emergency_fund_months: 3, week_start: 'monday', digest_time: '20:00', timezone: 'Europe/Budapest',
};
const txns = [
  mk('expense', '2026-11-02', 15_000_00),
  mk('expense', '2026-11-03', 10_000_00),
  mk('income', '2026-11-20', 20_000_00),
  mk('expense', '2026-11-01', 200_000_00, { recurring_rule_id: 'rent' }),
  mk('transfer_out', '2026-11-05', 50_000_00), mk('transfer_in', '2026-11-05', 50_000_00, { account_id: 'a2' }),
  mk('expense', '2026-11-06', 1_000_00, { currency: 'EUR', amount_minor: 2_53, amount_huf_minor: 1_000_00, needs_review: true }),
];
const acct = (id: string, over: Partial<Account> = {}): Account => ({
  id, name: id, type: 'checking', currency: 'HUF', opening_balance_minor: 0, is_default: false, is_savings_target: false, archived: false, ...over,
});

describe('buildHomeModel', () => {
  const accounts = [acct('a1', { opening_balance_minor: 1_000_000_00 }), acct('a2', { type: 'savings' }), acct('a3', { archived: true, opening_balance_minor: 5 }),
    acct('a4', { currency: 'EUR', opening_balance_minor: 100_00 })];
  const m = buildHomeModel({ today: '2026-11-04', rules, txns, settings, closes: [], accounts, rates: { EUR: 400 } });

  it('month and week allowances', () => {
    expect(m.monthly.freeMinor).toBe(285_000_00);
    expect(m.monthly.remainingMinor).toBe(259_000_00);
    expect(m.weekly.budgetMinor).toBe(6_879_310);
    expect(m.daysLeftInMonth).toBe(27);
    expect(m.daysLeftInWeek).toBe(5);
    expect(m.dailyShareMinor).toBeCloseTo(6_879_310 / 7);
  });

  it('bars', () => {
    expect(m.bars.map((b) => b.date)[0]).toBe('2026-11-02');
    expect(m.bars.map((b) => b.spentMinor)).toEqual([15_000_00, 10_000_00, 0, 0, 1_000_00, 0, 0]);
    expect(m.bars.map((b) => b.future)).toEqual([false, false, false, true, true, true, true]);
    expect(m.bars[2].today).toBe(true);
    expect(m.bars.map((b) => b.over)).toEqual([true, true, false, false, false, false, false]);
  });

  it('week terms', () => {
    expect(m.weekTerms).toEqual({ leftOnMondayMinor: 285_000_00, daysToMonthEnd: 29 });
  });

  it('balances skip archived and convert foreign currency', () => {
    expect(m.accounts.map((a) => a.account.id)).toEqual(['a1', 'a2', 'a4']);
    expect(m.totalBalanceHufMinor).toBe(
      (1_000_000_00 - 15_000_00 - 10_000_00 - 200_000_00 - 50_000_00 - 2_53 + 20_000_00) + 50_000_00 + 100_00 * 400,
    );
  });

  it('review and recent', () => {
    expect(m.needsReview).toHaveLength(1);
    expect(m.recent).toHaveLength(5);
    expect(m.recent[0].date).toBe('2026-11-20');
  });

  it('carries the previous deficit', () => {
    const closes: MonthClose[] = [{ id: 'c', month: '2026-10', final_remaining_minor: -40_000_00, deficit_minor: 40_000_00, leftover_action: 'none', transfer_pair_id: null }];
    const d = buildHomeModel({ today: '2026-11-04', rules, txns, settings, closes, accounts: [] });
    expect(d.monthly.freeMinor).toBe(245_000_00);
  });
});

describe('summarizeClose / closeRecord', () => {
  const closes: MonthClose[] = [];
  it('leftover', () => {
    const s = summarizeClose({ month: '2026-11', rules, txns, settings, closes });
    expect(s.leftoverMinor).toBe(259_000_00);
    expect(closeRecord(s, 'move', 'p1')).toEqual({ month: '2026-11', final_remaining_minor: 259_000_00, deficit_minor: 0, leftover_action: 'transferred', transfer_pair_id: 'p1' });
    expect(closeRecord(s, 'keep', null).leftover_action).toBe('kept');
  });
  it('deficit', () => {
    const big = [...txns, mk('expense', '2026-11-10', 300_000_00)];
    const s = summarizeClose({ month: '2026-11', rules, txns: big, settings, closes });
    expect(s.deficitMinor).toBe(41_000_00);
    expect(closeRecord(s, 'ok', null)).toEqual({ month: '2026-11', final_remaining_minor: -41_000_00, deficit_minor: 41_000_00, leftover_action: 'none', transfer_pair_id: null });
  });
});
