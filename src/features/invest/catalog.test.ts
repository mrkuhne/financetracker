import { describe, expect, test } from 'vitest';
import type { AssetType } from '@/domain/types';
import { CATALOG, TYPE_INFO, defaultProduct, findProduct, productsFor } from './catalog';

const TYPES: AssetType[] = ['bond', 'etf', 'stock', 'crypto'];

describe('CATALOG', () => {
  test('every type has one to three products', () => {
    for (const t of TYPES) {
      expect(productsFor(t).length).toBeGreaterThanOrEqual(1);
      expect(productsFor(t).length).toBeLessThanOrEqual(3);
    }
  });

  test('ids are unique', () => {
    const ids = CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every row has an https source, a YYYY-MM-DD check date and at least one platform', () => {
    for (const p of CATALOG) {
      expect(p.source_url.startsWith('https://')).toBe(true);
      expect(p.checked_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.where.length).toBeGreaterThan(0);
      expect(p.name.trim()).not.toBe('');
      expect(p.summary.trim()).not.toBe('');
    }
  });

  test('non-bond products have a quote symbol and currency', () => {
    for (const p of CATALOG.filter((x) => x.type !== 'bond')) {
      expect(p.quote_symbol).toBeTruthy();
      expect(p.quote_currency).toMatch(/^[A-Z]{3}$/);
      expect(p.rate_pct).toBeNull();
    }
  });

  test('bonds have a positive rate and no quote symbol', () => {
    for (const p of productsFor('bond')) {
      expect(p.rate_pct).toBeGreaterThan(0);
      expect(p.quote_symbol).toBeNull();
      expect(p.quote_currency).toBeNull();
    }
  });

  test('minimums are positive integers in minor units when set', () => {
    for (const p of CATALOG) {
      if (p.min_minor !== null) {
        expect(Number.isInteger(p.min_minor)).toBe(true);
        expect(p.min_minor).toBeGreaterThan(0);
      }
    }
  });
});

describe('TYPE_INFO', () => {
  test('every type has a title, an explanation and a where note', () => {
    for (const t of TYPES) {
      expect(TYPE_INFO[t].title.trim()).not.toBe('');
      expect(TYPE_INFO[t].what.trim()).not.toBe('');
      expect(TYPE_INFO[t].where_note.trim()).not.toBe('');
    }
  });

  test('every type has a drop note that never says to sell or buy more', () => {
    for (const t of TYPES) {
      const note = TYPE_INFO[t].drop_note;
      expect(note.trim()).not.toBe('');
      expect(note).not.toMatch(/\b(sell now|buy more|buy the dip)\b/i);
    }
  });
});

describe('lookups', () => {
  test('productsFor returns only that type, in preference order', () => {
    const ids = (t: AssetType) => productsFor(t).map((p) => p.id);
    expect(ids('bond')).toEqual(['map-plusz', 'fix-map']);
    expect(ids('etf')).toEqual(['vanguard-ftse-all-world-acc', 'ishares-core-msci-world-acc']);
    expect(ids('stock')).toEqual(['apple', 'microsoft']);
    expect(ids('crypto')).toEqual(['bitcoin', 'ethereum']);
    for (const t of TYPES) for (const p of productsFor(t)) expect(p.type).toBe(t);
  });

  test('defaultProduct is the first product of its type', () => {
    for (const t of TYPES) {
      expect(defaultProduct(t).type).toBe(t);
      expect(defaultProduct(t)).toBe(productsFor(t)[0]);
    }
  });

  test('findProduct returns the row by id, or null for an unknown id', () => {
    for (const p of CATALOG) expect(findProduct(p.id)).toBe(p);
    expect(findProduct('no-such-product')).toBeNull();
    expect(findProduct('')).toBeNull();
  });
});
