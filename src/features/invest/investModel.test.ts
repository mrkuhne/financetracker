import { describe, expect, test } from 'vitest';
import type { MonthlyAllowance } from '@/domain/allowance';
import type { Holding, InvestmentTxn, SavingsGoal, Settings, Txn } from '@/domain/types';
import {
  adviceFor, buildInvestCore, deleteConfirmCopy, holdingDetail, priceLine, sharedCall, pctSigned, platformOf, costByType, freeBeforeInvestMinor, investedThisMonthMinor, isEmergencyDone, nextProfile, quoteSymbolsFor, sharesOf,
} from './investModel';

const settings: Settings = {
  base_currency: 'HUF', monthly_savings_target_minor: 5_000_000, monthly_investment_amount_minor: null, emergency_fund_months: 6,
  week_start: 'monday', digest_time: '07:00', timezone: 'Europe/Budapest', month_overrides: {}, has_expensive_debt: null,
  risk_profile: 'cautious', risk_checkin_at: null,
};
const monthly: MonthlyAllowance = {
  month: '2026-11', recurringIncomeMinor: 50_000_000, oneOffIncomeMinor: 0, recurringExpensesMinor: 20_000_000,
  savingsTargetMinor: 5_000_000, investmentMinor: 2_000_000, previousDeficitMinor: 0, freeMinor: 23_000_000,
  spentMinor: 0, remainingMinor: 23_000_000,
};
const planning = { trackedMonths: 2, avgIncomeMinor: 50_000_000, avgExpensesMinor: 30_000_000 };

const holding = (id: string, product_id: string, asset_type: Holding['asset_type'], over: Partial<Holding> = {}): Holding => ({
  id, asset_type, product_id, name: product_id, ticker: null, platform: 'revolut', platform_name: null, currency: 'EUR', bond_rate_pct: null, ...over,
});
let n = 0;
const buy = (holding_id: string, amount: number, date: string, quantity: number | null = null, side: 'buy' | 'sell' = 'buy'): InvestmentTxn => ({
  id: `t${++n}`, holding_id, side, amount_huf_minor: amount, quantity, price: null, currency: 'HUF', date, account_id: 'a1', transaction_id: `x${n}`,
});
const goal = (over: Partial<SavingsGoal> = {}) => ({ id: 'g1', name: 'Emergency', kind: 'emergency', target_minor: null, account_id: 's1', priority: 0, ...over }) as SavingsGoal;

describe('investModel helpers', () => {
  test('free before invest adds back what was invested this month', () => {
    expect(freeBeforeInvestMinor({ freeMinor: 23_000_000, investmentMinor: 2_000_000 })).toBe(25_000_000);
  });
  test('invested this month counts only buys dated in the month', () => {
    const txns = [buy('h', 1_000_000, '2026-11-02'), buy('h', 500_000, '2026-10-31'), buy('h', 300_000, '2026-11-03', null, 'sell')];
    expect(investedThisMonthMinor(txns, '2026-11')).toBe(1_000_000);
  });
  test('emergency done needs a goal with a target, fully saved', () => {
    expect(isEmergencyDone([], { s1: 1e9 }, 6, 100)).toBe(false);
    expect(isEmergencyDone([goal()], { s1: 600 }, 6, 100)).toBe(true);
    expect(isEmergencyDone([goal()], { s1: 599 }, 6, 100)).toBe(false);
    expect(isEmergencyDone([goal()], { s1: 600 }, 6, 0)).toBe(false); // target 0
  });
  test('next profile steps up and stops at bold', () => {
    expect(nextProfile('cautious')).toBe('balanced');
    expect(nextProfile('balanced')).toBe('bold');
    expect(nextProfile('bold')).toBe('bold');
  });
  test('quote symbols come from the catalog, without bonds or duplicates', () => {
    const hs = [holding('1', 'apple', 'stock'), holding('2', 'apple', 'stock', { platform: 'other' }), holding('3', 'fix-map', 'bond')];
    expect(quoteSymbolsFor(hs)).toEqual(['AAPL']);
  });
  test('advice per type falls back when missing or of another type', () => {
    const a = { intro: 'Hi', per_type: { bond: { text: 'B', product_id: 'fix-map' }, etf: { text: 'E', product_id: 'apple' } } };
    expect(adviceFor(a, 'bond')).toEqual({ text: 'B', product_id: 'fix-map' });
    expect(adviceFor(a, 'etf')).toBeNull();
    expect(adviceFor(a, 'stock')).toBeNull();
    expect(adviceFor(null, 'bond')).toBeNull();
  });
  test('percent and platform labels', () => {
    expect(pctSigned(0.046)).toBe('+4.6%');
    expect(pctSigned(-0.012)).toBe('−1.2%');
    expect(pctSigned(0.0001)).toBe('0.0%');
    expect(platformOf({ platform: 'other', platform_name: 'Bitstamp' })).toBe('Bitstamp');
    expect(platformOf({ platform: 'other', platform_name: null })).toBe('Other');
    expect(platformOf({ platform: 'mbh', platform_name: null })).toBe('MBH');
  });
  test('shares and cost by type', () => {
    expect(sharesOf({ bond: 300, etf: 100, stock: 0, crypto: 0 })).toEqual({ bond: 0.75, etf: 0.25, stock: 0, crypto: 0 });
    expect(sharesOf({ bond: 0, etf: 0, stock: 0, crypto: 0 }).bond).toBe(0);
  });
});

