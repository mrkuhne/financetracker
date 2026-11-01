import type { Account, Txn } from './types';

export function accountBalanceMinor(account: Account, txns: Txn[]): number {
  let balance = account.opening_balance_minor;
  for (const t of txns) {
    if (t.account_id !== account.id) continue;
    if (t.kind === 'income' || t.kind === 'transfer_in') balance += t.amount_minor;
    else balance -= t.amount_minor;
  }
  return balance;
}
