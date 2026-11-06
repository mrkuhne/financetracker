import { describe, expect, it } from 'vitest';
import type { BriefSnapshot } from './brief.ts';
import {
  asSnapshot,
  canAnalyze,
  parseAnalyzeBody,
  frankfurterUrls,
  fxFromRates,
  latestDigest,
  marketSymbols,
  monthBuysMinor,
  movesFromChart,
  needsUsd,
  parseBriefAction,
  parseFrankfurterRate,
  testPayload,
} from './logic.ts';

const SNAP: BriefSnapshot = {
  month: '2026-11',
  computed_at: '2026-11-03T10:00:00Z',
  suggestion: { kind: 'amount', amountMinor: 3_000_000, source: 'computed' },
  split: { bond: 0, etf: 3_000_000, stock: 0, crypto: 0 },
  emergencyDone: true,
  remainingMinor: 10_000_000,
  dailySpendMinor: 500_000,
  holdings: [
    { holding_id: 'h1', name: 'VWCE', asset_type: 'etf', quote_symbol: 'VWCE.DE', currency: 'EUR', costMinor: 1, valueMinor: 1 },
    { holding_id: 'h2', name: 'MBH bond', asset_type: 'bond', quote_symbol: 'X', currency: 'HUF', costMinor: 1, valueMinor: 1 },
    { holding_id: 'h3', name: 'Apple', asset_type: 'stock', quote_symbol: 'AAPL', currency: 'USD', costMinor: 1, valueMinor: 1 },
    { holding_id: 'h4', name: 'VWCE 2', asset_type: 'etf', quote_symbol: 'VWCE.DE', currency: 'EUR', costMinor: 1, valueMinor: 1 },
    { holding_id: 'h5', name: 'No ticker', asset_type: 'etf', quote_symbol: null, currency: 'EUR', costMinor: 1, valueMinor: 1 },
  ],
};

describe('parseBriefAction', () => {
  it('empty body is scheduled; test and now pass; anything else is null', () => {
    expect(parseBriefAction({})).toBe('scheduled');
    expect(parseBriefAction(null)).toBe('scheduled');
    expect(parseBriefAction({ action: 'test' })).toBe('test');
    expect(parseBriefAction({ action: 'now' })).toBe('now');
    expect(parseBriefAction({ action: 'run' })).toBeNull();
    expect(parseBriefAction({ action: 1 })).toBeNull();
  });
});

describe('asSnapshot', () => {
  it('accepts a snapshot-shaped object only', () => {
    expect(asSnapshot(SNAP)).toBe(SNAP);
    expect(asSnapshot(null)).toBeNull();
    expect(asSnapshot({ month: '2026-11', holdings: [] })).toBeNull(); // no suggestion
    expect(asSnapshot({ ...SNAP, holdings: 'x' })).toBeNull();
  });
});

describe('marketSymbols / needsUsd', () => {
  it('dedupes non-bond quote symbols', () => expect(marketSymbols(SNAP)).toEqual(['VWCE.DE', 'AAPL']));
  it('uses the world ETF without holdings', () => {
    expect(marketSymbols(null)).toEqual(['VWCE.DE']);
    expect(marketSymbols({ ...SNAP, holdings: [] })).toEqual(['VWCE.DE']);
  });
  it('needs USD only with a USD holding', () => {
    expect(needsUsd(SNAP)).toBe(true);
    expect(needsUsd({ ...SNAP, holdings: SNAP.holdings.slice(0, 2) })).toBe(false);
    expect(needsUsd(null)).toBe(false);
  });
});

describe('monthBuysMinor', () => {
  it("sums this month's buys created by the user", () => {
    const rows = [
      { id: '1', created_by_id: 'u', side: 'buy', date: '2026-11-02', amount_huf_minor: 1_000_000 },
      { id: '2', created_by_id: 'u', side: 'buy', date: '2026-11-04', amount_huf_minor: 500_000 },
      { id: '3', created_by_id: 'u', side: 'sell', date: '2026-11-03', amount_huf_minor: 900 },
      { id: '4', created_by_id: 'u', side: 'buy', date: '2026-10-31', amount_huf_minor: 900 },
      { id: '5', created_by_id: 'x', side: 'buy', date: '2026-11-03', amount_huf_minor: 900 },
      { id: '6', created_by_id: 'u', side: 'buy', date: '2026-11-03', amount_huf_minor: 'lots' },
    ];
    expect(monthBuysMinor(rows, 'u', '2026-11')).toBe(1_500_000);
  });
});

