import { Icon } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import { monthLabel } from '@/features/transactions/txLogic';
import type { RecurringRule } from '@/domain/types';
import { huf, hufSigned } from './fmt';
import type { HomeModel } from './homeModel';

const dayName = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...opts, timeZone: 'UTC' }).format(Date.parse(`${d}T12:00:00Z`));

/** Every term of the allowance formula, labelled as in the prototype. */
export function AllowanceBreakdown({ model, rules }: { model: HomeModel; rules: RecurringRule[] }) {
  const { monthly: m, weekly: w } = model;
  const expenseRules = rules.filter((r) => r.active && r.kind === 'expense').length;
  const prevName = monthLabel(prevMonthOf(m.month)).split(' ')[0];
  const range = `${dayName(w.weekStart, { weekday: 'short', day: 'numeric' })} – ${dayName(w.weekEnd, { weekday: 'short', day: 'numeric' })}`;
  return (
    <Screen title="Where the numbers come from" back="/">
      <div className="sec">
        <span className="ov">This month · {monthLabel(m.month).split(' ')[0]}</span>
        <div className="card eq">
          <div><span>Salary (recurring)</span><b className="num pos">{hufSigned(m.recurringIncomeMinor)}</b></div>
          <div><span>One-off income</span><b className="num">{hufSigned(m.oneOffIncomeMinor)}</b></div>
          <div><span>Recurring expenses ({expenseRules})</span><b className="num">{huf(-m.recurringExpensesMinor)}</b></div>
          <div><span>Savings target</span><b className="num">{huf(-m.savingsTargetMinor)}</b></div>
          <div><span>Invested this month</span><b className="num">{huf(-m.investmentMinor)}</b></div>
          <div><span>Overspend from {prevName}</span><b className="num">{huf(-m.previousDeficitMinor)}</b></div>
          <div className="tot"><span>Free to spend</span><b className="num">{huf(m.freeMinor)}</b></div>
          <div><span>Spent so far (not recurring)</span><b className="num">{huf(-m.spentMinor)}</b></div>
          <div className="tot"><span>Left this month</span><b className={`num${m.remainingMinor < 0 ? ' neg' : ''}`}>{huf(m.remainingMinor)}</b></div>
        </div>
      </div>
      <div className="sec">
        <span className="ov">This week · {range}</span>
        <div className="card eq">
          {w.portions.map((p) => (
            <div key={p.month}>
              <span>
                {monthLabel(p.month).split(' ')[0]}: {huf(p.remainingAtFromMinor)} left on {dayName(p.from, { weekday: 'short', day: 'numeric' })} × {p.daysInWeek} of {p.daysToMonthEnd} days
              </span>
              <b className="num">{huf(p.portionMinor)}</b>
            </div>
          ))}
          <div><span>Daily share × {model.countedDays} day{model.countedDays === 1 ? '' : 's'}</span><b className="num">{huf(model.dailyShareMinor)} × {model.countedDays}</b></div>
          <div className="tot"><span>Week budget</span><b className="num">{huf(w.budgetMinor)}</b></div>
          <div><span>Spent this week</span><b className="num">{huf(-w.spentMinor)}</b></div>
          <div className="tot"><span>Left this week</span><b className={`num${w.remainingMinor < 0 ? ' neg' : ''}`}>{huf(w.remainingMinor)}</b></div>
        </div>
        <p className="note">
          <Icon name="info" />
          {w.countedFrom !== w.weekStart && 'Days before this month are not counted: that money closes out to Savings. '}Overspend in one week makes the following weeks smaller. Leftover at month end goes to Savings, overspend comes off next month.
        </p>
      </div>
    </Screen>
  );
}

function prevMonthOf(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
}
