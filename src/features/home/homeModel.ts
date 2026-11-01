import { computeMonthlyAllowance, computeWeeklyAllowance, type MonthlyAllowance, type WeeklyAllowance } from '@/domain/allowance';
import { accountBalanceMinor } from '@/domain/balances';
import { addDays, compareDates, daysBetweenInclusive, lastDay, monthOf } from '@/domain/dates';
import { closeOutcome, previousDeficit } from '@/domain/monthClose';
import type { Account, ISODate, MonthClose, RecurringRule, Settings, Txn, YearMonth } from '@/domain/types';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isSpend = (t: Txn) => t.kind === 'expense' && t.recurring_rule_id === null;

export interface DayBar { date: ISODate; spentMinor: number; future: boolean; today: boolean; over: boolean; past: boolean /* before the current month: not budgeted */ }
export interface AccountView { account: Account; balanceMinor: number; balanceHufMinor: number }

export interface HomeModel {
  month: YearMonth;
  monthly: MonthlyAllowance;
  weekly: WeeklyAllowance;
  daysLeftInMonth: number; // including today
  daysLeftInWeek: number; // including today
  countedDays: number; // days of the week that belong to the budget (from countedFrom)
  perDayLeftMinor: number; // max(0, week remaining) / days left in week
  dailyShareMinor: number; // week budget / counted days (countedFrom..weekEnd)
  bars: DayBar[];
  accounts: AccountView[];
  totalBalanceHufMinor: number;
  needsReview: Txn[];
  recent: Txn[];
}

/**
 * Pure assembly of everything Home and the breakdown display.
 * `rates` = HUF per 1 unit of each currency, used only to value non-HUF account balances
 * (a currency missing from `rates` is valued at 0 rather than guessed). Archived accounts are excluded.
 * `txns` must include every transaction touching the month/week (and all of them for balances).
 */
export function buildHomeModel(i: {
  today: ISODate; rules: RecurringRule[]; txns: Txn[]; settings: Settings; closes: MonthClose[];
  accounts: Account[]; rates?: Record<string, number>;
}): HomeModel {
  const month = monthOf(i.today);
  const prevDef = previousDeficit(month, i.closes);
  const monthly = computeMonthlyAllowance({ month, rules: i.rules, txns: i.txns, settings: i.settings, previousDeficitMinor: prevDef });
  const weekly = computeWeeklyAllowance({ today: i.today, rules: i.rules, txns: i.txns, settings: i.settings, previousDeficitMinor: prevDef });
  const countedDays = daysBetweenInclusive(weekly.countedFrom, weekly.weekEnd);
  const dailyShareMinor = weekly.budgetMinor / countedDays;

  const bars: DayBar[] = Array.from({ length: 7 }, (_, n) => {
    const date = addDays(weekly.weekStart, n);
    const spentMinor = sum(i.txns.filter((t) => isSpend(t) && t.date === date).map((t) => t.amount_huf_minor));
    const past = compareDates(date, weekly.countedFrom) < 0;
    return { date, spentMinor, past, future: compareDates(date, i.today) > 0, today: date === i.today, over: !past && spentMinor > dailyShareMinor };
  });

  const daysLeftInMonth = daysBetweenInclusive(i.today, lastDay(month));
  const daysLeftInWeek = daysBetweenInclusive(i.today, weekly.weekEnd);

  const rates = i.rates ?? {};
  const accounts: AccountView[] = i.accounts
    .filter((a) => !a.archived)
    .map((account) => {
      const balanceMinor = accountBalanceMinor(account, i.txns);
      const rate = account.currency === 'HUF' ? 1 : (rates[account.currency] ?? 0);
      return { account, balanceMinor, balanceHufMinor: Math.round(balanceMinor * rate) };
    });

  const byDateDesc = (a: Txn, b: Txn) =>
    compareDates(b.date, a.date) || (b.created_date ?? '').localeCompare(a.created_date ?? '') || b.id.localeCompare(a.id);
  return {
    month, monthly, weekly, daysLeftInMonth, daysLeftInWeek, countedDays,
    perDayLeftMinor: Math.max(0, weekly.remainingMinor) / daysLeftInWeek,
    dailyShareMinor, bars,
    accounts,
    totalBalanceHufMinor: sum(accounts.map((a) => a.balanceHufMinor)),
    needsReview: i.txns.filter((t) => t.needs_review),
    recent: [...i.txns].sort(byDateDesc).slice(0, 5),
  };
}

export interface CloseSummary {
  month: YearMonth;
  allowance: MonthlyAllowance;
  leftoverMinor: number;
  deficitMinor: number;
}

/** What the month-close prompt shows for `month`, using the deficit carried in from the previous (closed) month. */
export function summarizeClose(i: {
  month: YearMonth; rules: RecurringRule[]; txns: Txn[]; settings: Settings; closes: MonthClose[];
}): CloseSummary {
  const allowance = computeMonthlyAllowance({
    month: i.month, rules: i.rules, txns: i.txns, settings: i.settings,
    previousDeficitMinor: previousDeficit(i.month, i.closes),
  });
  return { month: i.month, allowance, ...closeOutcome(allowance) };
}

/** The MonthClose record to store for a prompt choice. */
export function closeRecord(
  s: CloseSummary, choice: 'move' | 'keep' | 'ok', transferPairId: string | null,
): Omit<MonthClose, 'id'> {
  if (s.deficitMinor > 0 || s.leftoverMinor === 0) {
    return { month: s.month, final_remaining_minor: s.allowance.remainingMinor, deficit_minor: s.deficitMinor, leftover_action: 'none', transfer_pair_id: null };
  }
  return {
    month: s.month, final_remaining_minor: s.allowance.remainingMinor, deficit_minor: 0,
    leftover_action: choice === 'move' ? 'transferred' : 'kept',
    transfer_pair_id: choice === 'move' ? transferPairId : null,
  };
}

/** Leftover can be moved only between a default account and a savings target of the same currency. */
export function canMoveLeftover(from: Account | undefined, to: Account | undefined): boolean {
  return !!from && !!to && from.currency === to.currency;
}

/**
 * A month-close transfer already written (e.g. the MonthClose save failed and the app was reloaded):
 * a transfer_out from the default account dated `date` with the same amount, whose pair leg goes into
 * the savings target. Returns its transfer_pair_id, or null.
 */
export function findCloseTransfer(
  txns: Txn[], q: { fromAccountId: string; toAccountId: string; date: ISODate; amountMinor: number },
): string | null {
  const out = txns.find((t) =>
    t.kind === 'transfer_out' && t.account_id === q.fromAccountId && t.date === q.date && t.amount_minor === q.amountMinor &&
    t.transfer_pair_id !== null &&
    txns.some((p) => p.kind === 'transfer_in' && p.transfer_pair_id === t.transfer_pair_id && p.account_id === q.toAccountId));
  return out?.transfer_pair_id ?? null;
}
