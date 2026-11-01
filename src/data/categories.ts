import { base44 } from '@/data/client';
import { pick } from '@/data/records';

export interface Category {
  id: string;
  name: string;
  kind: 'expense' | 'income';
  icon: string;
  monthly_budget_minor: number | null;
}

const toCategory = (r: Record<string, unknown>): Category =>
  pick<Category>(r, ['name', 'kind', 'icon', 'monthly_budget_minor'], ['monthly_budget_minor']);

const DEFAULTS: Omit<Category, 'id'>[] = [
  ...[
    ['Groceries', 'cart'], ['Dining out', 'fork'], ['Transport', 'bus'], ['Housing', 'house'],
    ['Utilities', 'bolt'], ['Subscriptions', 'repeat'], ['Health', 'heart'], ['Shopping', 'bag'],
    ['Entertainment', 'ticket'], ['Travel', 'plane'], ['Gifts', 'gift'], ['Other', 'dots'],
  ].map(([name, icon]) => ({ name, kind: 'expense' as const, icon, monthly_budget_minor: null })),
  ...[
    ['Salary', 'coin'], ['Bonus', 'gift'], ['Other income', 'coin'],
  ].map(([name, icon]) => ({ name, kind: 'income' as const, icon, monthly_budget_minor: null })),
];

export async function listCategories(): Promise<Category[]> {
  return (await base44.entities.Category.list()).map(toCategory);
}

let seeding: Promise<void> | null = null;

export function ensureDefaultCategories(): Promise<void> {
  seeding ??= (async () => {
    if ((await base44.entities.Category.list()).length > 0) return;
    await base44.entities.Category.bulkCreate(
      DEFAULTS.map(({ monthly_budget_minor: _omit, ...c }) => c),
    );
  })().finally(() => {
    seeding = null;
  });
  return seeding;
}
