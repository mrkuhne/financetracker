import { chartUrl, changeOver, parseChart, parseCloses } from './chart.ts';

// 10 trading-day fixture at 16:00 UTC (17:00 Budapest), with a weekend gap and a null close.
const DAYS = ['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04'];
const CLOSES: (number | null)[] = [100, 101, 102, 103, null, 104, 105, 106, 108, 110];
const ts = DAYS.map((d) => Date.parse(`${d}T16:00:00Z`) / 1000);
const fixture = { chart: { result: [{ timestamp: ts, indicators: { quote: [{ close: CLOSES }] } }] } };

it('chartUrl keeps the quotes default and accepts a range', () => {
  expect(chartUrl('VWCE.DE')).toBe('https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?range=1d&interval=1d');
  expect(chartUrl('VWCE.DE', '1mo')).toBe('https://query1.finance.yahoo.com/v8/finance/chart/VWCE.DE?range=1mo&interval=1d');
});

it('parseChart is still exported from shared', () => {
  const json = { chart: { result: [{ meta: { regularMarketPrice: 1, currency: 'EUR', regularMarketTime: 1793700000 } }] } };
  expect(parseChart('X', json)?.as_of).toBe('2026-11-03');
});

it('parseCloses skips nulls and dates by Budapest', () => {
  const closes = parseCloses(fixture);
  expect(closes).toHaveLength(9);
  expect(closes[0]).toEqual({ date: '2026-10-22', close: 100 });
  expect(closes.map((c) => c.date)).not.toContain('2026-10-28');
  expect(closes[8]).toEqual({ date: '2026-11-04', close: 110 });
});

it('parseCloses uses the Budapest date near midnight and keeps the later close per day', () => {
  const t1 = Date.parse('2026-11-03T23:30:00Z') / 1000; // 00:30 on 4 Nov in Budapest
  const t0 = Date.parse('2026-11-03T22:00:00Z') / 1000; // 23:00 on 3 Nov
  const t2 = Date.parse('2026-11-04T10:00:00Z') / 1000; // later on 4 Nov
  const json = { chart: { result: [{ timestamp: [t0, t1, t2], indicators: { quote: [{ close: [1, 2, 3] }] } }] } };
  expect(parseCloses(json)).toEqual([{ date: '2026-11-03', close: 1 }, { date: '2026-11-04', close: 3 }]);
});

it('parseCloses returns [] on junk', () => {
  expect(parseCloses(null)).toEqual([]);
  expect(parseCloses({ chart: { result: [{}] } })).toEqual([]);
});

it('changeOver: day change against the previous close', () => {
  expect(changeOver(parseCloses(fixture), 1)).toBeCloseTo(110 / 108 - 1, 10);
});

it('changeOver: week change uses the last close at least 7 days back', () => {
  // last = 2026-11-04; cutoff 2026-10-28 has no close (null), so the 27 Oct close (103) is used.
  expect(changeOver(parseCloses(fixture), 7)).toBeCloseTo(110 / 103 - 1, 10);
});

it('changeOver is null without an old enough close', () => {
  const closes = parseCloses(fixture).slice(-3);
  expect(changeOver(closes, 7)).toBeNull();
  expect(changeOver(closes.slice(-1), 1)).toBeNull();
  expect(changeOver([], 1)).toBeNull();
});