describe('buildInvestCore', () => {
  const base = { today: '2026-11-03', settings, monthly, planning, emergencyDone: false, quotes: [], hufPerUnit: {} };

  test('no holdings: computed suggestion, split and card', () => {
    const m = buildInvestCore({ ...base, holdings: [], txns: [] });
    // min(50M-30M-5M=15M, 25M) * 0.25 = 3.75M -> floor to 1 000 Ft steps = 3 700 000
    expect(m.suggestion).toEqual({ kind: 'amount', amountMinor: 3_700_000, source: 'computed', emergencyDone: false });
    expect(m.split).not.toBeNull();
    expect(Object.values(m.split!.parts).reduce((a, b) => a + b, 0)).toBe(3_700_000);
    expect(m.card).toEqual({ suggestedMinor: 3_700_000, investedMinor: 0, leftMinor: 3_700_000 });
    expect(m.positions).toEqual([]);
    expect(m.checkinDue).toBe(false);
  });

  test('no tracked month and no setting: no_data, no split', () => {
    const m = buildInvestCore({ ...base, planning: { ...planning, trackedMonths: 0 }, holdings: [], txns: [] });
    expect(m.suggestion.kind).toBe('no_data');
    expect(m.split).toBeNull();
    expect(m.card).toBeNull();
  });

  test('values priced holdings with FX, keeps unpriced at cost', () => {
    const hs = [holding('e', 'vanguard-ftse-all-world-acc', 'etf'), holding('s', 'apple', 'stock', { currency: 'USD' }), holding('b', 'fix-map', 'bond', { bond_rate_pct: null, currency: 'HUF' })];
    const txns = [buy('e', 4_000_000, '2026-11-01', 1), buy('s', 1_000_000, '2026-11-01', 0.5), buy('b', 10_000_000, '2026-11-01')];
    const m = buildInvestCore({
      ...base, holdings: hs, txns,
      quotes: [{ id: 'q1', ticker: 'VWCE.DE', price: 110, currency: 'EUR', as_of: '2026-11-03' }, { id: 'q2', ticker: 'AAPL', price: 200, currency: 'USD', as_of: '2026-11-03' }],
      hufPerUnit: { EUR: 400, USD: null },
    });
    expect(m.valuations.get('e')).toMatchObject({ valueMinor: 4_400_000, priced: true });
    expect(m.valuations.get('s')).toMatchObject({ valueMinor: 1_000_000, priced: false }); // failed USD rate
    expect(m.valuations.get('b')).toMatchObject({ valueMinor: 10_000_000, priced: false }); // no bond rate
    expect(m.summary.unpriced).toBe(2);
    expect(m.summary.byType.etf).toBe(4_400_000);
    expect(m.card?.investedMinor).toBe(15_000_000);
    expect(costByType(m.positions)).toEqual({ bond: 10_000_000, etf: 4_000_000, stock: 1_000_000, crypto: 0 });
  });

  test('a fully sold holding is not an open position', () => {
    const hs = [holding('e', 'apple', 'stock')];
    const txns = [buy('e', 1_000_000, '2026-08-01', 1), buy('e', 1_200_000, '2026-09-01', 1, 'sell')];
    const m = buildInvestCore({ ...base, holdings: hs, txns });
    expect(m.positions).toEqual([]);
    expect(m.summary.valueMinor).toBe(0);
  });

  test('setting amount wins; check-in is due three months after the first buy', () => {
    const hs = [holding('e', 'apple', 'stock')];
    const m = buildInvestCore({
      ...base, settings: { ...settings, monthly_investment_amount_minor: 4_000_000 }, holdings: hs, txns: [buy('e', 1_000_000, '2026-08-03', 1)],
    });
    expect(m.suggestion).toMatchObject({ kind: 'amount', amountMinor: 4_000_000, source: 'setting' });
    expect(m.checkinDue).toBe(true);
    const later = buildInvestCore({
      ...base, settings: { ...settings, risk_checkin_at: '2026-10-01' }, holdings: hs, txns: [buy('e', 1_000_000, '2026-08-03', 1)],
    });
    expect(later.checkinDue).toBe(false);
  });
});

