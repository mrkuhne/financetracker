import { describe, expect, test } from 'vitest';
import { huf } from '@/features/home/fmt';
import type { Split, PortfolioSummary } from '@/domain/invest';
import { CATALOG, TYPE_INFO, defaultProduct } from './catalog';
import { buildInvestPrompt, investCacheKey, normalizeInvestAdvice, templateText, type InvestFacts } from './investAi';

const split: Split = { parts: { bond: 3_000_000, etf: 4_000_000, stock: 1_000_000, crypto: 500_000 }, tooSmall: [] };
const summary: PortfolioSummary = {
  valueMinor: 12_000_000, costMinor: 10_000_000, gainMinor: 2_000_000, gainRatio: 0.2,
  byType: { bond: 5_000_000, etf: 7_000_000, stock: 0, crypto: 0 }, unpriced: 0,
};
const facts: InvestFacts = {
  month: '2026-11', amountMinor: 8_500_000, split, profile: 'balanced', emergencyDone: true, summary,
  costByType: { bond: 5_000_000, etf: 5_000_000, stock: 0, crypto: 0 },
};
const good = (id: string) => ({ text: 'Fine.', product_id: id });
const raw = (over: Record<string, unknown> = {}) => ({
  intro: 'Hello.', bond: good('fix-map'), etf: good('ishares-core-msci-world-acc'), stock: good('microsoft'), crypto: good('ethereum'), ...over,
});

describe('investAi', () => {
  test('prompt carries amounts, profile, rules and the catalog', () => {
    const p = buildInvestPrompt(facts);
    expect(p).toContain(huf(8_500_000));
    for (const v of Object.values(split.parts)) expect(p).toContain(huf(v));
    expect(p).toContain('balanced');
    expect(p).toContain('educational');
    expect(p).toContain('never certain');
    expect(p).toContain('never suggest selling');
    for (const c of CATALOG) expect(p).toContain(`${c.id} (${c.type})`);
    expect(p).toContain('never tell the user to buy crypto there');
    expect(p).toContain('Do not repeat exact forint amounts');
    expect(p).not.toContain('bitcoin (crypto): Bitcoin (BTC); where: revolut');
  });
  test('normalize: valid advice passes through', () => {
    const r = normalizeInvestAdvice(raw());
    expect(r?.intro).toBe('Hello.');
    expect(r?.per_type.bond).toEqual({ text: 'Fine.', product_id: 'fix-map' });
    expect(r?.per_type.crypto.product_id).toBe('ethereum');
  });
  test('normalize: foreign or unknown product id falls back to default', () => {
    const r = normalizeInvestAdvice(raw({ bond: good('apple'), etf: good('nope') }));
    expect(r?.per_type.bond.product_id).toBe(defaultProduct('bond').id);
    expect(r?.per_type.etf.product_id).toBe(defaultProduct('etf').id);
  });
  test('normalize: empty text becomes empty string, missing type is complete', () => {
    const r = normalizeInvestAdvice(raw({ stock: { text: '   ', product_id: 'apple' }, crypto: undefined }));
    expect(r?.per_type.stock).toEqual({ text: '', product_id: 'apple' });
    expect(r?.per_type.crypto).toEqual({ text: '', product_id: defaultProduct('crypto').id });
  });
  test('normalize: long text cut at last sentence end before 600', () => {
    const s = 'This is a sentence. ';
    const long = s.repeat(40);
    const r = normalizeInvestAdvice(raw({ bond: { text: long, product_id: 'fix-map' } }));
    const t = r!.per_type.bond.text;
    expect(t.length).toBeLessThanOrEqual(600);
    expect(t.endsWith('.')).toBe(true);
    expect(t.length).toBeGreaterThan(550);
    const noStop = normalizeInvestAdvice(raw({ bond: { text: 'x'.repeat(700), product_id: 'fix-map' } }));
    expect(noStop!.per_type.bond.text).toHaveLength(600);
  });
  test('normalize: bad input is null', () => {
    expect(normalizeInvestAdvice('nope')).toBeNull();
    expect(normalizeInvestAdvice(null)).toBeNull();
    expect(normalizeInvestAdvice(raw({ intro: undefined }))).toBeNull();
    expect(normalizeInvestAdvice(raw({ intro: '  ' }))).toBeNull();
  });
  test('cache key reacts to inputs, not to prices', () => {
    const k = investCacheKey(facts);
    expect(investCacheKey({ ...facts, amountMinor: 9_000_000 })).not.toBe(k);
    // The split moves with daily prices; the key must not, so the AI is called about monthly.
    expect(investCacheKey({ ...facts, split: { parts: { ...split.parts, etf: 4_100_000, bond: 2_900_000 }, tooSmall: ['crypto'] } })).toBe(k);
    expect(investCacheKey({ ...facts, profile: 'bold' })).not.toBe(k);
    expect(investCacheKey({ ...facts, emergencyDone: false })).not.toBe(k);
    expect(investCacheKey({ ...facts, month: '2026-12' })).not.toBe(k);
    expect(investCacheKey({ ...facts, costByType: { ...facts.costByType, stock: 100 } })).not.toBe(k);
    const moved = { ...summary, valueMinor: 99, byType: { bond: 1, etf: 2, stock: 3, crypto: 4 } };
    expect(investCacheKey({ ...facts, summary: moved })).toBe(k);
  });
  test('template text uses TYPE_INFO and the amount', () => {
    const t = templateText('etf', facts);
    expect(t).toContain(TYPE_INFO.etf.what);
    expect(t).toContain(huf(4_000_000));
    expect(templateText('bond', { ...facts, split: { ...split, parts: { ...split.parts, bond: 0 } } })).toBe(TYPE_INFO.bond.what);
  });
});
