import { describe, expect, test, vi } from 'vitest';

vi.mock('@/data/client', () => ({ base44: { auth: {}, entities: {}, functions: {} } }));

import { parseAnalyzeResult } from '@/data/news';

const analysis = { month: '2026-11', verdict: 'buy', amount_minor: 1_000_000, product: 'ETFs (index funds)', about: 'a', impact: 'i', reason: 'r', from_summary: false, made_at: 'x' };
const good = { status: 'ok', stale: false, left_minor: 1_500_000, money_known: true, analysis };

describe('parseAnalyzeResult', () => {
  test('simple statuses, wrapped or not', () => {
    expect(parseAnalyzeResult({ status: 'cap' })).toEqual({ status: 'cap' });
    expect(parseAnalyzeResult({ data: { status: 'not_found' } })).toEqual({ status: 'not_found' });
  });
  test('malformed becomes error', () => {
    expect(parseAnalyzeResult({ status: 'ok', analysis: { verdict: 'sell' } })).toEqual({ status: 'error' });
    expect(parseAnalyzeResult(null)).toEqual({ status: 'error' });
    expect(parseAnalyzeResult({ status: 'weird' })).toEqual({ status: 'error' });
    expect(parseAnalyzeResult({ ...good, stale: 'no' })).toEqual({ status: 'error' });
    expect(parseAnalyzeResult({ ...good, money_known: undefined })).toEqual({ status: 'error' });
    expect(parseAnalyzeResult({ ...good, analysis: { ...analysis, about: 1 } })).toEqual({ status: 'error' });
    expect(parseAnalyzeResult({ ...good, left_minor: Infinity })).toEqual({ status: 'error' });
  });
  test('a good result passes through, null left_minor allowed', () => {
    expect(parseAnalyzeResult(good)).toEqual(good);
    expect(parseAnalyzeResult({ ...good, left_minor: null, money_known: false })).toEqual({ ...good, left_minor: null, money_known: false });
  });
});
