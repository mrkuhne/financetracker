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
    ['Groceries', '🛒'], ['Dining out', '🍽️'], ['Transport', '🚌'], ['Housing', '🏠'],
    ['Utilities', '💡'], ['Subscriptions', '🔁'], ['Health', '💊'], ['Shopping', '🛍️'],
    ['Entertainment', '🎬'], ['Travel', '✈️'], ['Gifts', '🎁'], ['Other', '📦'],
  ].map(([name, icon]) => ({ name, kind: 'expense' as const, icon, monthly_budget_minor: null })),
  ...[
    ['Salary', '💼'], ['Bonus', '🎉'], ['Other income', '💰'],
  ].map(([name, icon]) => ({ name, kind: 'income' as const, icon, monthly_budget_minor: null })),
];

export async function listCategories(): Promise<Category[]> {
  return (await base44.entities.Category.list()).map(toCategory);
}

export async function ensureDefaultCategories(): Promise<void> {
  if ((await base44.entities.Category.list()).length > 0) return;
  await base44.entities.Category.bulkCreate(
    DEFAULTS.map(({ monthly_budget_minor: _omit, ...c }) => c),
  );
}
