import { describe, expect, it } from 'vitest';
import type { Account, Holding, InvestmentTxn, Txn } from '@/domain/types';
import { positionOf } from '@/domain/invest';
import { findSmsCandidates, payableAccounts, planSell, validateBuy, type BuyInput } from './record';

const acct = (o: Partial<Account>): Account => ({
  id: 'mbh', name: 'MBH', type: 'checking', currency: 'HUF', opening_balance_minor: 0,
  is_default: true, is_savings_target: false, archived: false, sms_sender: 'MBH Bank', ...o,
});
const txn = (o: Partial<Txn>): Txn => ({
  id: 't1', account_id: 'mbh', kind: 'expense', amount_minor: 10_000_000, currency: 'HUF', amount_huf_minor: 10_000_000,
  category_id: null, date: '2026-11-03', note: '', source: 'sms', needs_review: true, recurring_rule_id: null,
  transfer_pair_id: null, sms_message_id: 'sms1', ...o,
});
const buy = (o: Partial<BuyInput>): BuyInput => ({
  productId: 'map-plusz', amountMinor: 10_000_000, quantity: null, price: null, date: '2026-11-03',
  platform: 'mbh', platformName: null, accountId: 'mbh', bondRatePct: null, ...o,
});
const holding = (o: Partial<Holding>): Holding => ({
  id: 'h1', asset_type: 'etf', product_id: 'vanguard-ftse-all-world-acc', name: 'VWCE', ticker: 'VWCE.DE',
  platform: 'revolut', platform_name: null, currency: 'EUR', bond_rate_pct: null, ...o,
});
const itxn = (o: Partial<InvestmentTxn>): InvestmentTxn => ({
  id: 'i1', holding_id: 'h1', side: 'buy', amount_huf_minor: 10_000_000, quantity: null, price: null,
  currency: 'HUF', date: '2026-10-01', account_id: 'mbh', transaction_id: 't1', ...o,
});

describe('payableAccounts', () => {
  it('keeps live checking and cash, drops savings, investment and archived', () => {
    const accounts = [
      acct({ id: 'chk' }), acct({ id: 'cash', type: 'cash' }), acct({ id: 'sav', type: 'savings' }),
      acct({ id: 'inv', type: 'investment' }), acct({ id: 'old', archived: true }),
    ];
    expect(payableAccounts(accounts).map((a) => a.id)).toEqual(['chk', 'cash']);
  });
});

describe('validateBuy', () => {
  const accounts = [acct({}), acct({ id: 'sav', type: 'savings' })];
  it('accepts a valid buy', () => {
    expect(validateBuy(buy({}), accounts)).toBeNull();
  });
  it('rejects an amount of zero or less', () => {
    expect(validateBuy(buy({ amountMinor: 0 }), accounts)).toBe('Enter the amount you paid');
    expect(validateBuy(buy({ amountMinor: -100 }), accounts)).toBe('Enter the amount you paid');
  });
  it('rejects a savings account', () => {
    expect(validateBuy(buy({ accountId: 'sav' }), accounts)).toBe('Pay from a current account or cash');
  });
  it('rejects an unknown product', () => {
    expect(validateBuy(buy({ productId: 'dogecoin' }), accounts)).not.toBeNull();
  });
});

describe('findSmsCandidates', () => {
  const accounts = [acct({}), acct({ id: 'rev', sms_sender: null })];
  const q = { accountId: 'mbh', amountMinor: 10_000_000, date: '2026-11-03' };
  it('returns SMS expenses on the account with the same amount within ±3 days', () => {
    const rows = [txn({ id: 'a', date: '2026-10-31' }), txn({ id: 'b', date: '2026-11-06' }), txn({ id: 'c' })];
    expect(findSmsCandidates(q, rows, accounts).map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });
  it('excludes non-SMS rows, other accounts, other amounts, day +4, recurring rows and invest_buy rows', () => {
    const rows = [
      txn({ id: 'manual', source: 'manual', sms_message_id: null }),
      txn({ id: 'other-acct', account_id: 'rev' }),
      txn({ id: 'other-amount', amount_minor: 9_999_900 }),
      txn({ id: 'day+4', date: '2026-11-07' }),
      txn({ id: 'day-4', date: '2026-10-30' }),
      txn({ id: 'recurring', recurring_rule_id: 'r1' }),
      txn({ id: 'bought', kind: 'invest_buy' }),
      txn({ id: 'income', kind: 'income' }),
    ];
    expect(findSmsCandidates(q, rows, accounts)).toEqual([]);
  });
  it('offers a manual row that carries a bank SMS (a buy linked by a late SMS, then deleted)', () => {
    expect(findSmsCandidates(q, [txn({ id: 'linked', source: 'manual', sms_message_id: 'sms9' })], accounts).map((t) => t.id)).toEqual(['linked']);
  });
  it('returns [] when the account has no sms_sender', () => {
    expect(findSmsCandidates({ ...q, accountId: 'rev' }, [txn({ account_id: 'rev' })], accounts)).toEqual([]);
  });
});

describe('planSell', () => {
  it('quantity sell above the held quantity says how much is held', () => {
    const p = positionOf(holding({}), [itxn({ quantity: 2, price: 100 })]);
    expect(planSell(p, { amountMinor: 1_000_000, quantity: 3 })).toBe('You hold 2');
  });
  it('quantity sell on a position without quantity is an error', () => {
    const p = positionOf(holding({}), [itxn({})]);
    expect(planSell(p, { amountMinor: 1_000_000, quantity: 1 })).not.toBeNull();
  });
  it('a sell without quantity on a no-quantity position closes it: any amount, even above cost, is valid', () => {
    const p = positionOf(holding({}), [itxn({ amount_huf_minor: 10_000_000 })]);
    expect(planSell(p, { amountMinor: 10_000_100, quantity: null })).toBeNull();
    expect(planSell(p, { amountMinor: 1, quantity: null })).toBeNull();
  });
  it('a closed no-quantity position has nothing left to sell', () => {
    const p = positionOf(holding({}), [itxn({}), itxn({ id: 'i2', side: 'sell', date: '2026-10-02' })]);
    expect(planSell(p, { amountMinor: 1_000_000, quantity: null })).toBe('Nothing left to sell');
  });
  it('a valid sell is null', () => {
    const withQty = positionOf(holding({}), [itxn({ quantity: 2, price: 100 })]);
    expect(planSell(withQty, { amountMinor: 1_000_000, quantity: 2 })).toBeNull();
    expect(planSell(withQty, { amountMinor: 50_000_000, quantity: null })).toBeNull();
    const noQty = positionOf(holding({}), [itxn({})]);
    expect(planSell(noQty, { amountMinor: 10_000_000, quantity: null })).toBeNull();
  });
  it('rejects an amount of zero or less', () => {
    const p = positionOf(holding({}), [itxn({})]);
    expect(planSell(p, { amountMinor: 0, quantity: null })).not.toBeNull();
  });
});
