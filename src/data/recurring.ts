import { base44 } from '@/data/client';
import type { RecurringRule } from '@/domain/types';
import { pick, stripNulls } from '@/data/records';

const KEYS = [
  'name', 'kind', 'amount_minor', 'currency', 'amount_huf_minor', 'category_id', 'account_id',
  'frequency', 'start_date', 'end_date', 'last_materialized_date', 'active',
];
const NULLABLE = ['category_id', 'end_date', 'last_materialized_date'];
const toRule = (r: Record<string, unknown>): RecurringRule => ({
  ...pick<RecurringRule>(r, KEYS, NULLABLE),
  active: r.active !== false,
});

export async function listRules(): Promise<RecurringRule[]> {
  return (await base44.entities.RecurringRule.list()).map(toRule);
}
export async function createRule(r: Omit<RecurringRule, 'id'>): Promise<RecurringRule> {
  return toRule(await base44.entities.RecurringRule.create(stripNulls(r)));
}
export async function updateRule(id: string, patch: Partial<Omit<RecurringRule, 'id'>>): Promise<RecurringRule> {
  return toRule(await base44.entities.RecurringRule.update(id, patch));
}
export async function deleteRule(id: string): Promise<void> {
  await base44.entities.RecurringRule.delete(id);
}
