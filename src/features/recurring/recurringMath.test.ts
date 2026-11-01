import { describe, expect, it } from 'vitest';
import type { RecurringRule } from '@/domain/types';
import { frequencyLabel, monthlyHufMinor, rulePatchForEdit, rulePatchForToggle } from './recurringMath';

const rule: RecurringRule = {
  id: 'r', name: 'Gym', kind: 'expense', amount_minor: 10_000_00, currency: 'HUF', amount_huf_minor: 10_000_00,
  category_id: null, account_id: 'a1', frequency: 'monthly', start_date: '2026-09-10', end_date: null,
  last_materialized_date: '2026-10-10', active: true,
};

describe('recurringMath', () => {
  it('normalizes to monthly', () => {
    expect(monthlyHufMinor({ frequency: 'monthly', amount_huf_minor: 1200 })).toBe(1200);
    expect(monthlyHufMinor({ frequency: 'weekly', amount_huf_minor: 1200 })).toBe(5200);
    expect(monthlyHufMinor({ frequency: 'yearly', amount_huf_minor: 1200 })).toBe(100);
  });
  it('labels frequency', () => {
    expect(frequencyLabel({ frequency: 'monthly', start_date: '2026-09-10' })).toBe('Monthly on the 10th');
    expect(frequencyLabel({ frequency: 'monthly', start_date: '2026-09-22' })).toBe('Monthly on the 22nd');
    expect(frequencyLabel({ frequency: 'weekly', start_date: '2026-11-02' })).toBe('Weekly on Mondays');
    expect(frequencyLabel({ frequency: 'yearly', start_date: '2026-03-01' })).toBe('Yearly on Mar 1');
  });
});

describe('rule edits never rewrite or backfill history', () => {
  const { id: _id, last_materialized_date: _l, active: _a, ...fields } = rule;
  it('editing start date or frequency keeps last_materialized_date', () => {
    const p = rulePatchForEdit({ ...fields, start_date: '2026-08-01', frequency: 'weekly' });
    expect(p).not.toHaveProperty('last_materialized_date');
    expect(p).toMatchObject({ start_date: '2026-08-01', frequency: 'weekly' });
  });
  it('editing the amount keeps last_materialized_date', () => {
    expect(rulePatchForEdit({ ...fields, amount_minor: 12_000_00, amount_huf_minor: 12_000_00 })).not.toHaveProperty('last_materialized_date');
  });
  it('re-activating skips the paused period (last_materialized_date = yesterday)', () => {
    expect(rulePatchForToggle({ ...rule, active: false }, '2026-11-01')).toEqual({ active: true, last_materialized_date: '2026-10-31' });
  });
  it('pausing only flips active', () => {
    expect(rulePatchForToggle(rule, '2026-11-01')).toEqual({ active: false });
  });
});
