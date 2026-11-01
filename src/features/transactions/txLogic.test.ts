import { describe, expect, it } from 'vitest';
import type { Category } from '@/data/categories';
import type { Txn } from '@/domain/types';
import { applyKey, normalizeAmountFor, dayLabel, groupByDay, needsHufRecompute, recentCategoryIds } from './txLogic';

const cat = (id: string, kind: 'expense' | 'income' = 'expense'): Category => ({ id, name: id, kind, icon: 'dots', monthly_budget_minor: null });
const tx = (p: Partial<Txn>): Txn => ({
  id: 'x', account_id: 'a', kind: 'expense', amount_minor: 100, currency: 'HUF', amount_huf_minor: 100,
  category_id: null, date: '2026-11-01', source: 'manual', needs_review: false, recurring_rule_id: null, transfer_pair_id: null, ...p,
});

describe('applyKey', () => {
  it('appends digits and blocks leading zeros', () => {
    expect(applyKey('', '0')).toBe('');
    expect(applyKey('', '000')).toBe('');
    expect(applyKey('', '5')).toBe('5');
    expect(applyKey('5', '0')).toBe('50');
    expect(applyKey('5', '000')).toBe('5000');
  });
  it('caps at 9 digits', () => {
    expect(applyKey('12345678', '9')).toBe('123456789');
    expect(applyKey('123456789', '1')).toBe('123456789');
    expect(applyKey('1234567', '000')).toBe('1234567');
  });
  it('backspaces', () => {
    expect(applyKey('123', '⌫')).toBe('12');
    expect(applyKey('', '⌫')).toBe('');
  });
});

describe('applyKey decimals', () => {
  it('adds a comma once, max 2 decimals', () => {
    expect(applyKey('', ',', true)).toBe('0,');
    expect(applyKey('12', ',', true)).toBe('12,');
    expect(applyKey('12,', ',', true)).toBe('12,');
    expect(applyKey('12,5', '5', true)).toBe('12,55');
    expect(applyKey('12,55', '1', true)).toBe('12,55');
    expect(applyKey('0,', '0', true)).toBe('0,0');
    expect(applyKey('12,', '000', true)).toBe('12,');
  });
  it('ignores comma for integer currencies', () => expect(applyKey('12', ',')).toBe('12'));
});

describe('recentCategoryIds default order', () => {
  it('pads in canonical order, custom last', () => {
    const named = (id: string, name: string): Category => ({ ...cat(id), name });
    const cats = [named('1', 'Entertainment'), named('2', 'Custom'), named('3', 'Groceries'), named('4', 'Dining out')];
    expect(recentCategoryIds([], cats, 4)).toEqual(['3', '4', '1', '2']);
  });
});

describe('recentCategoryIds', () => {
  const cats = [cat('a'), cat('b'), cat('c'), cat('d'), cat('i1', 'income')];
  it('orders by recency, dedupes, pads with defaults', () => {
    const t = [tx({ category_id: 'c', date: '2026-10-01' }), tx({ category_id: 'd', date: '2026-10-05' }), tx({ category_id: 'c', date: '2026-09-01' })];
    expect(recentCategoryIds(t, cats, 3)).toEqual(['d', 'c', 'a']);
  });
  it('ignores other kinds and unknown ids', () => {
    const t = [tx({ kind: 'income', category_id: 'i1' }), tx({ category_id: 'gone' })];
    expect(recentCategoryIds(t, cats, 2)).toEqual(['a', 'b']);
    expect(recentCategoryIds(t, cats, 2, 'income')).toEqual(['i1']);
  });
});

describe('groupByDay', () => {
  it('groups newest first with signed HUF totals, transfers excluded', () => {
    const g = groupByDay([
      tx({ date: '2026-11-01', amount_huf_minor: 500 }),
      tx({ date: '2026-11-03', kind: 'income', amount_huf_minor: 2000 }),
      tx({ date: '2026-11-01', amount_huf_minor: 300 }),
      tx({ date: '2026-11-01', kind: 'transfer_out', amount_huf_minor: 9999 }),
    ]);
    expect(g.map((d) => d.date)).toEqual(['2026-11-03', '2026-11-01']);
    expect(g[0].totalHufMinor).toBe(2000);
    expect(g[1].totalHufMinor).toBe(-800);
    expect(g[1].txns).toHaveLength(3);
  });
});

describe('needsHufRecompute', () => {
  const o = { amount_minor: 1000, currency: 'EUR', date: '2026-11-01' };
  it('is true when amount, currency or date change', () => {
    expect(needsHufRecompute(o, { ...o, amount_minor: 2000 })).toBe(true);
    expect(needsHufRecompute(o, { ...o, currency: 'USD' })).toBe(true);
    expect(needsHufRecompute(o, { ...o, date: '2026-11-02' })).toBe(true);
  });
  it('is false otherwise', () => expect(needsHufRecompute(o, { ...o })).toBe(false));
});

describe('dayLabel', () => {
  it('labels today and yesterday', () => {
    expect(dayLabel('2026-11-01', '2026-11-01')).toBe('Today');
    expect(dayLabel('2026-10-31', '2026-11-01')).toBe('Yesterday');
    expect(dayLabel('2026-10-28', '2026-11-01')).toBe('Wed 28 Oct');
  });
});

describe('normalizeAmountFor', () => {
  it('truncates the fraction for integer currencies', () => {
    expect(normalizeAmountFor('12,5', false)).toBe('12');
    expect(normalizeAmountFor('0,', false)).toBe('0');
    expect(normalizeAmountFor('12,5', true)).toBe('12,5');
  });
});
