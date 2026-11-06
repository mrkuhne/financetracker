import { describe, expect, test } from 'vitest';
import {
  NEWS_FILTERS, ago, briefTitle, displayTitle, filterNews, firstBriefCopy, newsChip, parseNumbers, pctLabel, safeLink, VERDICT_LABEL, type NewsRow,
} from './newsModel';

const item = (id: string, tags: string[], affects = false): NewsRow => ({
  id, source_id: 's', source_name: 'CNBC', title: id, title_hu: null, link: 'https://x', published_at: null, summary: null, tags, affects_portfolio: affects,
});

const ITEMS = [
  item('rates', ['rates']),
  item('infl', ['inflation']),
  item('huf', ['forint'], true),
  item('hu', ['hungary']),
  item('etf', ['etf'], true),
  item('stocks', ['stocks']),
  item('bonds', ['bonds']),
  item('crypto', ['crypto']),
  item('mkts', ['markets']),
  item('house', ['housing']),
  item('none', []),
];
const ids = (f: (typeof NEWS_FILTERS)[number]) => filterNews(ITEMS, f).map((i) => i.id);

describe('filterNews', () => {
  test('filters are in mockup order', () => {
    expect(NEWS_FILTERS).toEqual(['Mine', 'All', 'Rates', 'Forint', 'Markets', 'Housing']);
  });
  test('All keeps everything', () => expect(ids('All')).toHaveLength(ITEMS.length));
  test('Mine = affects_portfolio', () => expect(ids('Mine')).toEqual(['huf', 'etf']));
  test('Rates = rates|inflation', () => expect(ids('Rates')).toEqual(['rates', 'infl']));
  test('Forint = forint|hungary', () => expect(ids('Forint')).toEqual(['huf', 'hu']));
  test('Markets = markets|etf|stocks|bonds|crypto', () =>
    expect(ids('Markets')).toEqual(['etf', 'stocks', 'bonds', 'crypto', 'mkts']));
  test('Housing = housing', () => expect(ids('Housing')).toEqual(['house']));
  test('tolerates missing tags', () => {
    const bad = { ...item('bad', []), tags: undefined as unknown as string[] };
    expect(filterNews([bad], 'Rates')).toEqual([]);
  });
});

describe('ago', () => {
  const now = '2026-11-04T12:00:00Z';
  test('under an hour is now', () => expect(ago('2026-11-04T11:31:00Z', now)).toBe('now'));
  test('hours', () => expect(ago('2026-11-04T10:00:00Z', now)).toBe('2 h'));
  test('days', () => expect(ago('2026-11-03T11:00:00Z', now)).toBe('1 d'));
  test('future is now', () => expect(ago('2026-11-04T13:00:00Z', now)).toBe('now'));
  test('missing or invalid is empty', () => {
    expect(ago(null, now)).toBe('');
    expect(ago('nope', now)).toBe('');
  });
});

describe('pctLabel', () => {
  test('positive', () => expect(pctLabel(0.006)).toBe('+0.6%'));
  test('negative uses U+2212', () => expect(pctLabel(-0.004)).toBe('−0.4%'));
  test('zero', () => expect(pctLabel(0)).toBe('0.0%'));
  test('null and NaN', () => {
    expect(pctLabel(null)).toBe('no data');
    expect(pctLabel(Number.NaN)).toBe('no data');
  });
});

describe('parseNumbers', () => {
  test('null for garbage', () => {
    expect(parseNumbers(null)).toBeNull();
    expect(parseNumbers('x')).toBeNull();
  });
  test('drops malformed fields', () => {
    const n = parseNumbers({
      stale: true,
      holdingsKnown: true,
      holdings: [{ name: 'VWCE', asset_type: 'etf', day: 0.01, week: 'x', fixed: false }, 5, { day: 1 }],
      eurHuf: { rate: 'bad' },
      usdHuf: { rate: 350, weekChange: null },
      month: { suggestedMinor: 4000000, investedMinor: null },
      market: { day: 0.002 },
      portfolioWeek: 0.01,
    })!;
    expect(n.stale).toBe(true);
    expect(n.holdings).toEqual([{ name: 'VWCE', asset_type: 'etf', day: 0.01, week: null, fixed: false }]);
    expect(n.eurHuf).toBeNull();
    expect(n.usdHuf).toEqual({ rate: 350, weekChange: null });
    expect(n.month).toEqual({ suggestedMinor: 4000000, investedMinor: null, leftMinor: null, pullForwardRoomMinor: null });
    expect(n.market).toEqual({ day: 0.002, week: null });
    expect(n.portfolioWeek).toBe(0.01);
  });
  test('missing month and holdings', () => {
    const n = parseNumbers({})!;
    expect(n.holdings).toEqual([]);
    expect(n.holdingsKnown).toBe(false);
    expect(n.month).toBeNull();
    expect(n.stale).toBe(false);
  });
});

describe('firstBriefCopy', () => {
  // 06:00 Budapest (UTC+1 in November)
  test('before the digest time says today', () =>
    expect(firstBriefCopy('07:00', 'Europe/Budapest', new Date('2026-11-04T05:00:00Z'))).toBe('Your first brief arrives today at 07:00.'));
  test('after the digest time says tomorrow', () =>
    expect(firstBriefCopy('07:00', 'Europe/Budapest', new Date('2026-11-04T09:00:00Z'))).toBe('Your first brief arrives tomorrow at 07:00.'));
  test('next brief wording', () =>
    expect(firstBriefCopy('07:00', 'Europe/Budapest', new Date('2026-11-04T09:00:00Z'), false)).toBe('Your next brief arrives tomorrow at 07:00.'));
  test('bad time falls back to 07:00', () =>
    expect(firstBriefCopy('xx', 'Europe/Budapest', new Date('2026-11-04T09:00:00Z'))).toBe('Your first brief arrives tomorrow at 07:00.'));
});

describe('helpers', () => {
  test('briefTitle', () => expect(briefTitle('2026-11-04')).toBe('Wed 4 Nov'));
  test('briefTitle invalid', () => expect(briefTitle('nope')).toBe('Brief'));
  test('safeLink', () => {
    expect(safeLink('https://a.b/c')).toBe('https://a.b/c');
    expect(safeLink('http://a.b')).toBe('http://a.b');
    expect(safeLink('javascript:alert(1)')).toBeNull();
    expect(safeLink(null)).toBeNull();
  });
  test('newsChip prefers portfolio, then first tag capitalised', () => {
    expect(newsChip(item('a', ['forint'], true))).toEqual({ label: 'Yours', mine: true });
    expect(newsChip(item('a', ['inflation']))).toEqual({ label: 'Inflation', mine: false });
    expect(newsChip(item('a', []))).toBeNull();
  });
});

describe('displayTitle', () => {
  test('prefers title_hu and falls back to the English title', () => {
    expect(displayTitle({ title: 'Fed holds', title_hu: 'A Fed kivár' })).toBe('A Fed kivár');
    expect(displayTitle({ title: 'Fed holds', title_hu: null })).toBe('Fed holds');
    expect(displayTitle({ title: 'Fed holds', title_hu: ' ' })).toBe('Fed holds');
    expect(displayTitle({ title: '', title_hu: null })).toBe('Untitled');
  });
});

test('verdict labels', () => expect(VERDICT_LABEL).toEqual({ buy: 'Vehetsz', wait: 'Várj', none: 'Nincs teendő' }));
