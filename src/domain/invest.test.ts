import { describe, it, expect } from 'vitest';
import {
  ASSET_TYPES, INVEST_RULES, suggestInvestment, splitInvestment, positionOf, holdingValue,
  portfolioSummary, isBigDrop, checkinDue, monthCard, type Valuation, type Position,
} from './invest';
import type { AssetType, Holding, InvestmentTxn, PriceQuote } from './types';

const base = {
  trackedMonths: 3, avgIncomeMinor: 60_000_000, avgExpensesMinor: 40_000_000, savingsTargetMinor: 5_000_000,
  freeBeforeInvestMinor: 30_000_000, emergencyDone: false, settingMinor: null as number | null, prevExcessMinor: 0,
};

describe('suggestInvestment', () => {
  it('no data and no setting', () => {
    expect(suggestInvestment({ ...base, trackedMonths: 0 })).toEqual({ kind: 'no_data' });
  });
  it('no data but a manual setting', () => {
    expect(suggestInvestment({ ...base, trackedMonths: 0, settingMinor: 4_000_000 }))
      .toEqual({ kind: 'amount', amountMinor: 4_000_000, source: 'setting', emergencyDone: false });
  });
  it('computes 25% of the surplus before the emergency fund, rounded down', () => {
    expect(suggestInvestment(base)).toEqual({ kind: 'amount', amountMinor: 3_700_000, source: 'computed', emergencyDone: false });
  });
  it('computes 60% after the emergency fund', () => {
    expect(suggestInvestment({ ...base, emergencyDone: true }))
      .toEqual({ kind: 'amount', amountMinor: 9_000_000, source: 'computed', emergencyDone: true });
  });
  it('is capped by the free money', () => {
    expect(suggestInvestment({ ...base, emergencyDone: true, freeBeforeInvestMinor: 8_000_000 }))
      .toMatchObject({ amountMinor: 4_800_000 });
  });
  it('a manual setting overrides the computed amount even with data', () => {
    expect(suggestInvestment({ ...base, settingMinor: 2_000_000 }))
      .toEqual({ kind: 'amount', amountMinor: 2_000_000, source: 'setting', emergencyDone: false });
  });
  it('nothing spare when the surplus is not positive', () => {
    expect(suggestInvestment({ ...base, avgExpensesMinor: 56_000_000 })).toEqual({ kind: 'nothing_spare' });
  });
  it('nothing spare when there is no free money', () => {
    expect(suggestInvestment({ ...base, freeBeforeInvestMinor: -5 })).toEqual({ kind: 'nothing_spare' });
  });
  it('nothing spare when the amount rounds to 0', () => {
    expect(suggestInvestment({ ...base, avgIncomeMinor: 45_200_000 })).toEqual({ kind: 'nothing_spare' });
  });
});

const zero: Record<AssetType, number> = { bond: 0, etf: 0, stock: 0, crypto: 0 };
const sum = (p: Record<AssetType, number>) => ASSET_TYPES.reduce((s, t) => s + p[t], 0);

