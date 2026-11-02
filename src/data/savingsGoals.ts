import { base44 } from '@/data/client';
import type { SavingsGoal } from '@/domain/types';
import { pick, stripNulls } from '@/data/records';

const KEYS = ['name', 'kind', 'target_minor', 'account_id', 'priority', 'icon'];
const NULLABLE = ['target_minor'];
const toGoal = (r: Record<string, unknown>): SavingsGoal => pick<SavingsGoal>(r, KEYS, NULLABLE);

export async function listGoals(): Promise<SavingsGoal[]> {
  return (await base44.entities.SavingsGoal.list()).map(toGoal);
}
export async function createGoal(g: Omit<SavingsGoal, 'id'>): Promise<SavingsGoal> {
  return toGoal(await base44.entities.SavingsGoal.create(stripNulls(g)));
}
export async function updateGoal(id: string, patch: Partial<Omit<SavingsGoal, 'id'>>): Promise<SavingsGoal> {
  return toGoal(await base44.entities.SavingsGoal.update(id, patch));
}
export async function deleteGoal(id: string): Promise<void> {
  await base44.entities.SavingsGoal.delete(id);
}
