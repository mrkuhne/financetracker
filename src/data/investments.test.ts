import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, Holding, InvestmentTxn, Txn } from '@/domain/types';

const holdings: Record<string, unknown>[] = [];
const itxns: Record<string, unknown>[] = [];
const ent = {
  holdingCreate: vi.fn(),
  holdingDelete: vi.fn(),
  itxnCreate: vi.fn(),
  itxnDelete: vi.fn(),
};
vi.mock('@/data/client', () => ({
  base44: {
    entities: {
      Holding: {
        list: async () => holdings,
        create: (...a: unknown[]) => ent.holdingCreate(...a),
        delete: (...a: unknown[]) => ent.holdingDelete(...a),
      },
      InvestmentTransaction: {
        list: async () => itxns,
        create: (...a: unknown[]) => ent.itxnCreate(...a),
        delete: (...a: unknown[]) => ent.itxnDelete(...a),
      },
    },
  },
}));
const tx = { create: vi.fn(), update: vi.fn(), delete: vi.fn(), get: vi.fn() };
vi.mock('@/data/transactions', () => ({
  createTransaction: (...a: unknown[]) => tx.create(...a),
  updateTransaction: (...a: unknown[]) => tx.update(...a),
  deleteTransaction: (...a: unknown[]) => tx.delete(...a),
  getTransaction: (...a: unknown[]) => tx.get(...a),
}));
let accounts: Account[] = [];
vi.mock('@/data/accounts', () => ({ listAccounts: async () => accounts }));
vi.mock('@/data/fx', () => ({ getHufPerUnit: async (c: string) => (c === 'EUR' ? 400 : 1) }));

import { deleteInvestmentTxn, recordBuy, recordSell } from '@/data/investments';
import type { BuyInput } from '@/features/invest/record';

const acct = (o: Partial<Account>): Account => ({
  id: 'mbh', name: 'MBH', type: 'checking', currency: 'HUF', opening_balance_minor: 0,
  is_default: true, is_savings_target: false, archived: false, sms_sender: 'MBH Bank', ...o,
});
const txn = (o: Partial<Txn>): Txn => ({
  id: 'sms-t', account_id: 'mbh', kind: 'expense', amount_minor: 10_000_000, currency: 'HUF', amount_huf_minor: 10_000_000,
  category_id: 'cat-other', date: '2026-11-04', note: 'MBH', source: 'sms', needs_review: true, recurring_rule_id: null,
  transfer_pair_id: null, sms_message_id: 'sms1', ...o,
});
const buy = (o: Partial<BuyInput>): BuyInput => ({
  productId: 'map-plusz', amountMinor: 10_000_000, quantity: null, price: null, date: '2026-11-03',
  platform: 'mbh', platformName: null, accountId: 'mbh', bondRatePct: null, ...o,
});
const holding: Holding = {
  id: 'h1', asset_type: 'etf', product_id: 'vanguard-ftse-all-world-acc', name: 'VWCE', ticker: 'VWCE.DE',
  platform: 'revolut', platform_name: null, currency: 'EUR', bond_rate_pct: null,
};
const itxn = (o: Partial<InvestmentTxn>): InvestmentTxn => ({
  id: 'i1', holding_id: 'h1', side: 'buy', amount_huf_minor: 10_000_000, quantity: null, price: null,
  currency: 'HUF', date: '2026-10-01', account_id: 'mbh', transaction_id: 't1', ...o,
});

beforeEach(() => {
  holdings.length = 0;
  itxns.length = 0;
  accounts = [acct({}), acct({ id: 'rev', currency: 'EUR', sms_sender: null, is_default: false }), acct({ id: 'sav', type: 'savings' })];
  for (const f of [...Object.values(ent), ...Object.values(tx)]) f.mockReset();
  ent.holdingCreate.mockImplementation(async (h: object) => ({ id: 'new-h', ...h }));
  ent.itxnCreate.mockImplementation(async (t: object) => ({ id: 'new-i', ...t }));
  tx.create.mockImplementation(async (t: object) => ({ id: 'new-t', ...t }));
  tx.update.mockImplementation(async (id: string, p: object) => ({ ...txn({ id }), ...p }));
});

