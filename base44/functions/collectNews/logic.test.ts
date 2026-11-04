import { describe, expect, it } from 'vitest';
import { SEED_SOURCES } from '../../shared/news.ts';
import {
  aiBatch,
  budapestDate,
  chunk,
  expiredIds,
  holdingsFromSnapshot,
  intervalHours,
  isHttpLink,
  lastRun,
  parseAction,
  planFetch,
  readCappedText,
  selectNewItems,
  type SourceRow,
} from './logic.ts';

const NOW = '2026-11-04T12:00:00.000Z';

describe('parseAction', () => {
  it('treats an empty body or missing action as the scheduled path', () => {
    expect(parseAction({})).toBe('scheduled');
    expect(parseAction(null)).toBe('scheduled');
    expect(parseAction({ action: null })).toBe('scheduled');
  });
  it('accepts now and rejects anything else', () => {
    expect(parseAction({ action: 'now' })).toBe('now');
    expect(parseAction({ action: 'test' })).toBeNull();
    expect(parseAction({ action: 1 })).toBeNull();
  });
});

describe('budapestDate', () => {
  it('uses the Budapest calendar day', () => {
    expect(budapestDate('2026-11-04T12:00:00Z')).toBe('2026-11-04');
    expect(budapestDate('2026-11-04T23:30:00Z')).toBe('2026-11-05'); // CET +1
    expect(budapestDate('2026-07-01T22:30:00Z')).toBe('2026-07-02'); // CEST +2
    expect(budapestDate('2026-07-01T21:30:00Z')).toBe('2026-07-01');
  });
});

describe('planFetch', () => {
  it('fetches only active seed urls and flags the rest', () => {
    const rows: SourceRow[] = [
      { id: 'a', url: SEED_SOURCES[0].url, active: true },
      { id: 'b', url: 'http://169.254.169.254/latest', active: true },
      { id: 'c', url: SEED_SOURCES[1].url, active: false },
      { id: 'd', url: SEED_SOURCES[2].url },
    ];
    const p = planFetch(rows);
    expect(p.fetch.map((s) => s.id)).toEqual(['a', 'd']);
    expect(p.unknown.map((s) => s.id)).toEqual(['b']);
  });
});

describe('lastRun / intervalHours / chunk / isHttpLink', () => {
  it('takes the latest valid last_fetched_at', () => {
    expect(lastRun([])).toBeNull();
    expect(
      lastRun([
        { id: '1', last_fetched_at: '2026-11-04T08:00:00Z' },
        { id: '2', last_fetched_at: null },
        { id: '3', last_fetched_at: '2026-11-04T10:00:00Z' },
        { id: '4', last_fetched_at: 'garbage' },
      ]),
    ).toBe('2026-11-04T10:00:00.000Z');
  });
  it('defaults the interval to 4 hours', () => {
    expect(intervalHours(undefined)).toBe(4);
    expect(intervalHours(2)).toBe(2);
    expect(intervalHours(0)).toBe(4);
  });
  it('chunks into batches', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 6)).toEqual([[1, 2, 3, 4, 5, 6], [7]]);
    expect(chunk([], 6)).toEqual([]);
  });
  it('accepts http(s) links only', () => {
    expect(isHttpLink('https://x.com/a')).toBe(true);
    expect(isHttpLink('HTTP://x.com/a')).toBe(true);
    expect(isHttpLink('javascript:alert(1)')).toBe(false);
    expect(isHttpLink('/relative')).toBe(false);
  });
});

describe('selectNewItems', () => {
  const s1: SourceRow = { id: 's1', name: 'One' };
  const s2: SourceRow = { id: 's2', name: 'Two' };
  it('drops bad links, known links, expired items; newest first; maps back to the first source', () => {
    const out = selectNewItems(
      [
        {
          source: s1,
          items: [
            { title: 'a', link: 'https://a', published_at: '2026-11-04T10:00:00.000Z' },
            { title: 'bad', link: 'javascript:x', published_at: null },
            { title: 'known', link: 'https://k', published_at: null },
            { title: 'old', link: 'https://old', published_at: '2026-09-01T00:00:00.000Z' },
          ],
        },
        {
          source: s2,
          items: [
            { title: 'b', link: 'https://b', published_at: '2026-11-04T11:00:00.000Z' },
            { title: 'a again', link: 'https://a', published_at: '2026-11-04T10:00:00.000Z' },
            { title: 'undated', link: 'https://u', published_at: null },
          ],
        },
      ],
      new Set(['https://k']),
      NOW,
    );
    expect(out.map((o) => [o.item.link, o.source.id])).toEqual([
      ['https://b', 's2'],
      ['https://a', 's1'],
      ['https://u', 's2'],
    ]);
  });
  it('caps the result', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ title: `t${i}`, link: `https://x/${i}`, published_at: null }));
    expect(selectNewItems([{ source: s1, items }], new Set(), NOW)).toHaveLength(40);
  });
});

describe('aiBatch', () => {
  it('keeps unlabelled items newest first, by published_at else created_date, capped', () => {
    const rows = [
      { id: '1', title: 'x', ai_done: false, published_at: '2026-11-01T00:00:00Z' },
      { id: '2', title: 'x', ai_done: true, published_at: '2026-11-04T00:00:00Z' },
      { id: '3', title: 'x', ai_done: false, published_at: null, created_date: '2026-11-03T00:00:00Z' },
      { id: '4', title: '', ai_done: false },
      { id: '5', title: 'x', published_at: '2026-11-02T00:00:00Z' },
    ];
    expect(aiBatch(rows).map((r) => r.id)).toEqual(['3', '5', '1']);
    expect(aiBatch(rows, 2).map((r) => r.id)).toEqual(['3', '5']);
  });
});

describe('expiredIds', () => {
  it('uses published_at, else created_date', () => {
    const rows = [
      { id: 'old', published_at: '2026-09-01T00:00:00Z' },
      { id: 'fresh', published_at: '2026-11-01T00:00:00Z' },
      { id: 'oldCreated', published_at: null, created_date: '2026-09-15T00:00:00Z' },
      { id: 'freshPubOldCreated', published_at: '2026-11-01T00:00:00Z', created_date: '2026-09-01T00:00:00Z' },
      { id: 'none' },
    ];
    expect(expiredIds(rows, NOW)).toEqual(['old', 'oldCreated']);
  });
});

describe('holdingsFromSnapshot', () => {
  it('maps snapshot holdings to prompt identifiers', () => {
    expect(holdingsFromSnapshot(null)).toEqual([]);
    expect(holdingsFromSnapshot({})).toEqual([]);
    expect(
      holdingsFromSnapshot({
        holdings: [
          { holding_id: 'e', name: 'VWCE', asset_type: 'etf', quote_symbol: 'VWCE.DE', currency: 'EUR', costMinor: 1 },
          { name: 'MÁP+', asset_type: 'bond', quote_symbol: null, currency: 'HUF' },
          { asset_type: 'etf' },
        ],
      }),
    ).toEqual([
      { name: 'VWCE', asset_type: 'etf', ticker: 'VWCE.DE', currency: 'EUR' },
      { name: 'MÁP+', asset_type: 'bond', ticker: null, currency: 'HUF' },
    ]);
  });
});

describe('readCappedText', () => {
  it('returns the text under the cap', async () => {
    expect(await readCappedText(new Response('<rss/>'), 100)).toEqual({ ok: true, text: '<rss/>' });
  });
  it('gives up beyond the cap', async () => {
    expect(await readCappedText(new Response('x'.repeat(101)), 100)).toEqual({ ok: false });
  });
});
