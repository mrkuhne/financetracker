import type { SavingsGoal } from './types';

/** Target for an emergency fund: months of average expenses to cover. */
export function emergencyTargetMinor(months: number, avgExpensesMinor: number): number {
  return months * avgExpensesMinor;
}

export interface GoalProgress { goal: SavingsGoal; targetMinor: number; savedMinor: number; ratio: number /* 0..1 */ }

const byPriority = (a: SavingsGoal, b: SavingsGoal) =>
  a.priority - b.priority || a.name.localeCompare(b.name);

/**
 * Fills goals in priority order from their account's balance. Each account's
 * balance is a pool shared by the goals that point at it.
 */
export function allocateGoals(
  goals: SavingsGoal[],
  balancesByAccount: Record<string, number>,
  emergencyTargetMinor: number,
): GoalProgress[] {
  const pools: Record<string, number> = {};
  return [...goals].sort(byPriority).map((goal) => {
    const pool = pools[goal.account_id] ?? Math.max(0, balancesByAccount[goal.account_id] ?? 0);
    const targetMinor = goal.kind === 'emergency' ? emergencyTargetMinor : (goal.target_minor ?? 0);
    const savedMinor = Math.min(Math.max(0, targetMinor), pool);
    pools[goal.account_id] = pool - savedMinor;
    const ratio = targetMinor > 0 ? Math.min(1, savedMinor / targetMinor) : 0;
    return { goal, targetMinor, savedMinor, ratio };
  });
}

/** Months of expenses the saved amount covers, to 1 decimal; null when there are no expenses. */
export function monthsCovered(savedMinor: number, avgExpensesMinor: number): number | null {
  if (avgExpensesMinor <= 0) return null;
  return Math.round((savedMinor / avgExpensesMinor) * 10) / 10;
}

/** Whole months of saving at the monthly rate needed to close the gap; null when not saving. */
export function monthsToReach(remainingMinor: number, monthlyMinor: number): number | null {
  if (remainingMinor <= 0) return 0;
  if (monthlyMinor <= 0) return null;
  return Math.ceil(remainingMinor / monthlyMinor);
}
