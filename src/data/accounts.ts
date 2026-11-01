import { base44 } from '@/data/client';
import type { Account } from '@/domain/types';
import { pick, stripNulls } from '@/data/records';

const KEYS = ['name', 'type', 'currency', 'opening_balance_minor', 'is_default', 'is_savings_target', 'archived'];
const toAccount = (r: Record<string, unknown>): Account => ({
  ...pick<Account>(r, KEYS),
  is_default: !!r.is_default,
  is_savings_target: !!r.is_savings_target,
  archived: !!r.archived,
});

export async function listAccounts(): Promise<Account[]> {
  return (await base44.entities.Account.list()).map(toAccount);
}
export async function createAccount(a: Omit<Account, 'id'>): Promise<Account> {
  return toAccount(await base44.entities.Account.create(stripNulls(a)));
}
export async function updateAccount(id: string, patch: Partial<Omit<Account, 'id'>>): Promise<Account> {
  return toAccount(await base44.entities.Account.update(id, patch));
}
