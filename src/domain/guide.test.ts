import { describe, expect, test } from 'vitest';
import { currentStep, guideSteps } from './guide';

const input = { trackedMonths: 2, emergency: { savedMinor: 124_000_000, targetMinor: 228_000_000 }, emergencyMonths: 6, hasExpensiveDebt: null, monthlyInvestmentMinor: null };
describe('guideSteps', () => {
  test('step 2 is current', () => {
    const s = guideSteps(input);
    expect(s.map((x) => x.status)).toEqual(['done', 'now', 'todo', 'todo', 'todo']);
    expect(s[1].title).toBe('Emergency fund: 6 months');
    expect(currentStep(s)?.n).toBe(2);
  });
  test('a later step can already be done', () =>
    expect(guideSteps({ ...input, hasExpensiveDebt: false }).map((x) => x.status)).toEqual(['done', 'now', 'done', 'todo', 'todo']));
  test('no emergency goal means step 2 is not done', () =>
    expect(guideSteps({ ...input, emergency: null })[1].status).toBe('now'));
  test('new user starts at step 1', () => expect(currentStep(guideSteps({ ...input, trackedMonths: 0 }))?.n).toBe(1));
});
