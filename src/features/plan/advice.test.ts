import { describe, expect, test } from 'vitest';
import type { Category } from '@/data/categories';
import { adviceCutsMinor, adviceFingerprint, buildAdvicePrompt, normalizeAdvice, type AdviceInput } from './advice';
import type { PurchaseOption } from '@/domain/types';

const cat = (id: string, name: string, kind: 'expense' | 'income'): Category => ({ id, name, kind, icon: 'dots', monthly_budget_minor: null });
const cats = [cat('c1', 'Dining out', 'expense'), cat('c2', 'Salary', 'income'), cat('c3', 'Groceries', 'expense'), cat('c4', 'Transport', 'expense'), cat('c5', 'Health', 'expense')];
const ctx = { optionCount: 3, currentMonth: '2026-11', savingsTargetFor: () => 10_000_000, categories: cats, effectiveBudget: (id: string) => (id === 'c1' ? 6_000_000 : null) };
const good = { recommended_option: 2, best_month: '2026-12', summary: ' B in December. ', others: 'A is small.',
  changes: [ { type: 'category_budget', category_name: 'dining OUT', new_amount_huf: 20000 }, { type: 'savings_target', new_amount_huf: 50000 } ] };

describe('normalizeAdvice', () => {
  test('valid advice', () => expect(normalizeAdvice(good, ctx)).toEqual({ option_index: 1, month: '2026-12', summary: 'B in December.', others: 'A is small.', changes: [
    { type: 'category_budget', category_id: 'c1', category_name: 'Dining out', from_minor: 6_000_000, to_minor: 2_000_000 },
    { type: 'savings_target', from_minor: 10_000_000, to_minor: 5_000_000 } ] }));
  test('bad option number is unusable', () => { expect(normalizeAdvice({ ...good, recommended_option: 0 }, ctx)).toBeNull(); expect(normalizeAdvice({ ...good, recommended_option: 9 }, ctx)).toBeNull(); });
  test('non-objects are unusable', () => { expect(normalizeAdvice(null, ctx)).toBeNull(); expect(normalizeAdvice('x', ctx)).toBeNull(); });
  test('empty summary is unusable', () => expect(normalizeAdvice({ ...good, summary: ' ' }, ctx)).toBeNull());
  test('junk changes are dropped', () => expect(normalizeAdvice({ ...good, changes: [
    { type: 'category_budget', category_name: 'Salary', new_amount_huf: 1 },
    { type: 'category_budget', category_name: 'Rockets', new_amount_huf: 1 },
    { type: 'category_budget', category_name: 'Dining out', new_amount_huf: 80000 },
    { type: 'savings_target', new_amount_huf: 150000 },
    { type: 'savings_target', new_amount_huf: -5 },
    { type: 'postpone', month: '2026-10' },
    { type: 'teleport' } ] }, ctx)?.changes).toEqual([]));
  test('bad best_month falls back to current; postpone wins', () => {
    expect(normalizeAdvice({ ...good, best_month: '2026-13', changes: [] }, ctx)?.month).toBe('2026-11');
    expect(normalizeAdvice({ ...good, changes: [{ type: 'postpone', month: '2027-02' }] }, ctx)?.month).toBe('2027-02');
  });
  test('at most 3 changes', () => {
    const r = normalizeAdvice({ ...good, changes: [
      { type: 'category_budget', category_name: 'Dining out', new_amount_huf: 20000 },
      { type: 'category_budget', category_name: 'Groceries', new_amount_huf: 50000 },
      { type: 'category_budget', category_name: 'Transport', new_amount_huf: 10000 },
      { type: 'category_budget', category_name: 'Health', new_amount_huf: 5000 },
      { type: 'savings_target', new_amount_huf: 50000 } ] }, ctx);
    expect(r?.changes).toHaveLength(3);
    expect(r?.changes.map((c) => (c.type === 'category_budget' ? c.category_name : c.type))).toEqual(['Dining out', 'Groceries', 'Transport']);
  });
  test('one change per category, one savings, one postpone', () => {
    const r = normalizeAdvice({ ...good, changes: [
      { type: 'category_budget', category_name: 'Dining out', new_amount_huf: 20000 },
      { type: 'category_budget', category_name: 'dining out', new_amount_huf: 10000 },
      { type: 'savings_target', new_amount_huf: 50000 }, { type: 'savings_target', new_amount_huf: 40000 } ] }, ctx);
    expect(r?.changes).toHaveLength(2);
  });
  test('cuts are checked against the advice month, not the current month', () => {
    // Nov has an override of 50 000; Dec uses the permanent 100 000. Dining out: Nov 30 000, Dec 60 000.
    const monthCtx = { ...ctx,
      savingsTargetFor: (m: string) => (m === '2026-11' ? 5_000_000 : 10_000_000),
      effectiveBudget: (id: string, m: string) => (id === 'c1' ? (m === '2026-11' ? 3_000_000 : 6_000_000) : null) };
    const r = normalizeAdvice({ ...good, best_month: '2026-12', changes: [
      { type: 'savings_target', new_amount_huf: 40000 }, { type: 'category_budget', category_name: 'Dining out', new_amount_huf: 40000 } ] }, monthCtx);
    expect(r?.changes).toEqual([{ type: 'savings_target', from_minor: 10_000_000, to_minor: 4_000_000 },
      { type: 'category_budget', category_id: 'c1', category_name: 'Dining out', from_minor: 6_000_000, to_minor: 4_000_000 }]);
    // A postpone month takes precedence over best_month for the check.
    const p = normalizeAdvice({ ...good, best_month: '2026-11', changes: [
      { type: 'savings_target', new_amount_huf: 80000 }, { type: 'postpone', month: '2026-12' } ] }, monthCtx);
    expect(p?.changes).toEqual([{ type: 'savings_target', from_minor: 10_000_000, to_minor: 8_000_000 }, { type: 'postpone', month: '2026-12' }]);
    // Invalid best_month falls back to the current month: 80 000 is not a cut of Nov's 50 000.
    expect(normalizeAdvice({ ...good, best_month: 'soon', changes: [{ type: 'savings_target', new_amount_huf: 80000 }] }, monthCtx)?.changes).toEqual([]);
  });
  test('a valid postpone past the cap is kept, so the month matches the changes', () => {
    const r = normalizeAdvice({ ...good, changes: [
      { type: 'category_budget', category_name: 'Dining out', new_amount_huf: 20000 },
      { type: 'category_budget', category_name: 'Groceries', new_amount_huf: 50000 },
      { type: 'category_budget', category_name: 'Transport', new_amount_huf: 10000 },
      { type: 'postpone', month: '2027-01' } ] }, ctx);
    expect(r?.month).toBe('2027-01');
    expect(r?.changes.map((c) => c.type)).toEqual(['category_budget', 'category_budget', 'postpone']);
  });
  test('caps text at 1000 characters, others defaults to empty', () => {
    const r = normalizeAdvice({ ...good, summary: 'x'.repeat(2000), others: undefined }, ctx);
    expect(r?.summary).toHaveLength(1000);
    expect(r?.others).toBe('');
  });
});

