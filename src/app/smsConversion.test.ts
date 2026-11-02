import { describe, expect, it } from 'vitest';
import type { Account } from '@/domain/types';
import type { Category } from '@/data/categories';
import type { SmsMessageRow } from '@/data/smsMessages';
import { pickSmsAccount, planSmsTxn } from './smsConversion';

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
});
