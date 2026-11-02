import { expect, test } from 'vitest';
import { DEFAULT_SETTINGS } from '@/data/settings';
import type { AdviceChange } from '@/domain/types';
import { planApply } from './applyChanges';

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
