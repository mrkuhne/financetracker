import { describe, expect, it } from 'vitest';
import { frequencyLabel, monthlyHufMinor } from './recurringMath';

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
