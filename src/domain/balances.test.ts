import { describe, expect, it } from 'vitest';
import { accountBalanceMinor } from './balances';
import type { Account, Txn } from './types';

const acct = (o: Partial<Account> = {}): Account => ({
  id: 'a1', name: 'Main', type: 'checking', currency: 'HUF', opening_balance_minor: 0,
  is_default: true, is_savings_target: false, archived: false, ...o,
});
const mk = (kind: Txn['kind'], amount: number, o: Partial<Txn> = {}): Txn => ({
  id: 't', account_id: 'a1', kind, amount_minor: amount, currency: 'HUF', amount_huf_minor: amount,
  category_id: null, date: '2026-11-05', source: 'manual', needs_review: false,
  recurring_rule_id: null, transfer_pair_id: null, ...o,
});

describe('accountBalanceMinor', () => {
  it('opening + income - expense - transfer_out', () => {
    expect(accountBalanceMinor(acct({ opening_balance_minor: 100_000_00 }),
      [mk('income', 600_000_00), mk('expense', 200_000_00), mk('transfer_out', 50_000_00)])).toBe(450_000_00);
  });
  it('adds transfer_in', () => {
    expect(accountBalanceMinor(acct(), [mk('transfer_in', 70)])).toBe(70);
  });
  it('ignores other accounts', () => {
    expect(accountBalanceMinor(acct(), [mk('income', 999, { account_id: 'a2' })])).toBe(0);
  });
  it('uses account currency amount, not HUF', () => {
    expect(accountBalanceMinor(acct({ currency: 'EUR' }),
      [mk('income', 100, { currency: 'EUR', amount_huf_minor: 40_000 })])).toBe(100);
  });
});
