import type { ISODate, MonthClose, PurchaseOption, RecurringRule, Settings, Txn, YearMonth } from './types';
import { computeMonthlyAllowance } from './allowance';
import { addMonths, compareDates, daysInMonth, monthOf, monthsBetween, nextMonth } from './dates';
import { previousDeficit } from './monthClose';

export const SAFE_HORIZON_MONTHS = 24;
const RECENT_MONTHS = 3;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isSpend = (t: Txn) => t.kind === 'expense' && t.recurring_rule_id === null;

export interface MonthTotals { month: YearMonth; spendMinor: number; expensesMinor: number; incomeMinor: number }

/** Every complete month from the earliest txn's month to the month before today's, oldest first. */
export function completeMonthTotals(txns: Txn[], today: ISODate): MonthTotals[] {
  if (txns.length === 0) return [];
  const current = monthOf(today);
  const earliest = txns.map((t) => monthOf(t.date)).reduce((a, b) => (compareDates(a, b) <= 0 ? a : b));
  const out: MonthTotals[] = [];
  for (let m = earliest; compareDates(m, current) < 0; m = nextMonth(m)) {
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

function recentAverage(months: MonthTotals[], pick: (m: MonthTotals) => number): number {
  const recent = months.slice(-RECENT_MONTHS);
  return Math.floor(sum(recent.map(pick)) / recent.length);
}

export function typicalMonthlySpendMinor(txns: Txn[], today: ISODate): number {
  const months = completeMonthTotals(txns, today);
  if (months.length > 0) return recentAverage(months, (m) => m.spendMinor);
  const month = monthOf(today);
  const soFar = sum(txns.filter((t) => monthOf(t.date) === month && isSpend(t)).map((t) => t.amount_huf_minor));
  const dayOfMonth = Number(today.slice(8, 10));
  return Math.floor((soFar * daysInMonth(month)) / dayOfMonth);
}

export function averageMonthlyExpensesMinor(txns: Txn[], rules: RecurringRule[], settings: Settings, today: ISODate): number {
  const months = completeMonthTotals(txns, today);
  if (months.length > 0) return recentAverage(months, (m) => m.expensesMinor);
  const a = computeMonthlyAllowance({ month: monthOf(today), rules, txns, settings, previousDeficitMinor: 0 });
  return a.recurringExpensesMinor + typicalMonthlySpendMinor(txns, today);
}

export function averageMonthlyIncomeMinor(txns: Txn[], rules: RecurringRule[], settings: Settings, today: ISODate): number {
  const months = completeMonthTotals(txns, today);
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
  const typicalSpendMinor = typicalMonthlySpendMinor(i.txns, i.today);
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
    avgExpensesMinor: averageMonthlyExpensesMinor(i.txns, i.rules, i.settings, i.today),
    avgIncomeMinor: averageMonthlyIncomeMinor(i.txns, i.rules, i.settings, i.today),
    trackedMonths: completeMonthTotals(i.txns, i.today).length,
  };
}
