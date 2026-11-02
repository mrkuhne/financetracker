import type { Category } from '@/data/categories';
import { addMonths, lastDay, monthOf } from '@/domain/dates';
import type { Account, ISODate, PurchaseOption, PurchasePlan, RecurringRule, Txn } from '@/domain/types';

/** The default account if it is an active HUF one, else the first active HUF account. */
export function pickPurchaseAccount(accounts: Account[]): Account | null {
  const huf = accounts.filter((a) => a.currency === 'HUF' && !a.archived);
  return huf.find((a) => a.is_default) ?? huf[0] ?? null;
}

export type PurchaseRecord =
  | { kind: 'txn'; txn: Omit<Txn, 'id'> }
  | { kind: 'rule'; rule: Omit<RecurringRule, 'id'> }
  | { kind: 'error'; reason: 'already_recorded' | 'no_account' };

/** What to write when a plan is marked bought: an expense, or a monthly rule for installments. */
export function planPurchaseRecord(i: {
  plan: PurchasePlan; option: PurchaseOption; accounts: Account[]; categories: Category[]; today: ISODate;
}): PurchaseRecord {
  const { plan, option, today } = i;
  if (plan.status === 'bought' || plan.transaction_id || plan.recurring_rule_id) return { kind: 'error', reason: 'already_recorded' };
  const account = pickPurchaseAccount(i.accounts);
  if (!account) return { kind: 'error', reason: 'no_account' };
  const category_id = i.categories.find((c) => c.kind === 'expense' && c.name === 'Shopping')?.id ?? null;
  const name = `${plan.title} · ${option.name}`;

  if (option.payment === 'installments') {
    const amount = option.installment_minor ?? 0;
    const count = option.installment_count ?? 1;
    return {
      kind: 'rule',
      rule: {
        name, kind: 'expense', amount_minor: amount, currency: 'HUF', amount_huf_minor: amount, category_id,
        account_id: account.id, frequency: 'monthly', start_date: today,
        end_date: lastDay(addMonths(monthOf(today), count - 1)), last_materialized_date: null, active: true,
      },
    };
  }
  return {
    kind: 'txn',
    txn: {
      account_id: account.id, kind: 'expense', amount_minor: option.price_minor, currency: 'HUF',
      amount_huf_minor: option.price_minor, category_id, date: today, note: name, source: 'manual',
      needs_review: false, recurring_rule_id: null, transfer_pair_id: null, sms_message_id: null,
    },
  };
}