describe('splitInvestment', () => {
  it('follows the profile weights on an empty portfolio', () => {
    const s = splitInvestment(30_000_000, 'cautious', zero);
    expect(s.parts).toEqual({ bond: 15_000_000, etf: 10_500_000, stock: 2_400_000, crypto: 2_100_000 });
    expect(s.tooSmall).toEqual([]);
  });
  it('keeps a bond part that meets the 100 000 Ft MBH minimum', () => {
    expect(INVEST_RULES.minTicketMinor.bond).toBe(10_000_000);
    const s = splitInvestment(30_000_000, 'cautious', zero);
    expect(s.parts.bond).toBe(15_000_000);
    expect(s.tooSmall).not.toContain('bond');
  });
  it('folds a 50 000 Ft bond part (below the 100 000 Ft minimum) into the biggest other part', () => {
    const s = splitInvestment(10_000_000, 'cautious', zero);
    expect(s.parts.bond).toBe(0);
    expect(s.parts.etf).toBe(8_500_000);
    expect(sum(s.parts)).toBe(10_000_000);
    expect(s.tooSmall).toEqual(['bond']);
  });
  it('sends new money to the laggards', () => {
    const s = splitInvestment(30_000_000, 'cautious', { ...zero, etf: 30_000_000 });
    expect(s.parts.etf).toBe(0);
    expect(s.parts.bond).toBeGreaterThan(s.parts.stock);
    expect(sum(s.parts)).toBe(30_000_000);
  });
  it('folds tiny amounts into the one type whose minimum is met', () => {
    const s = splitInvestment(500_000, 'cautious', zero);
    expect(s.parts).toEqual({ bond: 0, etf: 500_000, stock: 0, crypto: 0 });
    expect(s.tooSmall).toEqual(expect.arrayContaining(['bond', 'stock', 'crypto']));
    expect(sum(s.parts)).toBe(500_000);
  });
  it('folds a bond part below its minimum into the biggest other part', () => {
    // bond share 750 000 < 10 000 000 minimum
    const s = splitInvestment(1_500_000, 'cautious', zero);
    expect(s.parts).toEqual({ bond: 0, etf: 1_500_000, stock: 0, crypto: 0 });
    expect(s.tooSmall).toEqual(expect.arrayContaining(['bond']));
  });
  it('keeps everything on the top-weight type when no minimum is met', () => {
    // 100 000 meets neither bond (10 000 000) nor etf/stock/crypto (200 000), so it stays on bond, flagged
    const s = splitInvestment(100_000, 'cautious', zero);
    expect(s.parts).toEqual({ bond: 100_000, etf: 0, stock: 0, crypto: 0 });
    expect(s.tooSmall).toContain('bond');
  });
  it('flags a lone holder below its own minimum as too small', () => {
    const s = splitInvestment(100_000, 'cautious', { ...zero, etf: 10_000_000 });
    expect(sum(s.parts)).toBe(100_000);
    const holder = ASSET_TYPES.find((t) => s.parts[t] > 0)!;
    expect(s.tooSmall).toContain(holder);
  });
  it('never has a non-zero part below its minimum when some minimum is met', () => {
    for (const amount of [300_000, 700_000, 2_000_000, 5_000_000, 12_345_600]) {
      const s = splitInvestment(amount, 'balanced', zero);
      expect(sum(s.parts)).toBe(amount);
      for (const t of ASSET_TYPES) {
        if (s.parts[t] > 0) expect(s.parts[t]).toBeGreaterThanOrEqual(INVEST_RULES.minTicketMinor[t]);
      }
    }
  });
  it('never goes negative whatever the holdings', () => {
    const s = splitInvestment(3_000_000, 'bold', { bond: 90_000_000, etf: 0, stock: 500, crypto: 70_000_000 });
    for (const t of ASSET_TYPES) expect(s.parts[t]).toBeGreaterThanOrEqual(0);
    expect(sum(s.parts)).toBe(3_000_000);
  });
});

const holding = (over: Partial<Holding> = {}): Holding => ({
  id: 'h1', asset_type: 'etf', product_id: 'p', name: 'X', ticker: 'X', platform: 'revolut',
  platform_name: null, currency: 'EUR', bond_rate_pct: null, ...over,
});
const txn = (over: Partial<InvestmentTxn>): InvestmentTxn => ({
  id: Math.random().toString(), holding_id: 'h1', side: 'buy', amount_huf_minor: 0, quantity: null,
  price: null, currency: 'EUR', date: '2026-01-01', account_id: 'a', transaction_id: 't', ...over,
});

