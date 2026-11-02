import { describe, expect, test } from 'vitest';
import { guideSteps } from '@/domain/guide';
import { huf } from '@/features/home/fmt';
import { buildGuidePrompt, fallbackFact, guideCacheKey, normalizeGuide, type GuideFacts } from './guideAi';

const steps = guideSteps({
  trackedMonths: 2, emergency: { savedMinor: 100, targetMinor: 1000 }, emergencyMonths: 6, hasExpensiveDebt: null, monthlyInvestmentMinor: null,
});
const facts: GuideFacts = {
  avgIncomeMinor: 65_000_000, avgExpensesMinor: 38_000_000, trackedMonths: 2, savingsTargetMinor: 10_000_000, investmentMinor: null,
  emergencySavedMinor: 12_000_000, emergencyTargetMinor: 228_000_000, emergencyMonthsCovered: 3.3, emergencyGoalMonths: 6,
  monthsToEmergency: 11, hasExpensiveDebt: null, steps,
};

describe('guideAi', () => {
  test('normalize', () => {
    expect(normalizeGuide({ intro: ' Hi. ', tips: [{ step: 2, text: ' Keep going. ' }, { step: 7, text: 'x' }, { step: 3, text: '' }] }))
      .toEqual({ intro: 'Hi.', tips: { 2: 'Keep going.' } });
    expect(normalizeGuide({ intro: '', tips: [] })).toBeNull();
    expect(normalizeGuide('nope')).toBeNull();
  });
  test('normalize: last tip wins, caps lengths', () => {
    const r = normalizeGuide({ intro: 'a'.repeat(900), tips: [{ step: 1, text: 'one' }, { step: 1, text: 'b'.repeat(500) }] });
    expect(r?.intro).toHaveLength(800);
    expect(r?.tips[1]).toHaveLength(400);
  });
  test('cache key buckets by 50 000 Ft', () => {
    const k1 = guideCacheKey({ ...facts, avgIncomeMinor: 65_000_000 });
    expect(guideCacheKey({ ...facts, avgIncomeMinor: 66_000_000 })).toBe(k1);
    expect(guideCacheKey({ ...facts, avgIncomeMinor: 75_000_000 })).not.toBe(k1);
  });
  test('fallback facts', () => {
    expect(fallbackFact(steps[1], { ...facts, emergencyMonthsCovered: 3.3, emergencyGoalMonths: 6, savingsTargetMinor: 10_000_000, monthsToEmergency: 11 }))
      .toBe(`3.3 of 6 months. At ${huf(10_000_000)} a month you reach it in about 11 months.`);
    expect(fallbackFact(steps[2], { ...facts, hasExpensiveDebt: null })).toBe('Do you have a credit card balance or personal loan?');
    expect(fallbackFact(steps[2], { ...facts, hasExpensiveDebt: false })).toBe('No expensive debt. Nothing to do here.');
    expect(fallbackFact(steps[0], { ...facts, trackedMonths: 0 })).toBe('Start by tracking a full month.');
    expect(fallbackFact(steps[3], { ...facts, investmentMinor: 4_000_000 })).toBe(`Start small: ${huf(4_000_000)} a month.`);
  });
  test('prompt carries numbers and the educational rules', () => {
    const p = buildGuidePrompt(facts);
    expect(p).toContain('no specific securities');
    expect(p).toContain(String(facts.avgIncomeMinor / 100));
  });
});
