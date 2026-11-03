import type { Account, Txn } from './types';

export interface AccountBalance {
  balanceMinor: number;
  /** Txns left out because their currency differs from a non-HUF account's and cannot be valued in it. */
  skippedCount: number;
}

/**
 * Balance in the account's currency (minor units). Normally uses `amount_minor`.
 * A txn whose currency differs from the account's (legacy data; the forms now lock the currency
 * to the account) is counted at `amount_huf_minor` when the account is HUF, and otherwise skipped
 * and reported in `skippedCount` rather than mixing currencies.
 */
export function accountBalance(account: Account, txns: Txn[]): AccountBalance {
  let balanceMinor = account.opening_balance_minor;
  let skippedCount = 0;
  for (const t of txns) {
    if (t.account_id !== account.id) continue;
    let amount = t.amount_minor;
    if (t.currency !== account.currency) {
      if (account.currency !== 'HUF') {
        skippedCount++;
        continue;
      }
      amount = t.amount_huf_minor;
    }
    if (t.kind === 'income' || t.kind === 'transfer_in' || t.kind === 'invest_sell') balanceMinor += amount;
    else balanceMinor -= amount;
  }
  return { balanceMinor, skippedCount };
}

export function accountBalanceMinor(account: Account, txns: Txn[]): number {
  return accountBalance(account, txns).balanceMinor;
}
