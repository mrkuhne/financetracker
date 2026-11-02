import { base44 } from '@/data/client';
import type { PurchaseOption, PurchasePlan } from '@/domain/types';
import { pick, stripNulls } from '@/data/records';

const PLAN_KEYS = [
  'title', 'needed_by', 'status', 'selected_option_id', 'planned_month', 'transaction_id', 'recurring_rule_id', 'advice',
];
const PLAN_NULLABLE = ['needed_by', 'selected_option_id', 'planned_month', 'transaction_id', 'recurring_rule_id', 'advice'];
const toPlan = (r: Record<string, unknown>): PurchasePlan => {
  const p = pick<PurchasePlan>(r, PLAN_KEYS, PLAN_NULLABLE);
  return { ...p, status: p.status ?? 'considering' };
};

const OPTION_KEYS = [
  'plan_id', 'name', 'price_minor', 'currency', 'payment', 'installment_minor', 'installment_count', 'link', 'note', 'position',
];
const OPTION_NULLABLE = ['installment_minor', 'installment_count', 'link', 'note'];
const toOption = (r: Record<string, unknown>): PurchaseOption => {
  const o = pick<PurchaseOption>(r, OPTION_KEYS, OPTION_NULLABLE);
  return { ...o, position: o.position ?? 0 };
};

export async function listPlans(): Promise<PurchasePlan[]> {
  return (await base44.entities.PurchasePlan.list()).map(toPlan);
}
export async function getPlan(id: string): Promise<PurchasePlan | null> {
  const found = await base44.entities.PurchasePlan.filter({ id });
  return found.length > 0 ? toPlan(found[0]) : null;
}
export async function createPlan(p: Omit<PurchasePlan, 'id'>): Promise<PurchasePlan> {
  return toPlan(await base44.entities.PurchasePlan.create(stripNulls(p)));
}
export async function updatePlan(id: string, patch: Partial<Omit<PurchasePlan, 'id'>>): Promise<PurchasePlan> {
  return toPlan(await base44.entities.PurchasePlan.update(id, patch));
}
/** Deletes the plan and all of its options. */
export async function deletePlan(id: string): Promise<void> {
  const options = await listOptionsForPlan(id);
  await Promise.all(options.map((o) => base44.entities.PurchaseOption.delete(o.id)));
  await base44.entities.PurchasePlan.delete(id);
}

export async function listAllOptions(): Promise<PurchaseOption[]> {
  return (await base44.entities.PurchaseOption.list()).map(toOption);
}
export async function listOptionsForPlan(planId: string): Promise<PurchaseOption[]> {
  return (await base44.entities.PurchaseOption.filter({ plan_id: planId })).map(toOption);
}
export async function createOption(o: Omit<PurchaseOption, 'id'>): Promise<PurchaseOption> {
  return toOption(await base44.entities.PurchaseOption.create(stripNulls(o)));
}
export async function updateOption(id: string, patch: Partial<Omit<PurchaseOption, 'id'>>): Promise<PurchaseOption> {
  return toOption(await base44.entities.PurchaseOption.update(id, patch));
}
export async function deleteOption(id: string): Promise<void> {
  await base44.entities.PurchaseOption.delete(id);
}
