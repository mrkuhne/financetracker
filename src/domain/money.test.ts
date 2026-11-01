import { describe, it, expect } from 'vitest';
import { toMinor, fromMinor, toHufMinor, formatMoney } from './money';

describe('money', () => {
  it('converts major to minor and back', () => {
    expect(toMinor(285000)).toBe(28_500_000);
    expect(fromMinor(28_500_000)).toBe(285000);
  });
  it('converts to HUF minor, rounding half away from zero', () => {
    expect(toHufMinor(1_000, 395.5)).toBe(395_500);
    expect(toHufMinor(-1_000, 395.5)).toBe(-395_500);
    expect(toHufMinor(1, 0.5)).toBe(1);
    expect(toHufMinor(-1, 0.5)).toBe(-1);
  });
  it('formats HUF without decimals and EUR with 2', () => {
    expect(formatMoney(28_500_000, 'HUF').replace(/\s/g, ' ')).toBe('285 000 Ft');
    expect(formatMoney(1_050, 'EUR')).toMatch(/10[.,]50/);
  });
});
