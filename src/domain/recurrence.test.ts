import { describe, it, expect } from 'vitest';
import { occurrencesInRange, dueOccurrences } from './recurrence';
import type { RecurringRule } from './types';

const base: RecurringRule = {
  id: 'r1', name: 'Rule', kind: 'expense', amount_minor: 1000, currency: 'HUF',
  amount_huf_minor: 1000, category_id: 'c1', account_id: 'a1',
  frequency: 'monthly', start_date: '2026-01-01', end_date: null,
  last_materialized_date: null, active: true,
} as RecurringRule;

describe('occurrencesInRange', () => {
  it('clamps monthly to month end', () => {
    expect(occurrencesInRange({ ...base, frequency: 'monthly', start_date: '2026-01-31' }, '2026-02-01', '2026-04-30'))
      .toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });
  it('weekly', () => {
    expect(occurrencesInRange({ ...base, frequency: 'weekly', start_date: '2026-11-02' }, '2026-11-01', '2026-11-30'))
      .toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  });
  it('yearly leap', () => {
    expect(occurrencesInRange({ ...base, frequency: 'yearly', start_date: '2024-02-29' }, '2025-01-01', '2025-12-31'))
      .toEqual(['2025-02-28']);
  });
  it('respects start and end', () => {
    expect(occurrencesInRange({ ...base, frequency: 'monthly', start_date: '2026-12-10' }, '2026-11-01', '2026-11-30')).toEqual([]);
    expect(occurrencesInRange({ ...base, frequency: 'monthly', start_date: '2026-01-10', end_date: '2026-03-10' }, '2026-01-01', '2026-12-31'))
      .toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
  });
});

describe('dueOccurrences', () => {
  const salary = { ...base, frequency: 'monthly' as const, start_date: '2026-09-10' };
  it('catches up', () => {
    expect(dueOccurrences(salary, '2026-11-12')).toEqual(['2026-09-10', '2026-10-10', '2026-11-10']);
  });
  it('is bounded by last_materialized_date', () => {
    expect(dueOccurrences({ ...salary, last_materialized_date: '2026-11-10' }, '2026-11-12')).toEqual([]);
  });
  it('ignores inactive', () => {
    expect(dueOccurrences({ ...salary, active: false }, '2026-11-12')).toEqual([]);
  });
});
