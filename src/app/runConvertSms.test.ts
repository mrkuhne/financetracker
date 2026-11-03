import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account, InvestmentTxn, Txn } from '@/domain/types';

let store: Txn[] = [];
const itxns: Record<string, unknown>[] = [];
const created = vi.fn();
const converted = vi.fn();
vi.mock('@/data/client', () => ({
  base44: {
    entities: {
      Holding: { list: async () => [], delete: async () => undefined },
      InvestmentTransaction: { list: async () => itxns, delete: async () => undefined },
    },
  },
}));
vi.mock('@/data/transactions', () => ({
  listTransactions: async () => store,
  listTransactionsBySmsIds: async () => [],
  getTransaction: async (id: string) => store.find((t) => t.id === id) ?? null,
  createTransaction: (...a: unknown[]) => created(...a),
  deleteTransaction: async () => undefined,
  updateTransaction: async (id: string, patch: Partial<Txn>) => {
    store = store.map((t) => (t.id === id ? { ...t, ...patch } : t));
    return store.find((t) => t.id === id);
  },
}));
vi.mock('@/data/smsMessages', () => ({
  markSmsConverted: (...a: unknown[]) => converted(...a),
  listPendingSms: async () => [],
  listConvertedSmsByHashes: async () => [],
}));

import { linkSmsToInvestBuy } from './runConvertSms';
import { deleteInvestmentTxn } from '@/data/investments';
import { findSmsCandidates } from '@/features/invest/record';

const account: Account = {
  id: 'mbh', name: 'MBH', type: 'checking', currency: 'HUF', opening_balance_minor: 0,
  is_default: true, is_savings_target: false, archived: false, sms_sender: 'MBH Bank',
};
const manualBuy: Txn = {
  id: 'buy-t', account_id: 'mbh', kind: 'invest_buy', amount_minor: 10_000_000, currency: 'HUF', amount_huf_minor: 10_000_000,
  category_id: null, date: '2026-11-03', note: 'MÁP Plusz', source: 'manual', needs_review: false, recurring_rule_id: null,
  transfer_pair_id: null,
};
const planned: Omit<Txn, 'id'> = {
  ...manualBuy, kind: 'expense', category_id: 'cat-other', date: '2026-11-04', note: 'MBH', source: 'sms', needs_review: true,
};
const itxn: InvestmentTxn = {
  id: 'i1', holding_id: 'h1', side: 'buy', amount_huf_minor: 10_000_000, quantity: null, price: null,
  currency: 'HUF', date: '2026-11-03', account_id: 'mbh', transaction_id: 'buy-t',
};

beforeEach(() => {
  store = [{ ...manualBuy }];
  created.mockReset();
  converted.mockReset();
});

describe('linkSmsToInvestBuy', () => {
  it('links a late SMS to the manual buy, making it SMS-sourced, without a new transaction', async () => {
    expect(await linkSmsToInvestBuy('sms1', planned)).toBe('buy-t');
    expect(store[0]).toMatchObject({ id: 'buy-t', kind: 'invest_buy', sms_message_id: 'sms1', source: 'sms' });
    expect(converted).toHaveBeenCalledWith('sms1', 'buy-t');
    expect(created).not.toHaveBeenCalled();
  });

  it('returns null and writes nothing when no buy matches', async () => {
    expect(await linkSmsToInvestBuy('sms1', { ...planned, amount_minor: 9_000_000 })).toBeNull();
    expect(store[0].sms_message_id).toBeUndefined();
    expect(converted).not.toHaveBeenCalled();
  });

  it('after the buy is deleted, the reverted expense is offered when the buy is recorded again', async () => {
    await linkSmsToInvestBuy('sms1', planned);
    await deleteInvestmentTxn(itxn);
    expect(store[0]).toMatchObject({ kind: 'expense', needs_review: true });
    const offered = findSmsCandidates({ accountId: 'mbh', amountMinor: 10_000_000, date: '2026-11-03' }, store, [account]);
    expect(offered.map((t) => t.id)).toEqual(['buy-t']);
  });
});
