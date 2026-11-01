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
  weekStart: ISODate; weekEnd: ISODate; budgetMinor: number; spentMinor: number; remainingMinor: number;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function ruleTotal(rules: RecurringRule[], kind: RecurringRule['kind'], month: YearMonth): number {
  return sum(
    rules
      .filter((r) => r.active && r.kind === kind)
      .map((r) => r.amount_huf_minor * occurrencesInRange(r, firstDay(month), lastDay(month)).length),
  );
}

const isSpend = (t: Txn) => t.kind === 'expense' && t.recurring_rule_id === null;

export function computeMonthlyAllowance(i: {
  month: YearMonth; rules: RecurringRule[]; txns: Txn[]; settings: Settings; previousDeficitMinor: number;
}): MonthlyAllowance {
  const inMonth = i.txns.filter((t) => monthOf(t.date) === i.month);
  const recurringIncomeMinor = ruleTotal(i.rules, 'income', i.month);
  const recurringExpensesMinor = ruleTotal(i.rules, 'expense', i.month);
  const oneOffIncomeMinor = sum(
    inMonth.filter((t) => t.kind === 'income' && t.recurring_rule_id === null).map((t) => t.amount_huf_minor),
  );
  const savingsTargetMinor = i.settings.monthly_savings_target_minor;
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

export function computeWeeklyAllowance(i: {
  // previousDeficitMinor is the deficit carried into monthOf(today); any other touched month uses 0.
  today: ISODate; rules: RecurringRule[]; txns: Txn[]; settings: Settings; previousDeficitMinor: number;
}): WeeklyAllowance {
  const ws = weekStart(i.today);
  const we = addDays(ws, 6);
  const months: YearMonth[] = [monthOf(ws)];
  if (monthOf(we) !== months[0]) months.push(nextMonth(months[0]));

  let budgetMinor = 0;
  months.forEach((m) => {
    const from = compareDates(ws, firstDay(m)) > 0 ? ws : firstDay(m);
    const weekEndInM = compareDates(we, lastDay(m)) < 0 ? we : lastDay(m);
    const daysOfWeekInM = daysBetweenInclusive(from, weekEndInM);
    const daysToEnd = daysBetweenInclusive(from, lastDay(m));
    const a = computeMonthlyAllowance({
      month: m, rules: i.rules, txns: i.txns, settings: i.settings,
      previousDeficitMinor: m === monthOf(i.today) ? i.previousDeficitMinor : 0,
    });
    const spentBefore = sum(
      i.txns.filter((t) => monthOf(t.date) === m && isSpend(t) && compareDates(t.date, from) < 0).map((t) => t.amount_huf_minor),
    );
    const remainingAtStart = a.freeMinor - spentBefore;
    budgetMinor += Math.max(0, Math.floor((remainingAtStart * daysOfWeekInM) / daysToEnd));
  });

  const spentMinor = sum(
    i.txns.filter((t) => isSpend(t) && compareDates(t.date, ws) >= 0 && compareDates(t.date, we) <= 0).map((t) => t.amount_huf_minor),
  );
  return { weekStart: ws, weekEnd: we, budgetMinor, spentMinor, remainingMinor: budgetMinor - spentMinor };
}
