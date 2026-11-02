import type { AdviceChange, MonthOverride, Settings, YearMonth } from '@/domain/types';

export interface ApplyPlan {
  settingsPatch: Partial<Settings>;
  categoryPatches: { id: string; monthly_budget_minor: number }[];
}

/** Turns accepted advice into writes. Postpone writes nothing here; the plan update handles it. */
export function planApply(i: { changes: AdviceChange[]; mode: 'month' | 'permanent'; month: YearMonth; settings: Settings }): ApplyPlan {
  const settingsPatch: Partial<Settings> = {};
  const categoryPatches: ApplyPlan['categoryPatches'] = [];
  const override: MonthOverride = { ...(i.settings.month_overrides?.[i.month] ?? {}) };
  let overrideTouched = false;

  for (const c of i.changes) {
    if (c.type === 'savings_target') {
      if (i.mode === 'permanent') settingsPatch.monthly_savings_target_minor = c.to_minor;
      else { override.savings_target_minor = c.to_minor; overrideTouched = true; }
    } else if (c.type === 'category_budget') {
      if (i.mode === 'permanent') categoryPatches.push({ id: c.category_id, monthly_budget_minor: c.to_minor });
      else { override.category_budgets = { ...override.category_budgets, [c.category_id]: c.to_minor }; overrideTouched = true; }
    }
  }
  if (overrideTouched) settingsPatch.month_overrides = { ...i.settings.month_overrides, [i.month]: override };
  return { settingsPatch, categoryPatches };
}
