import { DEFAULT_ORDER, type Category } from '@/data/categories';
import type { Settings, Txn, YearMonth } from '@/domain/types';

/** The month's own budget for the category when set, else its monthly default. */
export function effectiveCategoryBudget(category: Category, settings: Settings, month: YearMonth): number | null {
  return settings.month_overrides[month]?.category_budgets?.[category.id] ?? category.monthly_budget_minor;
}

export interface BudgetRow { category: Category; budgetMinor: number | null; isMonthOnly: boolean; spentMinor: number; leftMinor: number | null }

const rank = (name: string) => {
  const i = DEFAULT_ORDER.indexOf(name);
  return i < 0 ? DEFAULT_ORDER.length : i;
};

/** Expense categories only, in the default order then by name; spent counts every expense of the month, recurring included. */
export function categoryBudgetRows(categories: Category[], txns: Txn[], settings: Settings, month: YearMonth): BudgetRow[] {
  const spent = new Map<string, number>();
  for (const t of txns) {
    if (t.kind !== 'expense' || !t.category_id || t.date.slice(0, 7) !== month) continue;
    spent.set(t.category_id, (spent.get(t.category_id) ?? 0) + t.amount_huf_minor);
  }
  return categories
    .filter((c) => c.kind === 'expense')
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
    .map((category) => {
      const budgetMinor = effectiveCategoryBudget(category, settings, month);
      const spentMinor = spent.get(category.id) ?? 0;
      return {
        category, budgetMinor, spentMinor,
        isMonthOnly: settings.month_overrides[month]?.category_budgets?.[category.id] !== undefined,
        leftMinor: budgetMinor === null ? null : budgetMinor - spentMinor,
      };
    });
}
