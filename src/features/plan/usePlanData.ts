import { useCallback, useEffect, useRef, useState } from 'react';
import { listCategories, type Category } from '@/data/categories';
import { listPlans, listAllOptions } from '@/data/purchasePlans';
import { listGoals } from '@/data/savingsGoals';
import { buildPlanningModel, type PlanningModel } from '@/domain/planning';
import { allocateGoals, emergencyTargetMinor, type GoalProgress } from '@/domain/savings';
import type { PurchaseOption, PurchasePlan, SavingsGoal } from '@/domain/types';
import { useHomeData, type HomeData } from '@/features/home/useHomeData';

export interface PlanData {
  home: HomeData; categories: Category[]; plans: PurchasePlan[]; options: PurchaseOption[]; goals: SavingsGoal[];
  planning: PlanningModel; goalProgress: GoalProgress[]; emergency: GoalProgress | null;
}

/** "A" for index 0, "B" for 1, ... */
export const optionLetter = (i: number) => String.fromCharCode(65 + i);

/** Home data plus plans, options, goals and categories; reloads whenever Home data reloads. */
export function usePlanData() {
  const { data: home, failed: homeFailed, reload: reloadHome } = useHomeData();
  const [data, setData] = useState<PlanData | null>(null);
  const [failed, setFailed] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (!home) return;
    const id = ++reqId.current;
    void (async () => {
      try {
        const [categories, plans, options, goals] = await Promise.all([listCategories(), listPlans(), listAllOptions(), listGoals()]);
        if (id !== reqId.current) return;
        const planning = buildPlanningModel({ today: home.today, rules: home.rules, txns: home.txns, settings: home.settings, closes: home.closes });
        const balances: Record<string, number> = {};
        for (const a of home.model.accounts) balances[a.account.id] = a.balanceHufMinor;
        const goalProgress = allocateGoals(goals, balances, emergencyTargetMinor(home.settings.emergency_fund_months, planning.avgExpensesMinor));
        setData({
          home, categories, plans, options, goals, planning, goalProgress,
          emergency: goalProgress.find((g) => g.goal.kind === 'emergency') ?? null,
        });
        setFailed(false);
      } catch {
        if (id === reqId.current) setFailed(true);
      }
    })();
  }, [home]);

  const reload = useCallback(() => reloadHome(), [reloadHome]);
  return { data, failed: failed || (homeFailed && !data), reload };
}
