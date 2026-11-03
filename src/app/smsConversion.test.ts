import { describe, expect, it } from 'vitest';
import type { Account, Txn } from '@/domain/types';
import type { Category } from '@/data/categories';
import type { SmsMessageRow } from '@/data/smsMessages';
import { dedupePending, matchInvestTxnForSms, pickSmsAccount, planSmsTxn } from './smsConversion';

const acct = (o: Partial<Account>): Account => ({
  id: 'a1', name: 'Account', type: 'checking', currency: 'HUF', opening_balance_minor: 0,
  is_default: false, is_savings_target: false, archived: false, sms_sender: null, ...o,
});
const msg = (o: Partial<SmsMessageRow>): SmsMessageRow => ({
  id: 'sms1', owner_id: 'u1', sender: 'MBH Bank', text: null, text_hash: 'h', received_at: '2026-11-11T10:00:00Z',
  status: 'parsed', reason: null, kind: 'expense', amount_minor: 1000, currency: 'HUF', merchant: null,
  date: '2026-11-11', category_name: null, transaction_id: null, ...o,
});
const cats: Category[] = [
  { id: 'cat-groceries', name: 'Groceries', kind: 'expense', icon: 'x', monthly_budget_minor: null },
  { id: 'cat-transport', name: 'Transport', kind: 'expense', icon: 'x', monthly_budget_minor: null },
  { id: 'cat-other-in', name: 'Other', kind: 'income', icon: 'x', monthly_budget_minor: null },
  { id: 'cat-other-out', name: 'Other', kind: 'expense', icon: 'x', monthly_budget_minor: null },
];

