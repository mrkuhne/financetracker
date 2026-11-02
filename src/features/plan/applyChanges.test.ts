import { describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS } from '@/data/settings';
import type { AdviceChange } from '@/domain/types';
import { changesForMode, planApply } from './applyChanges';

const settings = { ...DEFAULT_SETTINGS, monthly_savings_target_minor: 10_000_000, month_overrides: { '2027-01': { savings_target_minor: 1 } } };
const changes: AdviceChange[] = [{ type: 'savings_target', from_minor: 10_000_000, to_minor: 5_000_000 },
  { type: 'category_budget', category_id: 'c1', category_name: 'Dining out', from_minor: 6_000_000, to_minor: 2_000_000 }, { type: 'postpone', month: '2026-12' }];

test('month mode writes overrides only for that month', () => expect(planApply({ changes, mode: 'month', month: '2026-12', settings })).toEqual({
  settingsPatch: { month_overrides: { '2027-01': { savings_target_minor: 1 }, '2026-12': { savings_target_minor: 5_000_000, category_budgets: { c1: 2_000_000 } } } },
  categoryPatches: [] }));
test('permanent mode', () => expect(planApply({ changes, mode: 'permanent', month: '2026-12', settings })).toEqual({
  settingsPatch: { monthly_savings_target_minor: 5_000_000 }, categoryPatches: [{ id: 'c1', monthly_budget_minor: 2_000_000 }] }));
test('postpone only', () => expect(planApply({ changes: [changes[2]], mode: 'month', month: '2026-12', settings })).toEqual({ settingsPatch: {}, categoryPatches: [] }));
test('month mode keeps existing overrides of the same month', () => {
  const s = { ...settings, month_overrides: { '2026-12': { savings_target_minor: 7, category_budgets: { c9: 5 } } } };
  expect(planApply({ changes: [changes[1]], mode: 'month', month: '2026-12', settings: s }).settingsPatch)
    .toEqual({ month_overrides: { '2026-12': { savings_target_minor: 7, category_budgets: { c9: 5, c1: 2_000_000 } } } });
});

describe('changesForMode', () => {
  const permanent = { savingsTargetMinor: 8_000_000, budget: (id: string) => (id === 'c1' ? 1_000_000 : id === 'c2' ? null : 9_000_000) };
  const list: AdviceChange[] = [
    { type: 'savings_target', from_minor: 10_000_000, to_minor: 5_000_000 },
    { type: 'category_budget', category_id: 'c1', category_name: 'Dining out', from_minor: 6_000_000, to_minor: 2_000_000 },
    { type: 'category_budget', category_id: 'c2', category_name: 'Groceries', from_minor: 6_000_000, to_minor: 3_000_000 },
    { type: 'category_budget', category_id: 'c3', category_name: 'Transport', from_minor: null, to_minor: 4_000_000 },
    { type: 'postpone', month: '2026-12' },
  ];
  test('month mode keeps the changes as they are', () => expect(changesForMode(list, 'month', permanent)).toBe(list));
  test('from now on: from is the permanent value, and non-cuts are dropped', () => expect(changesForMode(list, 'permanent', permanent)).toEqual([
    { type: 'savings_target', from_minor: 8_000_000, to_minor: 5_000_000 },
    { type: 'category_budget', category_id: 'c2', category_name: 'Groceries', from_minor: null, to_minor: 3_000_000 },
    { type: 'category_budget', category_id: 'c3', category_name: 'Transport', from_minor: 9_000_000, to_minor: 4_000_000 },
    { type: 'postpone', month: '2026-12' },
  ]));
  test('from now on: a savings change at or above the permanent target is dropped', () =>
    expect(changesForMode([list[0]], 'permanent', { ...permanent, savingsTargetMinor: 5_000_000 })).toEqual([]));
});
