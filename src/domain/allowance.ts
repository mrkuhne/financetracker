import type { ISODate, RecurringRule, Settings, Txn, YearMonth } from './types';
import {
  addDays, compareDates, daysBetweenInclusive, firstDay, lastDay, monthOf, nextMonth, weekStart,
} from './dates';
import { occurrencesInRange } from './recurrence';

export interface MonthlyAllowance {
  month: YearMonth;
  recurringIncomeMinor: number; oneOffIncomeMinor: number; recurringExpensesMinor: number;
  savingsTargetMinor: number; investmentMinor: number; previousDeficitMinor: number;
  freeMinor: number; spentMinor: number; remainingMinor: number;
}
export interface WeeklyAllowance {
  weekStart: ISODate; weekEnd: ISODate; countedFrom: ISODate; portions: WeekPortion[]; budgetMinor: number; spentMinor: number; remainingMinor: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Recurring income/expense of `month`, without rewriting the past:
 *  - every rule-linked txn dated in the month counts at its own amount, whatever the rule's
 *    current state (paused, deleted, re-priced);
 *  - plus the CURRENT amount of each occurrence of an ACTIVE rule in the month that is not yet
 *    materialized: after `last_materialized_date` and without a linked txn on that date.
 *    Occurrences on or before `last_materialized_date` with no txn were deliberately skipped
 *    (schedule edit, re-activation after a pause, or a deleted entry) and never will be written.
 */
function recurringTotal(rules: RecurringRule[], inMonth: Txn[], kind: RecurringRule['kind'], month: YearMonth): number {
  const linked = inMonth.filter((t) => t.kind === kind && t.recurring_rule_id !== null);
  const have = new Set(linked.map((t) => `${t.recurring_rule_id}|${t.date}`));
  const projected = rules
    .filter((r) => r.active && r.kind === kind)
    .flatMap((r) =>
      occurrencesInRange(r, firstDay(month), lastDay(month))
        .filter((d) => !r.last_materialized_date || compareDates(d, r.last_materialized_date) > 0)
        .filter((d) => !have.has(`${r.id}|${d}`))
        .map(() => r.amount_huf_minor),
    );
  return sum(linked.map((t) => t.amount_huf_minor)) + sum(projected);
}

/** Day-to-day spending: an expense not linked to a recurring rule. */
export const isSpend = (t: Txn) => t.kind === 'expense' && t.recurring_rule_id === null;

export function savingsTargetFor(settings: Settings, month: YearMonth): number {
  const o = settings.month_overrides?.[month]?.savings_target_minor;
  return typeof o === 'number' ? o : settings.monthly_savings_target_minor;
}

export function computeMonthlyAllowance(i: {
  month: YearMonth; rules: RecurringRule[]; txns: Txn[]; settings: Settings; previousDeficitMinor: number;
}): MonthlyAllowance {
  const inMonth = i.txns.filter((t) => monthOf(t.date) === i.month);
  const recurringIncomeMinor = recurringTotal(i.rules, inMonth, 'income', i.month);
  const recurringExpensesMinor = recurringTotal(i.rules, inMonth, 'expense', i.month);
  const oneOffIncomeMinor = sum(
    inMonth.filter((t) => t.kind === 'income' && t.recurring_rule_id === null).map((t) => t.amount_huf_minor),
  );
  const savingsTargetMinor = savingsTargetFor(i.settings, i.month);
  const investmentMinor = i.settings.monthly_investment_amount_minor ?? 0;
  const freeMinor =
    recurringIncomeMinor + oneOffIncomeMinor - recurringExpensesMinor - savingsTargetMinor - investmentMinor - i.previousDeficitMinor;
  const spentMinor = sum(inMonth.filter(isSpend).map((t) => t.amount_huf_minor));
  return {
    month: i.month, recurringIncomeMinor, oneOffIncomeMinor, recurringExpensesMinor, savingsTargetMinor,
    investmentMinor, previousDeficitMinor: i.previousDeficitMinor, freeMinor, spentMinor,
    remainingMinor: freeMinor - spentMinor,
  };
}

export interface WeekPortion {
  month: YearMonth; from: ISODate; daysInWeek: number; daysToMonthEnd: number;
  remainingAtFromMinor: number; portionMinor: number;
}

export function computeWeeklyAllowance(i: {
  // previousDeficitMinor is the deficit carried into monthOf(today); any later touched month uses 0.
  today: ISODate; rules: RecurringRule[]; txns: Txn[]; settings: Settings; previousDeficitMinor: number;
}): WeeklyAllowance {
  const ws = weekStart(i.today);
  const we = addDays(ws, 6);
  const todayMonth = monthOf(i.today);
  // Days before today's month belong to a month that closes to Savings: excluded from budget and spent.
  const counted = compareDates(ws, firstDay(todayMonth)) > 0 ? ws : firstDay(todayMonth);
  const months: YearMonth[] = [todayMonth];
  if (monthOf(we) !== todayMonth) months.push(nextMonth(todayMonth));

  const portions: WeekPortion[] = months.map((m) => {
    const from = compareDates(counted, firstDay(m)) > 0 ? counted : firstDay(m);
    const weekEndInM = compareDates(we, lastDay(m)) < 0 ? we : lastDay(m);
    const daysInWeek = daysBetweenInclusive(from, weekEndInM);
    const daysToMonthEnd = daysBetweenInclusive(from, lastDay(m));
    const a = computeMonthlyAllowance({
      month: m, rules: i.rules, txns: i.txns, settings: i.settings,
      previousDeficitMinor: m === todayMonth ? i.previousDeficitMinor : 0,
    });
    const spentBefore = sum(
      i.txns.filter((t) => monthOf(t.date) === m && isSpend(t) && compareDates(t.date, from) < 0).map((t) => t.amount_huf_minor),
    );
    const remainingAtFromMinor = a.freeMinor - spentBefore;
    return {
      month: m, from, daysInWeek, daysToMonthEnd, remainingAtFromMinor,
      portionMinor: Math.max(0, Math.floor((remainingAtFromMinor * daysInWeek) / daysToMonthEnd)),
    };
  });

  const budgetMinor = sum(portions.map((p) => p.portionMinor));
  const spentMinor = sum(
    i.txns.filter((t) => isSpend(t) && compareDates(t.date, counted) >= 0 && compareDates(t.date, we) <= 0).map((t) => t.amount_huf_minor),
  );
  return { weekStart: ws, weekEnd: we, countedFrom: counted, portions, budgetMinor, spentMinor, remainingMinor: budgetMinor - spentMinor };
}
