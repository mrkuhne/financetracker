import { describe, expect, it } from 'vitest';
import { planAccountSave, type AccountDraft } from './accountRules';
import type { Account } from '@/domain/types';

const acc = (o: Partial<Account> & { id: string }): Account => ({
  name: o.id, type: 'checking', currency: 'HUF', opening_balance_minor: 0,
  is_default: false, is_savings_target: false, archived: false, ...o,
});
const draft = (o: Partial<AccountDraft>): AccountDraft => ({
  name: 'X', type: 'checking', currency: 'HUF', opening_balance_minor: 0,
  is_default: false, is_savings_target: false, archived: false, ...o,
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
});
