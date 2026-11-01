import { dueOccurrences } from '@/domain/recurrence';
import { toHufMinor } from '@/domain/money';
import type { ISODate, RecurringRule, Txn } from '@/domain/types';

export interface MaterializeDeps {
  listRules: () => Promise<RecurringRule[]>;
  listTransactions: (range: { from: ISODate; to: ISODate }) => Promise<Txn[]>;
  createTransaction: (t: Omit<Txn, 'id'>) => Promise<Txn>;
  updateRule: (id: string, patch: Partial<Omit<RecurringRule, 'id'>>) => Promise<RecurringRule>;
  getHufPerUnit: (currency: string, date: ISODate) => Promise<number>;
}

/** Creates the transactions that are due for every active rule. Idempotent. Returns how many were created. */
export async function materializeRecurring(today: ISODate, deps: MaterializeDeps): Promise<number> {
  let created = 0;
  for (const rule of await deps.listRules()) {
    const due = dueOccurrences(rule, today);
    if (due.length === 0) continue;
    const existing = await deps.listTransactions({ from: due[0], to: due[due.length - 1] });
    const have = new Set(existing.filter((t) => t.recurring_rule_id === rule.id).map((t) => t.date));
    for (const date of due) {
      if (have.has(date)) continue;
      const rate = await deps.getHufPerUnit(rule.currency, date);
      await deps.createTransaction({
        account_id: rule.account_id,
        kind: rule.kind,
        amount_minor: rule.amount_minor,
        currency: rule.currency,
        amount_huf_minor: toHufMinor(rule.amount_minor, rate),
        category_id: rule.category_id,
        date,
        source: 'recurring',
        needs_review: false,
        recurring_rule_id: rule.id,
        transfer_pair_id: null,
      });
      created++;
    }
    await deps.updateRule(rule.id, { last_materialized_date: due[due.length - 1] });
  }
  return created;
}

let inflight: Promise<number> | null = null;

/** Single-flight wrapper: overlapping callers share one run. */
export function materializeSingleFlight(today: ISODate, deps: MaterializeDeps): Promise<number> {
  inflight ??= materializeRecurring(today, deps).finally(() => {
    inflight = null;
  });
  return inflight;
}
