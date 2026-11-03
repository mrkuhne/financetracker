import { describe, expect, test } from 'vitest';
import { currentStep, guideSteps, investedRecently } from './guide';

const input = { trackedMonths: 2, emergency: { savedMinor: 124_000_000, targetMinor: 228_000_000 }, emergencyMonths: 6, hasExpensiveDebt: null, investedRecently: false };
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
  test('step 4 follows investedRecently', () => {
    expect(guideSteps({ ...input, investedRecently: true })[3].status).toBe('done');
    expect(guideSteps({ ...input, investedRecently: false })[3].status).not.toBe('done');
  });
  test('new user starts at step 1', () => expect(currentStep(guideSteps({ ...input, trackedMonths: 0 }))?.n).toBe(1));
});

describe('investedRecently', () => {
  const buy = (date: string, kind: 'invest_buy' | 'invest_sell' = 'invest_buy') => ({ kind, date }) as Parameters<typeof investedRecently>[0][number];
  test('a buy this or last month counts', () => {
    expect(investedRecently([buy('2026-11-02')], '2026-11-15')).toBe(true);
    expect(investedRecently([buy('2026-10-31')], '2026-11-15')).toBe(true);
    expect(investedRecently([buy('2025-12-31')], '2026-01-05')).toBe(true);
  });
  test('older buys and sells do not', () => {
    expect(investedRecently([buy('2026-09-30')], '2026-11-15')).toBe(false);
    expect(investedRecently([buy('2026-11-02', 'invest_sell')], '2026-11-15')).toBe(false);
  });
});