describe('split basis: holdings before the month', () => {
  const base = {
    today: '2026-11-03', settings: { ...settings, monthly_investment_amount_minor: 20_000_000 }, monthly, planning,
    emergencyDone: false, quotes: [], hufPerUnit: {},
  };
  const bond = holding('b', 'fix-map', 'bond', { bond_rate_pct: 5.5, currency: 'HUF' });
  const empty = buildInvestCore({ ...base, holdings: [], txns: [] });

  test('a buy dated this month leaves the split unchanged but counts as invested', () => {
    const m = buildInvestCore({ ...base, holdings: [bond], txns: [buy('b', 10_000_000, '2026-11-01')] });
    expect(m.split).toEqual(empty.split);
    expect(m.card?.investedMinor).toBe(10_000_000);
    expect(m.basis.costByType.bond).toBe(0);
    expect(m.summary.byType.bond).toBeGreaterThan(0); // the portfolio itself shows the buy
  });
  test('a buy dated last month changes the split', () => {
    const m = buildInvestCore({ ...base, holdings: [bond], txns: [buy('b', 10_000_000, '2026-10-31')] });
    expect(m.split).not.toEqual(empty.split);
    expect(m.basis.costByType.bond).toBe(10_000_000);
    expect(m.card?.investedMinor).toBe(0);
  });
});

describe('sharedCall', () => {
  test('one run per key; later callers share it; force runs again', async () => {
    const calls = new Map<string, Promise<number>>();
    let runs = 0;
    const run = () => Promise.resolve(++runs);
    const a = sharedCall(calls, 'k', run);
    const b = sharedCall(calls, 'k', run);
    expect(a).toBe(b);
    expect(await b).toBe(1);
    expect(await sharedCall(calls, 'k', run)).toBe(1); // settled: still not called again
    expect(await sharedCall(calls, 'other', run)).toBe(2);
    expect(await sharedCall(calls, 'k', run, true)).toBe(3);
    expect(runs).toBe(3);
  });
});