test('cuts', () => expect(adviceCutsMinor(normalizeAdvice(good, ctx)!.changes)).toBe(9_000_000));
test('cuts ignore categories without a budget', () => expect(adviceCutsMinor([{ type: 'category_budget', category_id: 'c', category_name: 'X', from_minor: null, to_minor: 1 }, { type: 'postpone', month: '2026-12' }])).toBe(0));

const options: PurchaseOption[] = [{ id: 'o1', plan_id: 'p', name: 'IKEA', price_minor: 18_900_000, currency: 'HUF', payment: 'one_time', installment_minor: null, installment_count: null, link: null, note: null, position: 0 }];
const planning = { month: '2026-11', remainingMinor: 100, setAsideMinor: 50 };
describe('adviceFingerprint', () => {
  test('stable and sensitive to inputs', () => {
    expect(adviceFingerprint(options, planning)).toBe(adviceFingerprint([...options], { ...planning }));
    expect(adviceFingerprint(options, planning)).not.toBe(adviceFingerprint([{ ...options[0], price_minor: 1 }], planning));
    expect(adviceFingerprint(options, planning)).not.toBe(adviceFingerprint(options, { ...planning, remainingMinor: 101 }));
    expect(adviceFingerprint(options, planning)).not.toBe(adviceFingerprint(options, { ...planning, month: '2026-12' }));
  });
});

test('prompt contains the rules and the data, and nothing personal', () => {
  const input: AdviceInput = { planTitle: 'Couch', neededBy: '2026-12-15', currentMonth: '2026-11',
    options: [{ letter: 'A', name: 'IKEA Kivik', payment: 'one_time', priceMinor: 18_900_000, installmentMinor: null, count: null, impact: { leftThisMonthMinor: -100_000, touchesSavingsMinor: 100_000, monthlyCostMinor: 18_900_000, safeMonth: '2027-03' } }],
    remainingMinor: 5_000_000, setAsideMinor: 3_000_000, savingsTargetMinor: 10_000_000, emergencyMonthsCovered: 3.2, emergencyGoalMonths: 6,
    categories: [{ name: 'Dining out', budgetMinor: 6_000_000, spentThisMonthMinor: 1_400_000 }] };
  const p = buildAdvicePrompt(input);
  for (const s of ['1-based', 'at most 3', 'YYYY-MM', '24 months', 'IKEA Kivik', 'Dining out', '189 000', '2027-03', 'Monthly cost 189 000 Ft']) expect(p).toContain(s);
});
