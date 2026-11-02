import { describe, expect, test } from 'vitest';
import type { PurchaseOption, PurchasePlan } from '@/domain/types';
import { diffOptions, draftFromPlan, validatePlanDraft, type OptionDraft, type ValidOption } from './planDraft';

const opt = (o: Partial<OptionDraft> = {}): OptionDraft => ({ name: 'IKEA Kivik', priceText: '189 000', payment: 'one_time', installmentText: '', countText: '', link: '', note: '', ...o });

describe('validatePlanDraft', () => {
  test('valid one-time plan', () => {
    const r = validatePlanDraft({ title: ' Couch ', needed_by: '2026-12-15', options: [opt()] });
    expect(r).toEqual({ ok: true, title: 'Couch', needed_by: '2026-12-15', options: [{ name: 'IKEA Kivik', price_minor: 18_900_000, currency: 'HUF', payment: 'one_time', installment_minor: null, installment_count: null, link: null, note: null, position: 0 }] });
  });
  test('errors', () => {
    expect(validatePlanDraft({ title: '', needed_by: null, options: [opt()] })).toEqual({ ok: false, error: 'Give the plan a name.' });
    expect(validatePlanDraft({ title: 'Couch', needed_by: null, options: [] })).toEqual({ ok: false, error: 'Add at least one option.' });
    expect(validatePlanDraft({ title: 'Couch', needed_by: null, options: Array(9).fill(opt()) })).toEqual({ ok: false, error: 'Up to 8 options.' });
    expect(validatePlanDraft({ title: 'Couch', needed_by: null, options: [opt(), opt({ priceText: '0' })] })).toEqual({ ok: false, error: 'Option 2: enter a price.' });
    expect(validatePlanDraft({ title: 'Couch', needed_by: null, options: [opt({ name: ' ' })] })).toEqual({ ok: false, error: 'Option 1: add a name.' });
    expect(validatePlanDraft({ title: 'Couch', needed_by: null, options: [opt({ payment: 'installments', installmentText: '30 000', countText: '1' })] }))
      .toEqual({ ok: false, error: 'Option 1: enter the monthly payment and how many months.' });
    expect(validatePlanDraft({ title: 'Couch', needed_by: null, options: [opt({ payment: 'installments', installmentText: '30 000', countText: '12.5' })] }))
      .toEqual({ ok: false, error: 'Option 1: enter the monthly payment and how many months.' });
  });
  test('rejects non-http links', () =>
    expect(validatePlanDraft({ title: 'Couch', needed_by: null, options: [opt({ link: 'javascript:alert(1)' })] }))
      .toEqual({ ok: false, error: 'Option 1: the link must start with http:// or https://' }));
  test('installments keep total price and schedule', () => {
    const r = validatePlanDraft({ title: 'Couch', needed_by: null, options: [opt({ payment: 'installments', priceText: '360 000', installmentText: '30 000', countText: '12', link: ' https://jysk.hu/x ' })] });
    expect(r.ok && r.options[0]).toMatchObject({ price_minor: 36_000_000, installment_minor: 3_000_000, installment_count: 12, link: 'https://jysk.hu/x' });
  });
});

test('diffOptions', () => {
  const existing = [{ id: 'a' }, { id: 'b' }] as PurchaseOption[];
  const next = [{ id: 'a', name: 'A2' }, { name: 'New' }] as ValidOption[];
  expect(diffOptions(existing, next)).toEqual({ create: [{ name: 'New' }], update: [{ id: 'a', name: 'A2' }], remove: ['b'] });
});

test('draftFromPlan round-trips options in position order', () => {
  const plan = { title: 'Couch', needed_by: '2026-12-15' } as PurchasePlan;
  const options = [
    { id: 'b', name: 'B', price_minor: 36_000_000, payment: 'installments', installment_minor: 3_000_000, installment_count: 12, link: null, note: 'n', position: 1 },
    { id: 'a', name: 'A', price_minor: 18_900_000, payment: 'one_time', installment_minor: null, installment_count: null, link: 'https://x.hu', note: null, position: 0 },
  ] as PurchaseOption[];
  const d = draftFromPlan(plan, options);
  expect(d.options.map((o) => o.id)).toEqual(['a', 'b']);
  const r = validatePlanDraft(d);
  expect(r.ok && r.options.map(({ id, ...o }) => o)).toEqual([
    { name: 'A', price_minor: 18_900_000, currency: 'HUF', payment: 'one_time', installment_minor: null, installment_count: null, link: 'https://x.hu', note: null, position: 0 },
    { name: 'B', price_minor: 36_000_000, currency: 'HUF', payment: 'installments', installment_minor: 3_000_000, installment_count: 12, link: null, note: 'n', position: 1 },
  ]);
});
