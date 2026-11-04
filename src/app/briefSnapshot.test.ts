import { describe, expect, test } from 'vitest';
import type { MonthlyAllowance } from '@/domain/allowance';
import type { Holding, InvestmentTxn, Settings, Txn } from '@/domain/types';
import type { HomeData } from '@/features/home/useHomeData';
import { buildInvestCore } from '@/features/invest/investModel';
import { buildBriefSnapshot } from './briefSnapshot';

const settings: Settings = {
  base_currency: 'HUF', monthly_savings_target_minor: 5_000_000, monthly_investment_amount_minor: null, emergency_fund_months: 6,
  week_start: 'monday', digest_time: '07:00', digest_enabled: false, news_interval_hours: 4, timezone: 'Europe/Budapest', month_overrides: {}, has_expensive_debt: null,
  risk_profile: 'cautious', risk_checkin_at: null, invest_suggested_log: {},
};
const monthly: MonthlyAllowance = {
  month: '2026-11', recurringIncomeMinor: 50_000_000, oneOffIncomeMinor: 0, recurringExpensesMinor: 20_000_000,
  savingsTargetMinor: 5_000_000, investmentMinor: 2_000_000, previousDeficitMinor: 0, freeMinor: 23_000_000,
  spentMinor: 0, remainingMinor: 12_345_000,
};
const planning = { trackedMonths: 2, avgIncomeMinor: 50_000_000, avgExpensesMinor: 30_000_000 };
const holding = (id: string, product_id: string, asset_type: Holding['asset_type'], over: Partial<Holding> = {}): Holding => ({
  id, asset_type, product_id, name: product_id, ticker: null, platform: 'revolut', platform_name: null, currency: 'EUR', bond_rate_pct: null, ...over,
});
let n = 0;
const buy = (holding_id: string, amount: number, date: string, quantity: number | null = null, side: 'buy' | 'sell' = 'buy'): InvestmentTxn => ({
  id: `t${++n}`, holding_id, side, amount_huf_minor: amount, quantity, price: null, currency: 'HUF', date, account_id: 'a1', transaction_id: `x${n}`,
});
const base = { today: '2026-11-03', settings, monthly, planning, emergencyDone: false, quotes: [], hufPerUnit: {} };
const home = { today: '2026-11-03', txns: [] as Txn[], settings, model: { monthly } } as unknown as HomeData;

describe('buildBriefSnapshot', () => {
  test('follows the core suggestion and the home numbers', () => {
    const core = buildInvestCore({ ...base, holdings: [], txns: [] });
    const s = buildBriefSnapshot(core, home, '2026-11-03T06:00:00Z');
    expect(s.suggestion).toEqual({ kind: 'amount', amountMinor: 3_700_000, source: 'computed' });
    expect(s.split).toEqual(core.split!.parts);
    expect(s.remainingMinor).toBe(12_345_000);
    expect(s.month).toBe('2026-11');
    expect(s.computed_at).toBe('2026-11-03T06:00:00Z');
    expect(s.dailySpendMinor).toBe(0);
  });

  test('no data gives a null amount, source and split', () => {
    const core = buildInvestCore({ ...base, planning: { ...planning, trackedMonths: 0 }, holdings: [], txns: [] });
    const s = buildBriefSnapshot(core, home, 'x');
    expect(s.suggestion).toEqual({ kind: 'no_data', amountMinor: null, source: null });
    expect(s.split).toBeNull();
  });

  test('lists open positions only, unpriced value as null', () => {
    const hs = [holding('e', 'vanguard-ftse-all-world-acc', 'etf'), holding('s', 'apple', 'stock', { currency: 'USD' }), holding('x', 'apple', 'stock')];
    const txns = [
      buy('e', 4_000_000, '2026-11-01', 1), buy('s', 1_000_000, '2026-11-01', 0.5),
      buy('x', 1_000_000, '2026-08-01', 1), buy('x', 1_200_000, '2026-09-01', 1, 'sell'),
    ];
    const core = buildInvestCore({
      ...base, holdings: hs, txns,
      quotes: [{ id: 'q1', ticker: 'VWCE.DE', price: 110, currency: 'EUR', as_of: '2026-11-03' }, { id: 'q2', ticker: 'AAPL', price: 200, currency: 'USD', as_of: '2026-11-03' }],
      hufPerUnit: { EUR: 400, USD: null },
    });
    const s = buildBriefSnapshot(core, home, 'x');
    expect(s.holdings.map((h) => h.holding_id)).toEqual(['e', 's']);
    expect(s.holdings[0]).toMatchObject({ asset_type: 'etf', quote_symbol: 'VWCE.DE', costMinor: 4_000_000, valueMinor: 4_400_000 });
    expect(s.holdings[1]).toMatchObject({ quote_symbol: 'AAPL', costMinor: 1_000_000, valueMinor: null });
  });
});
