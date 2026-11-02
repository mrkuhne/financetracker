import { describe, expect, test } from 'vitest';
import type { Category } from '@/data/categories';
import type { Account, PurchaseOption, PurchasePlan } from '@/domain/types';
import { pickPurchaseAccount, planPurchaseRecord } from './purchaseRecord';

const plan: PurchasePlan = {
  id: 'p1', title: 'Couch', needed_by: null, status: 'decided', selected_option_id: 'o1', planned_month: '2026-11',
  transaction_id: null, recurring_rule_id: null, advice: null,
};
const acct = (o: Partial<Account>): Account => ({
  id: 'a', name: 'Acct', type: 'checking', currency: 'HUF', opening_balance_minor: 0, is_default: false,
  is_savings_target: false, archived: false, sms_sender: null, ...o,
});
const eurDefault = acct({ id: 'eur', currency: 'EUR', is_default: true });
const hufMain = acct({ id: 'huf-main', is_default: true });
const hufOther = acct({ id: 'huf-other' });
const shopping: Category = { id: 'c-shop', name: 'Shopping', kind: 'expense', icon: 'bag', monthly_budget_minor: null };
const oneTime = (price: number): PurchaseOption => ({
  id: 'o1', plan_id: 'p1', name: 'JYSK Karlstrup corner', price_minor: price, currency: 'HUF', payment: 'one_time',
  installment_minor: null, installment_count: null, link: null, note: null, position: 0,
});
const installments = (m: number, n: number): PurchaseOption => ({
  ...oneTime(m * n), payment: 'installments', installment_minor: m, installment_count: n,
});

describe('planPurchaseRecord', () => {
  test('one-time becomes an expense on the default HUF account', () => {
    const r = planPurchaseRecord({ plan, option: oneTime(32_000_000), accounts: [eurDefault, hufMain], categories: [shopping], today: '2026-11-12' });
    expect(r).toEqual({ kind: 'txn', txn: expect.objectContaining({ account_id: hufMain.id, kind: 'expense', amount_minor: 32_000_000, amount_huf_minor: 32_000_000, category_id: shopping.id, date: '2026-11-12', note: 'Couch · JYSK Karlstrup corner', source: 'manual', needs_review: false }) });
  });
  test('installments become a monthly rule ending after the last payment', () => {
    const r = planPurchaseRecord({ plan, option: installments(3_000_000, 12), accounts: [hufMain], categories: [], today: '2026-11-12' });
    expect(r).toEqual({ kind: 'rule', rule: expect.objectContaining({ amount_minor: 3_000_000, frequency: 'monthly', start_date: '2026-11-12', end_date: '2027-10-31', category_id: null, active: true, last_materialized_date: null }) });
  });
  test('already bought', () => expect(planPurchaseRecord({ plan: { ...plan, transaction_id: 't1' }, option: oneTime(1), accounts: [hufMain], categories: [], today: '2026-11-12' })).toEqual({ kind: 'error', reason: 'already_recorded' }));
  test('no HUF account', () => expect(planPurchaseRecord({ plan, option: oneTime(1), accounts: [eurDefault], categories: [], today: '2026-11-12' })).toEqual({ kind: 'error', reason: 'no_account' }));
});

describe('pickPurchaseAccount', () => {
  test('archived default is skipped', () => expect(pickPurchaseAccount([{ ...hufMain, is_default: true, archived: true }, hufOther])?.id).toBe(hufOther.id));
  test('non-HUF default is skipped', () => expect(pickPurchaseAccount([eurDefault, hufOther])?.id).toBe(hufOther.id));
});