describe('recordBuy', () => {
  it('creates the holding from the catalog, an invest_buy transaction and the investment txn', async () => {
    await recordBuy(buy({}), null);
    expect(ent.holdingCreate).toHaveBeenCalledWith({
      asset_type: 'bond', product_id: 'map-plusz', name: 'Magyar Állampapír Plusz (MÁP Plusz)',
      platform: 'mbh', currency: 'HUF', bond_rate_pct: 5,
    });
    expect(tx.create).toHaveBeenCalledWith(expect.objectContaining({
      account_id: 'mbh', kind: 'invest_buy', amount_minor: 10_000_000, currency: 'HUF', amount_huf_minor: 10_000_000,
      category_id: null, source: 'manual', needs_review: false, note: 'Magyar Állampapír Plusz (MÁP Plusz)', date: '2026-11-03',
    }));
    expect(ent.itxnCreate).toHaveBeenCalledWith({
      holding_id: 'new-h', side: 'buy', amount_huf_minor: 10_000_000, currency: 'HUF', date: '2026-11-03',
      account_id: 'mbh', transaction_id: 'new-t',
    });
  });

  it('reuses the holding for the same product and platform; EUR account stores EUR amount and HUF value', async () => {
    holdings.push({ ...holding });
    await recordBuy(buy({ productId: 'vanguard-ftse-all-world-acc', platform: 'revolut', accountId: 'rev', amountMinor: 10_000, quantity: 0.1, price: 100 }), null);
    expect(ent.holdingCreate).not.toHaveBeenCalled();
    expect(tx.create).toHaveBeenCalledWith(expect.objectContaining({ amount_minor: 10_000, currency: 'EUR', amount_huf_minor: 4_000_000 }));
    expect(ent.itxnCreate).toHaveBeenCalledWith(expect.objectContaining({ holding_id: 'h1', amount_huf_minor: 4_000_000, currency: 'EUR', quantity: 0.1, price: 100 }));
  });

  it('a non-bond holding gets the quote symbol and no bond rate; a bond keeps an entered rate', async () => {
    await recordBuy(buy({ productId: 'bitcoin', platform: 'revolut' }), null);
    expect(ent.holdingCreate).toHaveBeenLastCalledWith(expect.objectContaining({ ticker: 'BTC-EUR', asset_type: 'crypto' }));
    expect(ent.holdingCreate.mock.calls[0][0]).not.toHaveProperty('bond_rate_pct');
    await recordBuy(buy({ bondRatePct: 6.1 }), null);
    expect(ent.holdingCreate).toHaveBeenLastCalledWith(expect.objectContaining({ bond_rate_pct: 6.1 }));
  });

  it('links the SMS expense instead of creating a second debit', async () => {
    tx.get.mockResolvedValue(txn({}));
    await recordBuy(buy({}), 'sms-t');
    expect(tx.create).not.toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalledWith('sms-t', { kind: 'invest_buy', category_id: null, needs_review: false, note: 'Magyar Állampapír Plusz (MÁP Plusz)' });
    expect(ent.itxnCreate).toHaveBeenCalledWith(expect.objectContaining({ transaction_id: 'sms-t', amount_huf_minor: 10_000_000 }));
  });

  it('refuses a link that is not a matching expense on the account', async () => {
    tx.get.mockResolvedValue(txn({ amount_minor: 9_000_000 }));
    await expect(recordBuy(buy({}), 'sms-t')).rejects.toThrow();
    tx.get.mockResolvedValue(txn({ kind: 'invest_buy' }));
    await expect(recordBuy(buy({}), 'sms-t')).rejects.toThrow();
    expect(tx.update).not.toHaveBeenCalled();
    expect(ent.holdingCreate).not.toHaveBeenCalled();
  });

  it('rejects an invalid buy before writing anything', async () => {
    await expect(recordBuy(buy({ accountId: 'sav' }), null)).rejects.toThrow('Pay from a current account or cash');
    await expect(recordBuy(buy({ amountMinor: 0 }), null)).rejects.toThrow('Enter the amount you paid');
    expect(tx.create).not.toHaveBeenCalled();
    expect(ent.holdingCreate).not.toHaveBeenCalled();
  });

  it('undoes the created transaction and holding when the investment txn fails', async () => {
    ent.itxnCreate.mockRejectedValue(new Error('boom'));
    await expect(recordBuy(buy({}), null)).rejects.toThrow('boom');
    expect(tx.delete).toHaveBeenCalledWith('new-t');
    expect(ent.holdingDelete).toHaveBeenCalledWith('new-h');
  });

  it('reverts a linked SMS expense when the investment txn fails', async () => {
    tx.get.mockResolvedValue(txn({}));
    ent.itxnCreate.mockRejectedValue(new Error('boom'));
    await expect(recordBuy(buy({}), 'sms-t')).rejects.toThrow('boom');
    expect(tx.update).toHaveBeenLastCalledWith('sms-t', { kind: 'expense', category_id: 'cat-other', needs_review: true, note: 'MBH' });
    expect(tx.delete).not.toHaveBeenCalled();
  });
});

