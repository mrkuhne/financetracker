import type { ISODate, MonthClose, PurchaseOption, RecurringRule, Settings, Txn, YearMonth } from './types';
import { computeMonthlyAllowance, isSpend } from './allowance';
import { addMonths, compareDates, daysInMonth, firstDay, monthOf, monthsBetween, nextMonth } from './dates';
import { previousDeficit } from './monthClose';

export const SAFE_HORIZON_MONTHS = 24;
const RECENT_MONTHS = 3;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface MonthTotals { month: YearMonth; spendMinor: number; expensesMinor: number; incomeMinor: number }

/**
 * Every complete month before today's, oldest first. Tracking starts at the earliest txn that is not
 * recurring back-fill; that month counts only if the txn is on its 1st, else the next month is first.
 */
export function completeMonthTotals(txns: Txn[], today: ISODate): MonthTotals[] {
  const tracked = txns.filter((t) => t.source !== 'recurring');
  if (tracked.length === 0) return [];
  const current = monthOf(today);
  const earliestDate = tracked.map((t) => t.date).reduce((a, b) => (compareDates(a, b) <= 0 ? a : b));
  const first = earliestDate === firstDay(monthOf(earliestDate)) ? monthOf(earliestDate) : nextMonth(monthOf(earliestDate));
  const out: MonthTotals[] = [];
  for (let m = first; compareDates(m, current) < 0; m = nextMonth(m)) {
    const inMonth = txns.filter((t) => monthOf(t.date) === m);
    out.push({
      month: m,
      spendMinor: sum(inMonth.filter(isSpend).map((t) => t.amount_huf_minor)),
      expensesMinor: sum(inMonth.filter((t) => t.kind === 'expense').map((t) => t.amount_huf_minor)),
      incomeMinor: sum(inMonth.filter((t) => t.kind === 'income').map((t) => t.amount_huf_minor)),
    });
  }
  return out;
}

/** Expected daily spend: the larger of this month's pace so far and the complete-month average per 30 days; 0 with no data. */
export function dailySpendMinor(txns: Txn[], today: ISODate): number {
  const month = monthOf(today);
  const soFar = sum(txns.filter((t) => monthOf(t.date) === month && isSpend(t)).map((t) => t.amount_huf_minor));
  const paceNow = Math.ceil(soFar / Number(today.slice(8, 10)));
  const months = completeMonthTotals(txns, today);
  const paceHistory = months.length > 0 ? Math.ceil(sum(months.map((m) => m.spendMinor)) / months.length / 30) : 0;
  return Math.max(paceNow, paceHistory);
}

function recentAverage(months: MonthTotals[], pick: (m: MonthTotals) => number): number {
  const recent = months.slice(-RECENT_MONTHS);
  return Math.floor(sum(recent.map(pick)) / recent.length);
}

export function typicalMonthlySpendMinor(txns: Txn[], today: ISODate, months = completeMonthTotals(txns, today)): number {
  if (months.length > 0) return recentAverage(months, (m) => m.spendMinor);
  const month = monthOf(today);
  const soFar = sum(txns.filter((t) => monthOf(t.date) === month && isSpend(t)).map((t) => t.amount_huf_minor));
  const dayOfMonth = Number(today.slice(8, 10));
  return Math.floor((soFar * daysInMonth(month)) / dayOfMonth);
}

export function averageMonthlyExpensesMinor(
  txns: Txn[], rules: RecurringRule[], settings: Settings, today: ISODate, months = completeMonthTotals(txns, today),
): number {
  if (months.length > 0) return recentAverage(months, (m) => m.expensesMinor);
  const a = computeMonthlyAllowance({ month: monthOf(today), rules, txns, settings, previousDeficitMinor: 0 });
  return a.recurringExpensesMinor + typicalMonthlySpendMinor(txns, today, months);
}

export function averageMonthlyIncomeMinor(
  txns: Txn[], rules: RecurringRule[], settings: Settings, today: ISODate, months = completeMonthTotals(txns, today),
): number {
  if (months.length > 0) return recentAverage(months, (m) => m.incomeMinor);
  const a = computeMonthlyAllowance({ month: monthOf(today), rules, txns, settings, previousDeficitMinor: 0 });
  return a.recurringIncomeMinor + a.oneOffIncomeMinor;
}

