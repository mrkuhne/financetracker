import { expect, it } from 'vitest';
import { parseAmountInput } from './amountInput';

it('parses decimals, commas and spaces', () => {
  expect(parseAmountInput('1 250,50')).toBe(125050);
  expect(parseAmountInput('12.5')).toBe(1250);
  expect(parseAmountInput('-30')).toBe(-3000);
});
it('returns null for empty or junk', () => {
  expect(parseAmountInput('')).toBeNull();
  expect(parseAmountInput('abc')).toBeNull();
  expect(parseAmountInput('1.2.3')).toBeNull();
});
