import { describe, expect, it } from 'vitest';
import { healAccounts, planAccountSave, type AccountDraft } from './accountRules';
import type { Account } from '@/domain/types';

const acc = (o: Partial<Account> & { id: string }): Account => ({
  name: o.id, type: 'checking', currency: 'HUF', opening_balance_minor: 0,
  is_default: false, is_savings_target: false, archived: false, sms_sender: null, ...o,
});
const draft = (o: Partial<AccountDraft>): AccountDraft => ({
  name: 'X', type: 'checking', currency: 'HUF', opening_balance_minor: 0,
  is_default: false, is_savings_target: false, archived: false, sms_sender: null, ...o,
});

describe('planAccountSave', () => {
  it('first account becomes default', () => {
    expect(planAccountSave([], draft({})).saved.is_default).toBe(true);
  });
  it('new default clears the old default', () => {
    const r = planAccountSave([acc({ id: 'a', is_default: true })], draft({ is_default: true }));
    expect(r.saved.is_default).toBe(true);
    expect(r.patches).toEqual([{ id: 'a', patch: { is_default: false } }]);
  });
  it('non-default save keeps the existing default', () => {
    const r = planAccountSave([acc({ id: 'a', is_default: true })], draft({}));
    expect(r.saved.is_default).toBe(false);
    expect(r.patches).toEqual([]);
  });
  it('unticking the only default keeps it default', () => {
    expect(planAccountSave([acc({ id: 'a' })], draft({ is_default: false })).saved.is_default).toBe(true);
  });
  it('first savings account gets the savings target', () => {
    expect(planAccountSave([acc({ id: 'a', is_default: true })], draft({ type: 'savings' })).saved.is_savings_target).toBe(true);
  });
  it('second savings account does not take the target', () => {
    const r = planAccountSave([acc({ id: 's', type: 'savings', is_savings_target: true })], draft({ type: 'savings' }));
    expect(r.saved.is_savings_target).toBe(false);
    expect(r.patches).toEqual([]);
  });
  it('moving the target clears the old one', () => {
    const r = planAccountSave([acc({ id: 's', type: 'savings', is_savings_target: true })], draft({ type: 'savings', is_savings_target: true }));
    expect(r.saved.is_savings_target).toBe(true);
    expect(r.patches).toEqual([{ id: 's', patch: { is_savings_target: false } }]);
  });
  it('non-savings account never holds the target', () => {
    expect(planAccountSave([], draft({ type: 'checking', is_savings_target: true })).saved.is_savings_target).toBe(false);
  });
  it('changing the target away from savings promotes another savings account', () => {
    const r = planAccountSave([acc({ id: 's2', type: 'savings' })], draft({ id: 's1', type: 'checking' }));
    expect(r.patches).toEqual([{ id: 's2', patch: { is_savings_target: true } }]);
  });
  it('a lone savings account stays target when edited', () => {
    expect(planAccountSave([], draft({ id: 's', type: 'savings', is_savings_target: false })).saved.is_savings_target).toBe(true);
  });

  it('archiving the default promotes the first non-archived account', () => {
    const r = planAccountSave([acc({ id: 'x', archived: true }), acc({ id: 'b' })], draft({ id: 'a', is_default: true, archived: true }));
    expect(r.saved.is_default).toBe(false);
    expect(r.patches).toEqual([{ id: 'b', patch: { is_default: true } }]);
  });
  it('archiving the savings target promotes another active savings account', () => {
    const r = planAccountSave(
      [acc({ id: 'c', is_default: true }), acc({ id: 's2', type: 'savings' })],
      draft({ id: 's1', type: 'savings', is_savings_target: true, archived: true }),
    );
    expect(r.saved.is_savings_target).toBe(false);
    expect(r.patches).toEqual([{ id: 's2', patch: { is_savings_target: true } }]);
  });
  it('archiving the only active account is refused', () => {
    const r = planAccountSave([acc({ id: 'x', archived: true })], draft({ id: 'a', archived: true }));
    expect(r.error).toMatch(/not archived/);
  });
  it('archiving a non-default account changes nothing else', () => {
    const r = planAccountSave([acc({ id: 'a', is_default: true })], draft({ id: 'b', archived: true }));
    expect(r.patches).toEqual([]);
    expect(r.error).toBeUndefined();
  });
});

describe('healAccounts', () => {
  it('keeps the first default and target, clears the rest', () => {
    const r = healAccounts([
      acc({ id: 'a', is_default: true }),
      acc({ id: 'b', is_default: true, type: 'savings', is_savings_target: true }),
      acc({ id: 'c', type: 'savings', is_savings_target: true }),
    ]);
    expect(r).toEqual([
      { id: 'b', patch: { is_default: false } },
      { id: 'c', patch: { is_savings_target: false } },
    ]);
  });
  it('does nothing when consistent', () => {
    expect(healAccounts([acc({ id: 'a', is_default: true })])).toEqual([]);
  });
});