describe('smsConversion', () => {
  it('pickSmsAccount: sms_sender match beats default; archived never chosen', () => {
    expect(pickSmsAccount('MBH Bank', [acct({ id: 'rev', is_default: true }), acct({ id: 'mbh', sms_sender: ' mbh bank ' })])?.id).toBe('mbh');
    expect(pickSmsAccount('MBH Bank', [acct({ id: 'old', sms_sender: 'MBH Bank', archived: true }), acct({ id: 'def', is_default: true })])?.id).toBe('def');
    expect(pickSmsAccount('X', [])).toBeNull();
  });
  it('planSmsTxn: HUF expense on HUF account', () => {
    const t = planSmsTxn(msg({ amount_minor: 1_550_000, currency: 'HUF', merchant: 'MOL', category_name: 'transport', date: '2026-11-11' }), acct({ id: 'mbh', currency: 'HUF' }), cats, { msg: 1, account: 1 });
    expect(t).toMatchObject({ account_id: 'mbh', kind: 'expense', amount_minor: 1_550_000, currency: 'HUF', amount_huf_minor: 1_550_000, category_id: 'cat-transport', date: '2026-11-11', note: 'MOL', source: 'sms', needs_review: true, sms_message_id: 'sms1' });
  });
  it('planSmsTxn: EUR purchase on HUF account converts and keeps the original in the note', () => {
    const t = planSmsTxn(msg({ amount_minor: 1250, currency: 'EUR', merchant: 'Bistro' }), acct({ currency: 'HUF' }), cats, { msg: 400, account: 1 });
    expect(t.amount_minor).toBe(500_000);
    expect(t.currency).toBe('HUF');
    expect(t.amount_huf_minor).toBe(500_000);
    expect(t.note).toMatch(/^Bistro · .*12[.,]50/);
  });
  it('planSmsTxn: unknown category → null, missing merchant → empty note', () => {
    const t = planSmsTxn(msg({ category_name: null, merchant: null }), acct({}), cats, { msg: 1, account: 1 });
    expect(t.category_id).toBeNull();
    expect(t.note ?? '').toBe('');
  });
  it('planSmsTxn: converted with no merchant has no leading separator', () => {
    const t = planSmsTxn(msg({ amount_minor: 1250, currency: 'EUR', merchant: null }), acct({ currency: 'HUF' }), cats, { msg: 400, account: 1 });
    expect(t.note).toMatch(/^12[.,]50/);
  });
  it('planSmsTxn: category matched by name and kind', () => {
    expect(planSmsTxn(msg({ kind: 'expense', category_name: 'Other' }), acct({}), cats, { msg: 1, account: 1 }).category_id).toBe('cat-other-out');
    expect(planSmsTxn(msg({ kind: 'income', category_name: 'other' }), acct({}), cats, { msg: 1, account: 1 }).category_id).toBe('cat-other-in');
    expect(planSmsTxn(msg({ kind: 'income', category_name: 'Groceries' }), acct({}), cats, { msg: 1, account: 1 }).category_id).toBeNull();
  });
  it('dedupePending: keeps the oldest per hash, flags in-batch and already-converted duplicates', () => {
    const a = msg({ id: 'a', text_hash: 'h1', received_at: '2026-11-11T10:00:05Z', created_date: '2026-11-11T10:00:06Z' });
    const b = msg({ id: 'b', text_hash: 'h1', received_at: '2026-11-11T10:00:00Z', created_date: '2026-11-11T10:00:09Z' });
    const c = msg({ id: 'c', text_hash: 'h1', received_at: '2026-11-11T10:00:00Z', created_date: '2026-11-11T10:00:07Z' });
    const d = msg({ id: 'd', text_hash: 'h2' });
    const e = msg({ id: 'e', text_hash: 'h3' });
    const f = msg({ id: 'f', text_hash: 'h3' });
    const { convert, duplicates } = dedupePending([a, b, c, d, e, f], new Set(['h3']));
    expect(convert.map((m) => m.id)).toEqual(['c', 'd']);
    expect(duplicates.map((x) => [x.msg.id, x.of?.id ?? null])).toEqual([
      ['a', 'c'],
      ['b', 'c'],
      ['e', null],
      ['f', null],
    ]);
  });
  it('dedupePending: nothing to dedupe passes everything through', () => {
    const { convert, duplicates } = dedupePending([msg({ id: 'x', text_hash: 'h1' }), msg({ id: 'y', text_hash: 'h2' })], new Set());
    expect(convert.map((m) => m.id)).toEqual(['x', 'y']);
    expect(duplicates).toEqual([]);
  });
  describe('matchInvestTxnForSms', () => {
    const planned = planSmsTxn(msg({ amount_minor: 10_000_000, date: '2026-11-05' }), acct({ id: 'mbh' }), cats, { msg: 1, account: 1 });
    const buy = (o: Partial<Txn>): Txn => ({
      id: 'b1', account_id: 'mbh', kind: 'invest_buy', amount_minor: 10_000_000, currency: 'HUF', amount_huf_minor: 10_000_000,
      category_id: null, date: '2026-11-03', note: 'MÁP Plusz', source: 'manual', needs_review: false, recurring_rule_id: null,
      transfer_pair_id: null, sms_message_id: null, ...o,
    });
    it('returns an unlinked invest_buy on the same account and amount within ±3 days', () => {
      expect(matchInvestTxnForSms(planned, [buy({ date: '2026-11-02' })])?.id).toBe('b1');
      expect(matchInvestTxnForSms(planned, [buy({ date: '2026-11-08' })])?.id).toBe('b1');
    });
    it('prefers the closest date', () => {
      expect(matchInvestTxnForSms(planned, [buy({ id: 'far', date: '2026-11-02' }), buy({ id: 'near', date: '2026-11-05' })])?.id).toBe('near');
    });
    it('null for a planned income, a linked buy, another account, another amount, day ±4 or a non-buy', () => {
      expect(matchInvestTxnForSms({ ...planned, kind: 'income' }, [buy({})])).toBeNull();
      expect(matchInvestTxnForSms(planned, [buy({ sms_message_id: 'sms0' })])).toBeNull();
      expect(matchInvestTxnForSms(planned, [buy({ account_id: 'rev' })])).toBeNull();
      expect(matchInvestTxnForSms(planned, [buy({ amount_minor: 10_000_100 })])).toBeNull();
      expect(matchInvestTxnForSms(planned, [buy({ date: '2026-11-01' })])).toBeNull();
      expect(matchInvestTxnForSms(planned, [buy({ date: '2026-11-09' })])).toBeNull();
      expect(matchInvestTxnForSms(planned, [buy({ kind: 'expense' })])).toBeNull();
      expect(matchInvestTxnForSms(planned, [buy({ kind: 'invest_sell' })])).toBeNull();
    });
  });
});