describe('frankfurter', () => {
  it('builds latest and today-7 urls', () => {
    expect(frankfurterUrls('EUR', '2026-11-04')).toEqual({
      latest: 'https://api.frankfurter.app/latest?from=EUR&to=HUF',
      weekAgo: 'https://api.frankfurter.app/2026-10-28?from=EUR&to=HUF',
    });
    expect(frankfurterUrls('USD', '2026-03-03').weekAgo).toBe('https://api.frankfurter.app/2026-02-24?from=USD&to=HUF');
  });
  it('parses the HUF rate', () => {
    expect(parseFrankfurterRate({ rates: { HUF: 384.2 } })).toBe(384.2);
    expect(parseFrankfurterRate({ rates: {} })).toBeNull();
    expect(parseFrankfurterRate({ rates: { HUF: -1 } })).toBeNull();
    expect(parseFrankfurterRate(null)).toBeNull();
  });
  it('rate plus week change; null without a latest rate', () => {
    expect(fxFromRates(400, 380)).toEqual({ rate: 400, weekChange: 400 / 380 - 1 });
    expect(fxFromRates(400, null)).toEqual({ rate: 400, weekChange: null });
    expect(fxFromRates(null, 380)).toBeNull();
  });
});

describe('movesFromChart', () => {
  const day = (d: string) => Date.parse(`${d}T15:00:00Z`) / 1000;
  it('day and week change from daily closes', () => {
    const json = {
      chart: {
        result: [
          {
            timestamp: [day('2026-10-27'), day('2026-10-28'), day('2026-11-03'), day('2026-11-04')],
            indicators: { quote: [{ close: [90, 100, 104, 110] }] },
          },
        ],
      },
    };
    const m = movesFromChart(json);
    expect(m.day).toBeCloseTo(110 / 104 - 1);
    expect(m.week).toBeCloseTo(110 / 100 - 1);
  });
  it('garbage gives null moves', () => expect(movesFromChart({})).toEqual({ day: null, week: null }));
});

describe('latestDigest / testPayload', () => {
  const rows = [
    { id: 'a', date: '2026-11-03', notification: 'Old.', created_date: '2026-11-03T06:00:00Z' },
    { id: 'b', date: '2026-11-04', notification: 'New.', created_date: '2026-11-04T06:00:00Z' },
    { id: 'c', date: '2026-11-04', notification: 'Dupe.', created_date: '2026-11-04T06:00:01Z' },
  ];
  it('picks the newest date, oldest row on ties', () => expect(latestDigest(rows)?.id).toBe('b'));
  it('sends the latest digest, else the test text', () => {
    expect(testPayload(latestDigest(rows))).toEqual({ title: 'Morning brief', body: 'New.', url: '/brief/2026-11-04' });
    expect(testPayload(null)).toEqual({ title: 'Morning brief', body: 'Test notification from Finance Tracker.', url: '/news' });
    expect(testPayload({ id: 'x', date: '2026-11-04', notification: '' }).url).toBe('/news');
  });
});

describe('analyze parsing', () => {
  it('parseBriefAction knows analyze', () => expect(parseBriefAction({ action: 'analyze', id: 'x' })).toBe('analyze'));
  it('parseAnalyzeBody', () => {
    expect(parseAnalyzeBody({ action: 'analyze', id: 'n1' })).toEqual({ id: 'n1', refresh: false });
    expect(parseAnalyzeBody({ action: 'analyze', id: 'n1', refresh: true })).toEqual({ id: 'n1', refresh: true });
    expect(parseAnalyzeBody({ action: 'analyze' })).toBeNull();
    expect(parseAnalyzeBody({ action: 'analyze', id: 42 })).toBeNull();
  });
  it('canAnalyze only for own rows', () => {
    expect(canAnalyze({ id: 'n1', owner_id: 'u1' }, 'u1')).toBe(true);
    expect(canAnalyze({ id: 'n1', owner_id: 'u2' }, 'u1')).toBe(false);
    expect(canAnalyze(null, 'u1')).toBe(false);
  });
});
