import { describe, expect, test } from 'vitest';
import type { Category } from '@/data/categories';
import type { Settings, Txn } from '@/domain/types';
import { categoryBudgetRows, effectiveCategoryBudget } from './budgets';

const BASE_SETTINGS: Settings = {
  base_currency: 'HUF', monthly_savings_target_minor: 0, monthly_investment_amount_minor: 0,
  emergency_fund_months: 3, week_start: 'monday', digest_time: '20:00', timezone: 'Europe/Budapest',
  month_overrides: {}, has_expensive_debt: null,
};
const cat = (id: string, name: string, kind: Category['kind'], budget: number | null): Category => ({ id, name, kind, icon: 'dots', monthly_budget_minor: budget });
const dining = cat('c1', 'Dining out', 'expense', 6_000_000);
const groceries = cat('c2', 'Groceries', 'expense', null);
const salary = cat('c3', 'Salary', 'income', null);
const txn = (date: string, kind: Txn['kind'], amount: number, extra: Partial<Txn> = {}): Txn => ({
  id: `${date}-${kind}-${amount}`, account_id: 'a1', kind, amount_minor: amount, currency: 'HUF', amount_huf_minor: amount,
  category_id: null, date, source: 'manual', needs_review: false, recurring_rule_id: null, transfer_pair_id: null, ...extra,
});

const s: Settings = { ...BASE_SETTINGS, month_overrides: { '2026-12': { category_budgets: { c1: 2_000_000 } } } };

describe('category budgets', () => {
  test('override wins only in its month', () => {
    expect(effectiveCategoryBudget(dining, s, '2026-12')).toBe(2_000_000);
    expect(effectiveCategoryBudget(dining, s, '2026-11')).toBe(6_000_000);
  });
  test('rows', () => {
    const rows = categoryBudgetRows([dining, groceries, salary], [
      txn('2026-12-03', 'expense', 1_500_000, { category_id: 'c1' }),
      txn('2026-11-30', 'expense', 9, { category_id: 'c1' }),
      txn('2026-12-04', 'expense', 700, { category_id: 'c1', recurring_rule_id: 'r1' }),
    ], s, '2026-12');
    expect(rows.map((r) => [r.category.name, r.budgetMinor, r.isMonthOnly, r.spentMinor, r.leftMinor]))
      .toEqual([['Groceries', null, false, 0, null], ['Dining out', 2_000_000, true, 1_500_700, 499_300]]);
  });
});
