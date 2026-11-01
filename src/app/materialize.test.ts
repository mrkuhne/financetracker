import { describe, expect, it } from 'vitest';
import type { RecurringRule, Txn } from '@/domain/types';
import { materializeRecurring, type MaterializeDeps } from './materialize';

const salary = (over: Partial<RecurringRule> = {}): RecurringRule => ({
  id: 'r1', name: 'Salary', kind: 'income', amount_minor: 100000, currency: 'EUR', amount_huf_minor: 40000000,
  category_id: 'c1', account_id: 'a1', frequency: 'monthly', start_date: '2026-09-10', end_date: null,
  last_materialized_date: null, active: true, ...over,
});

function fakes(rules: RecurringRule[], txns: Txn[] = []) {
  const store = { rules, txns };
  const deps: MaterializeDeps = {
    listRules: async () => store.rules,
    listTransactions: async ({ from, to }) => store.txns.filter((t) => t.date >= from && t.date <= to),
    createTransaction: async (t) => {
      const created = { ...t, id: `t${store.txns.length + 1}` };
      store.txns.push(created);
      return created;
    },
    updateRule: async (id, patch) => {
      store.rules = store.rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
      return store.rules.find((r) => r.id === id)!;
    },
    getHufPerUnit: async () => 400,
  };
  return { store, deps };
}

describe('materializeRecurring', () => {
  it('creates all missing occurrences once and is idempotent', async () => {
    const { store, deps } = fakes([salary()]);
    expect(await materializeRecurring('2026-11-12', deps)).toBe(3);
    expect(store.txns.map((t) => t.date)).toEqual(['2026-09-10', '2026-10-10', '2026-11-10']);
    expect(store.rules[0].last_materialized_date).toBe('2026-11-10');
    expect(store.txns[0]).toMatchObject({
      kind: 'income', amount_minor: 100000, currency: 'EUR', amount_huf_minor: 40000000, category_id: 'c1',
      account_id: 'a1', source: 'recurring', needs_review: false, recurring_rule_id: 'r1', transfer_pair_id: null,
    });
    expect(await materializeRecurring('2026-11-12', deps)).toBe(0);
    expect(store.txns).toHaveLength(3);
  });

  it('skips a date that already has a txn from another tab but still advances', async () => {
    const existing: Txn = { ...({} as Txn), id: 'x', account_id: 'a1', kind: 'income', amount_minor: 1, currency: 'EUR', amount_huf_minor: 1, category_id: null, date: '2026-10-10', source: 'recurring', needs_review: false, recurring_rule_id: 'r1', transfer_pair_id: null };
    const { store, deps } = fakes([salary()], [existing]);
    expect(await materializeRecurring('2026-11-12', deps)).toBe(2);
    expect(store.txns).toHaveLength(3);
    expect(store.rules[0].last_materialized_date).toBe('2026-11-10');
  });

  it('ignores inactive rules and rules with nothing due', async () => {
    const { store, deps } = fakes([salary({ active: false }), salary({ id: 'r2', start_date: '2026-12-01' })]);
    expect(await materializeRecurring('2026-11-12', deps)).toBe(0);
    expect(store.txns).toHaveLength(0);
  });
});