describe('recordSell', () => {
  it('books an invest_sell into the account and the sell txn', async () => {
    itxns.push({ ...itxn({ quantity: 2, price: 100 }) });
    await recordSell(holding, { amountMinor: 5_000, quantity: 1, price: 120, date: '2026-11-03', accountId: 'rev' });
    expect(tx.create).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'invest_sell', account_id: 'rev', amount_minor: 5_000, currency: 'EUR', amount_huf_minor: 2_000_000, note: 'VWCE',
    }));
    expect(ent.itxnCreate).toHaveBeenCalledWith(expect.objectContaining({ side: 'sell', amount_huf_minor: 2_000_000, quantity: 1, transaction_id: 'new-t' }));
  });

  it('checks a no-quantity sell against the HUF cost', async () => {
    itxns.push({ ...itxn({ amount_huf_minor: 3_000_000 }) });
    await expect(recordSell(holding, { amountMinor: 10_000, quantity: null, price: null, date: '2026-11-03', accountId: 'rev' })).rejects.toThrow(/at cost/);
    expect(tx.create).not.toHaveBeenCalled();
  });

  it('refuses a savings account and undoes the transaction when the sell txn fails', async () => {
    itxns.push({ ...itxn({ quantity: 2 }) });
    await expect(recordSell(holding, { amountMinor: 5_000, quantity: 1, price: null, date: '2026-11-03', accountId: 'sav' })).rejects.toThrow();
    ent.itxnCreate.mockRejectedValue(new Error('boom'));
    await expect(recordSell(holding, { amountMinor: 5_000, quantity: 1, price: null, date: '2026-11-03', accountId: 'mbh' })).rejects.toThrow('boom');
    expect(tx.delete).toHaveBeenCalledWith('new-t');
  });
});

describe('deleteInvestmentTxn', () => {
  it('deletes a manual transaction, the row and the now-empty holding', async () => {
    tx.get.mockResolvedValue(txn({ id: 't1', kind: 'invest_buy', source: 'manual', sms_message_id: null }));
    await deleteInvestmentTxn(itxn({}));
    expect(tx.delete).toHaveBeenCalledWith('t1');
    expect(ent.itxnDelete).toHaveBeenCalledWith('i1');
    expect(ent.holdingDelete).toHaveBeenCalledWith('h1');
  });

  it('reverts an SMS transaction to an expense awaiting review and keeps a holding with other txns', async () => {
    tx.get.mockResolvedValue(txn({ id: 't1', kind: 'invest_buy' }));
    itxns.push({ ...itxn({ id: 'i2' }) });
    await deleteInvestmentTxn(itxn({}));
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalledWith('t1', { kind: 'expense', needs_review: true });
    expect(ent.itxnDelete).toHaveBeenCalledWith('i1');
    expect(ent.holdingDelete).not.toHaveBeenCalled();
  });

  it('on retry leaves an already reverted or missing transaction alone', async () => {
    tx.get.mockResolvedValue(txn({ id: 't1', kind: 'expense' }));
    await deleteInvestmentTxn(itxn({}));
    tx.get.mockResolvedValue(null);
    await deleteInvestmentTxn(itxn({}));
    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(ent.itxnDelete).toHaveBeenCalledTimes(2);
  });
});