type OptionCost = Pick<PurchaseOption, 'payment' | 'price_minor' | 'installment_minor' | 'installment_count'>;

export interface OptionImpact { leftThisMonthMinor: number; touchesSavingsMinor: number; monthlyCostMinor: number; safeMonth: YearMonth | null }

export function simulateOption(i: {
  option: OptionCost; remainingMinor: number; setAsideMinor: number; currentMonth: YearMonth;
}): OptionImpact {
  const { option, remainingMinor, setAsideMinor, currentMonth } = i;
  const available = Math.max(0, remainingMinor);

  if (option.payment === 'installments') {
    const installment = option.installment_minor ?? 0;
    const left = remainingMinor - installment;
    let safeMonth: YearMonth | null = null;
    if (installment <= setAsideMinor) safeMonth = installment <= available ? currentMonth : nextMonth(currentMonth);
    return { leftThisMonthMinor: left, touchesSavingsMinor: Math.max(0, -left), monthlyCostMinor: installment, safeMonth };
  }

  const price = option.price_minor;
  const left = remainingMinor - price;
  let safeMonth: YearMonth | null = null;
  if (price <= available) safeMonth = currentMonth;
  else {
    for (let k = 1; k <= SAFE_HORIZON_MONTHS; k++) {
      if (available + k * setAsideMinor >= price) { safeMonth = addMonths(currentMonth, k); break; }
    }
  }
  return { leftThisMonthMinor: left, touchesSavingsMinor: Math.max(0, -left), monthlyCostMinor: price, safeMonth };
}

export function emergencyAfterMinor(i: {
  option: OptionCost; remainingMinor: number; setAsideMinor: number; currentMonth: YearMonth;
  plannedMonth: YearMonth; cutsMinor: number; emergencySavedMinor: number;
}): number {
  const { option, setAsideMinor, cutsMinor, emergencySavedMinor } = i;
  if (option.payment === 'installments') {
    const shortfall = Math.max(0, (option.installment_minor ?? 0) - setAsideMinor - cutsMinor) * (option.installment_count ?? 0);
    return Math.max(0, emergencySavedMinor - shortfall);
  }
  const k = Math.max(0, monthsBetween(i.currentMonth, i.plannedMonth));
  const funds = Math.max(0, i.remainingMinor) + k * setAsideMinor + cutsMinor;
  return Math.max(0, emergencySavedMinor - Math.max(0, option.price_minor - funds));
}

export interface PlanningModel {
  today: ISODate; month: YearMonth; remainingMinor: number; setAsideMinor: number; typicalSpendMinor: number;
  avgExpensesMinor: number; avgIncomeMinor: number; trackedMonths: number;
}

export function buildPlanningModel(i: {
  today: ISODate; rules: RecurringRule[]; txns: Txn[]; settings: Settings; closes: MonthClose[];
}): PlanningModel {
  const month = monthOf(i.today);
  const months = completeMonthTotals(i.txns, i.today);
  const typicalSpendMinor = typicalMonthlySpendMinor(i.txns, i.today, months);
  const thisMonth = computeMonthlyAllowance({
    month, rules: i.rules, txns: i.txns, settings: i.settings, previousDeficitMinor: previousDeficit(month, i.closes),
  });
  const nextFree = computeMonthlyAllowance({
    month: addMonths(month, 1), rules: i.rules, txns: i.txns, settings: i.settings, previousDeficitMinor: 0,
  });
  return {
    today: i.today, month, remainingMinor: thisMonth.remainingMinor,
    setAsideMinor: Math.max(0, nextFree.freeMinor - typicalSpendMinor),
    typicalSpendMinor,
    avgExpensesMinor: averageMonthlyExpensesMinor(i.txns, i.rules, i.settings, i.today, months),
    avgIncomeMinor: averageMonthlyIncomeMinor(i.txns, i.rules, i.settings, i.today, months),
    trackedMonths: months.length,
  };
}
