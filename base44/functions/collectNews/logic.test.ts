import { describe, expect, it } from 'vitest';
import { SEED_SOURCES } from '../../shared/news.ts';
import {
  aiBatch,
  expiredIds,
  holdingsFromSnapshot,
  intervalHours,
  isDue,
  isHttpLink,
  lastRun,
  missingSeeds,
  parseAction,
  planFetch,
  readCappedText,
  selectNewItems,
  type SourceRow,
} from './logic.ts';
import { budapestDate } from '../../shared/chart.ts';
import { chunk, duplicateIds, usageTotals } from '../../shared/rows.ts';

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
  it('accepts only 2, 4, 8 or 12 hours, else 4', () => {
    expect(intervalHours(undefined)).toBe(4);
    for (const h of [2, 4, 8, 12]) expect(intervalHours(h)).toBe(h);
    for (const h of [0, 1, 3, 5, 24, -2, 2.5, '2', null]) expect(intervalHours(h)).toBe(4);
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

describe('isDue', () => {
  const last = '2026-11-04T08:00:03.000Z'; // last run started 3 s after its slot
  it('tolerates scheduler jitter up to 10 minutes', () => {
    expect(isDue(last, '2026-11-04T12:00:00.500Z', 4)).toBe(true); // next slot, started earlier relative to it
    expect(isDue(last, '2026-11-04T11:50:03.000Z', 4)).toBe(true);
    expect(isDue(last, '2026-11-04T11:50:02.000Z', 4)).toBe(false);
    expect(isDue(last, '2026-11-04T10:00:00.000Z', 4)).toBe(false); // the in-between 2 h slot
    expect(isDue(null, '2026-11-04T10:00:00.000Z', 4)).toBe(true);
  });
});

describe('duplicateIds', () => {
  it('keeps the oldest row per key and returns the rest', () => {
    const rows = [
      { id: 'b', link: 'x', created_date: '2026-11-04T10:00:01Z' },
      { id: 'a', link: 'x', created_date: '2026-11-04T10:00:00Z' },
      { id: 'c', link: 'y', created_date: '2026-11-04T09:00:00Z' },
      { id: 'd', link: 'x', created_date: '2026-11-04T10:00:00Z' }, // same time as a: id breaks the tie
      { id: 'e', link: '', created_date: '2026-11-04T10:00:00Z' },
      { id: 'f', link: '', created_date: '2026-11-04T11:00:00Z' },
    ];
    expect(duplicateIds(rows, (r) => r.link).sort()).toEqual(['b', 'd']);
    expect(duplicateIds([], (r: { id: string }) => r.id)).toEqual([]);
  });
});

describe('missingSeeds', () => {
  it('lists seed urls not yet present', () => {
    expect(missingSeeds([])).toHaveLength(SEED_SOURCES.length);
    expect(missingSeeds(SEED_SOURCES.map((s) => ({ url: s.url })))).toEqual([]);
    expect(missingSeeds([{ url: SEED_SOURCES[0].url }, { url: 'https://other' }]).map((s) => s.url)).toEqual(
      SEED_SOURCES.slice(1).map((s) => s.url),
    );
  });
});

describe('usageTotals', () => {
  it('sums duplicate day rows and picks the oldest to write', () => {
    expect(usageTotals([])).toEqual({ primary: null, collect: 0, brief: 0 });
    const t = usageTotals([
      { id: 'n', created_date: '2026-11-04T10:00:01Z', collect: 2, brief: 1 },
      { id: 'o', created_date: '2026-11-04T10:00:00Z', collect: 7 },
    ]);
    expect(t.primary?.id).toBe('o');
    expect(t.collect).toBe(9);
    expect(t.brief).toBe(1);
  });
});
