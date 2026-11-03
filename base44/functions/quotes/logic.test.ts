import { validateSymbols, parseChart, chartUrl } from './logic.ts';

it('validateSymbols accepts a clean list', () => {
  expect(validateSymbols({ symbols: ['VWCE.DE', 'BTC-EUR'] })).toEqual(['VWCE.DE', 'BTC-EUR']);
});
it('validateSymbols rejects bad input', () => {
  expect(validateSymbols({ symbols: [] })).toBeNull();
  expect(validateSymbols({ symbols: Array.from({ length: 21 }, (_, i) => `S${i}`) })).toBeNull();
  expect(validateSymbols({ symbols: ['a b'] })).toBeNull();
  expect(validateSymbols({ symbols: 'AAPL' })).toBeNull();
  expect(validateSymbols({ symbols: [5] })).toBeNull();
  expect(validateSymbols(null)).toBeNull();
});
it('parseChart reads price, currency and the Budapest date', () => {
  const json = { chart: { result: [{ meta: { regularMarketPrice: 101.5, currency: 'EUR', regularMarketTime: 1793700000 } }] } };
  const iso = new Date(1793700000 * 1000).toISOString();
  expect(iso.slice(0, 10)).toBe('2026-11-03');
  expect(parseChart('VWCE.DE', json)).toEqual({ price: 101.5, currency: 'EUR', as_of: '2026-11-03' });
});
it('parseChart uses the Budapest date near midnight', () => {
  // 2026-11-03T23:30:00Z is already 2026-11-04 in Budapest (UTC+1).
  const t = Date.UTC(2026, 10, 3, 23, 30) / 1000;
  const json = { chart: { result: [{ meta: { regularMarketPrice: 1, currency: 'EUR', regularMarketTime: t } }] } };
  expect(parseChart('X', json)?.as_of).toBe('2026-11-04');
});
it('parseChart returns null for bad data', () => {
  expect(parseChart('X', { chart: { result: null, error: {} } })).toBeNull();
  expect(parseChart('X', { chart: { result: [{ meta: { regularMarketPrice: 0, currency: 'EUR', regularMarketTime: 1793700000 } }] } })).toBeNull();
  expect(parseChart('X', { chart: { result: [{ meta: { regularMarketPrice: 5, regularMarketTime: 1793700000 } }] } })).toBeNull();
  expect(parseChart('X', null)).toBeNull();
});
it('chartUrl encodes the symbol', () => {
  expect(chartUrl('^GSPC')).toBe('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=1d');
});