describe('holding page helpers', () => {
  const base = { today: '2026-11-03', settings, monthly, planning, emergencyDone: false, hufPerUnit: { EUR: 400 } };
  const quote = { id: 'q1', ticker: 'VWCE.DE', price: 110, currency: 'EUR', as_of: '2026-11-02' };

  test('an open holding: position, valuation, its quote and history newest first', () => {
    const hs = [holding('e', 'vanguard-ftse-all-world-acc', 'etf'), holding('o', 'apple', 'stock')];
    const b1 = buy('e', 4_000_000, '2026-10-01', 1);
    const b2 = buy('e', 4_000_000, '2026-11-01', 1);
    const s1 = buy('e', 4_200_000, '2026-11-01', 1, 'sell');
    const other = buy('o', 1_000_000, '2026-11-02', 1);
    const m = buildInvestCore({ ...base, holdings: hs, txns: [b1, b2, s1, other], quotes: [quote] });
    const d = holdingDetail(m, 'e')!;
    expect(d.holding.id).toBe('e');
    expect(d.position.quantity).toBe(1);
    expect(d.valuation).toMatchObject({ valueMinor: 4_400_000, priced: true });
    expect(d.quote).toEqual(quote);
    // Same day: the sell happened after the buy, so it is listed first.
    expect(d.history.map((t) => t.id)).toEqual([s1.id, b2.id, b1.id]);
  });

  test('a fully sold holding still opens, without a valuation', () => {
    const hs = [holding('e', 'vanguard-ftse-all-world-acc', 'etf')];
    const b = buy('e', 4_000_000, '2026-10-01', 1);
    const s = buy('e', 4_500_000, '2026-11-01', 1, 'sell');
    const m = buildInvestCore({ ...base, holdings: hs, txns: [b, s], quotes: [quote] });
    expect(m.positions).toEqual([]);
    const d = holdingDetail(m, 'e')!;
    expect(d.position.quantity).toBe(0);
    expect(d.valuation).toBeNull();
    expect(d.history.map((t) => t.id)).toEqual([s.id, b.id]);
  });

  test('a bond without a rate is unpriced, so its page never shows a null rate', () => {
    const hs = [holding('b', 'fix-map', 'bond', { bond_rate_pct: null, currency: 'HUF' })];
    const m = buildInvestCore({ ...base, holdings: hs, txns: [buy('b', 10_000_000, '2026-10-01')], quotes: [] });
    const d = holdingDetail(m, 'b')!;
    expect(d.valuation).toMatchObject({ valueMinor: 10_000_000, priced: false });
    expect(priceLine(d.holding, d.valuation, d.quote)).toBe('Price not updated');
  });

  test('an unknown holding, or one with no txns left, is null', () => {
    const m = buildInvestCore({ ...base, holdings: [holding('e', 'apple', 'stock')], txns: [], quotes: [] });
    expect(holdingDetail(m, 'e')).toBeNull();
    expect(holdingDetail(m, 'nope')).toBeNull();
  });

  test('price line: quote date, bond rate, or not updated', () => {
    const v = (priced: boolean) => ({ valueMinor: 1, costMinor: 1, gainMinor: 0, gainRatio: 0, priced });
    const etf = holding('e', 'vanguard-ftse-all-world-acc', 'etf');
    const bond = holding('b', 'fix-map', 'bond', { bond_rate_pct: 5.5 });
    expect(priceLine(etf, v(true), quote)).toBe('Price from 2026-11-02');
    expect(priceLine(etf, v(false), quote)).toBe('Price not updated');
    expect(priceLine(etf, v(false), null)).toBe('Price not updated');
    expect(priceLine(bond, v(true), null)).toBe('Estimated from the 5.5% yearly rate');
    expect(priceLine({ ...bond, bond_rate_pct: 5 }, v(true), null)).toBe('Estimated from the 5% yearly rate');
    expect(priceLine({ ...bond, bond_rate_pct: null }, v(false), null)).toBe('Price not updated');
    expect(priceLine({ ...bond, bond_rate_pct: null }, v(true), null)).toBe('Estimated value');
    expect(priceLine(etf, null, quote)).toBeNull();
  });

  test('delete confirmation names what happens to the money movement', () => {
    const b = buy('e', 1, '2026-11-01');
    const s = buy('e', 1, '2026-11-02', null, 'sell');
    const money = (id: string, sms: string | null): Txn => ({
      id, account_id: 'a1', kind: 'invest_buy', amount_minor: 1, currency: 'HUF', amount_huf_minor: 1, category_id: null, date: '2026-11-01',
      source: sms ? 'sms' : 'manual', needs_review: false, recurring_rule_id: null, transfer_pair_id: null, sms_message_id: sms,
    });
    expect(deleteConfirmCopy(b, [money(b.transaction_id, null)])).toBe('Delete this buy? Its money movement is removed too.');
    expect(deleteConfirmCopy(b, [money(b.transaction_id, 'm1')])).toBe('Delete this buy? The bank message goes back to Review.');
    expect(deleteConfirmCopy(s, [])).toBe('Delete this sell? Its money movement is removed too.');
  });
});