describe('positionOf', () => {
  it('tracks quantity, pro-rata cost and first buy', () => {
    const p = positionOf(holding(), [
      txn({ side: 'buy', quantity: 1, amount_huf_minor: 10_000, date: '2026-02-01' }),
      txn({ side: 'buy', quantity: 2, amount_huf_minor: 22_000, date: '2026-03-01' }),
      txn({ side: 'sell', quantity: 1, amount_huf_minor: 12_000, date: '2026-04-01' }),
    ]);
    expect(p.quantity).toBe(2);
    expect(p.costMinor).toBe(21_333);
    expect(p.firstBuy).toBe('2026-02-01');
  });
  it('without quantities a sell closes the whole position, whatever the amount', () => {
    const buys = [txn({ amount_huf_minor: 50_000, date: '2026-01-01' }), txn({ amount_huf_minor: 30_000, date: '2026-01-15' })];
    for (const amount of [20_000, 80_000, 95_000]) {
      const p = positionOf(holding(), [...buys, txn({ side: 'sell', amount_huf_minor: amount, date: '2026-02-01' })]);
      expect(p.quantity).toBeNull();
      expect(p.costMinor).toBe(0);
      expect(p.lots.every((l) => l.costMinor === 0)).toBe(true);
    }
    const reopened = positionOf(holding(), [...buys, txn({ side: 'sell', amount_huf_minor: 1, date: '2026-02-01' }), txn({ amount_huf_minor: 10_000, date: '2026-03-01' })]);
    expect(reopened.costMinor).toBe(10_000);
  });
  it('ignores other holdings and has no first buy without buys', () => {
    const p = positionOf(holding(), [txn({ holding_id: 'other', amount_huf_minor: 5 })]);
    expect(p).toMatchObject({ costMinor: 0, firstBuy: null });
  });
});

const quote = (price: number): PriceQuote => ({ id: 'q', ticker: 'X', price, currency: 'EUR', as_of: '2026-11-01' });
const pos = (over: Partial<Position> = {}): Position => ({ holding: holding(), quantity: 2, costMinor: 7_000_000, firstBuy: '2026-01-01', lots: [{ date: '2026-01-01', costMinor: 7_000_000 }], ...over });

describe('holdingValue', () => {
  it('values from quote x quantity x FX', () => {
    expect(holdingValue(pos(), quote(100), 400, '2026-11-03'))
      .toMatchObject({ valueMinor: 8_000_000, priced: true, gainMinor: 1_000_000 });
  });
  it('falls back to cost without a quote', () => {
    expect(holdingValue(pos(), null, 400, '2026-11-03')).toMatchObject({ valueMinor: 7_000_000, priced: false, gainMinor: 0 });
  });
  it('falls back to cost when FX is unavailable or quantity unknown', () => {
    expect(holdingValue(pos(), quote(100), null, '2026-11-03')).toMatchObject({ valueMinor: 7_000_000, priced: false });
    expect(holdingValue(pos({ quantity: null }), quote(100), 400, '2026-11-03')).toMatchObject({ priced: false });
  });
  it('accrues bonds simply', () => {
    const bond = pos({ holding: holding({ asset_type: 'bond', bond_rate_pct: 6.5 }), quantity: null, costMinor: 1_000_000, firstBuy: '2025-11-03', lots: [{ date: '2025-11-03', costMinor: 1_000_000 }] });
    expect(holdingValue(bond, null, null, '2026-11-03').valueMinor).toBe(1_065_000);
    expect(holdingValue(bond, null, null, '2025-11-03').valueMinor).toBe(1_000_000);
  });
  it('accrues each bond lot from its own buy date', () => {
    const h = holding({ asset_type: 'bond', bond_rate_pct: 6.5 });
    const buys = [
      txn({ amount_huf_minor: 1_000_000, date: '2025-11-03' }),
      txn({ amount_huf_minor: 1_000_000, date: '2026-11-03' }),
    ];
    expect(holdingValue(positionOf(h, buys), null, null, '2026-11-03').valueMinor).toBe(2_065_000);
    const sold = positionOf(h, [...buys, txn({ side: 'sell', amount_huf_minor: 1_000_000, date: '2026-11-03' })]);
    // R13: a sell without quantity closes the whole bond position.
    expect(sold.costMinor).toBe(0);
    expect(holdingValue(sold, null, null, '2026-11-03').valueMinor).toBe(0);
  });
  it('has no gain ratio at zero cost', () => {
    expect(holdingValue(pos({ costMinor: 0 }), null, null, '2026-11-03').gainRatio).toBeNull();
  });
});

const val = (valueMinor: number, costMinor: number, priced = true): Valuation => ({
  valueMinor, costMinor, gainMinor: valueMinor - costMinor, gainRatio: costMinor ? (valueMinor - costMinor) / costMinor : null, priced,
});

describe('portfolioSummary', () => {
  it('adds up and counts unpriced', () => {
    const s = portfolioSummary([
      { type: 'etf', v: val(120, 100) }, { type: 'etf', v: val(50, 50, false) }, { type: 'bond', v: val(200, 180) },
    ]);
    expect(s).toMatchObject({ valueMinor: 370, costMinor: 330, gainMinor: 40, unpriced: 1 });
    expect(s.byType).toEqual({ bond: 200, etf: 170, stock: 0, crypto: 0 });
    expect(s.gainRatio).toBeCloseTo(40 / 330);
  });
  it('empty portfolio has no ratio', () => {
    expect(portfolioSummary([]).gainRatio).toBeNull();
  });
});

describe('isBigDrop', () => {
  it('is true at -15% and false at -14.9%', () => {
    expect(isBigDrop(val(85, 100))).toBe(true);
    expect(isBigDrop(val(851, 1000))).toBe(false);
    expect(isBigDrop(val(0, 0))).toBe(false);
  });
});

describe('checkinDue', () => {
  const t = { profile: 'cautious' as const, lastCheckin: null, firstBuy: '2026-01-15' };
  it('waits 3 months after the first buy', () => {
    expect(checkinDue({ ...t, today: '2026-04-14' })).toBe(false);
    expect(checkinDue({ ...t, today: '2026-04-15' })).toBe(true);
    expect(checkinDue({ ...t, today: '2026-09-01' })).toBe(true);
  });
  it('is false when the last check-in is recent', () => {
    expect(checkinDue({ ...t, lastCheckin: '2026-08-20', today: '2026-09-01' })).toBe(false);
    expect(checkinDue({ ...t, lastCheckin: '2026-08-20', today: '2026-11-20' })).toBe(true);
  });
  it('is never due for bold or without a first buy', () => {
    expect(checkinDue({ ...t, profile: 'bold', today: '2026-11-03' })).toBe(false);
    expect(checkinDue({ ...t, firstBuy: null, today: '2026-11-03' })).toBe(false);
  });
});

describe('monthCard', () => {
  it('never shows a negative amount left', () => {
    expect(monthCard(5_000_000, 6_000_000)).toEqual({ suggestedMinor: 5_000_000, investedMinor: 6_000_000, leftMinor: 0 });
    expect(monthCard(5_000_000, 2_000_000).leftMinor).toBe(3_000_000);
  });
});

describe('suggestInvestment overspend trim', () => {
  const raw4m = { ...base, avgIncomeMinor: 61_000_000, freeBeforeInvestMinor: 16_000_000 }; // raw 4_000_000
  it('caps the trim at half of the raw amount', () =>
    expect(suggestInvestment({ ...raw4m, prevExcessMinor: 3_000_000 })).toMatchObject({ amountMinor: 2_000_000 }));
  it('trims by a smaller excess in full', () =>
    expect(suggestInvestment({ ...raw4m, prevExcessMinor: 500_000 })).toMatchObject({ amountMinor: 3_500_000 }));
  it('ignores a negative excess', () =>
    expect(suggestInvestment({ ...raw4m, prevExcessMinor: -9 })).toMatchObject({ amountMinor: 4_000_000 }));
  it('does not touch a fixed setting', () =>
    expect(suggestInvestment({ ...raw4m, settingMinor: 4_000_000, prevExcessMinor: 3_000_000 }))
      .toMatchObject({ amountMinor: 4_000_000, source: 'setting' }));
});
