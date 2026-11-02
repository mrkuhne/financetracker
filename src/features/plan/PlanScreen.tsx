import { Link } from 'react-router-dom';
import { currentStep, guideSteps } from '@/domain/guide';
import type { PurchaseOption, PurchasePlan } from '@/domain/types';
import { huf } from '@/features/home/fmt';
import { Icon } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import { usePlanData } from './usePlanData';

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${iso}T12:00:00Z`));
const shortMonth = (ym: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(Date.parse(`${ym}-01T12:00:00Z`));

function pill(plan: PurchasePlan, n: number): { text: string; cls: string } {
  if (plan.status === 'bought') return { text: 'Bought', cls: 'good' };
  if (plan.status === 'dropped') return { text: 'Dropped', cls: '' };
  if (plan.status === 'decided') return { text: `Decided${plan.planned_month ? ` · ${shortMonth(plan.planned_month)}` : ''}`, cls: 'good' };
  return n >= 2 ? { text: `Comparing ${n}`, cls: 'warn' } : { text: 'Idea', cls: '' };
}

function PlanRow({ plan, options }: { plan: PurchasePlan; options: PurchaseOption[] }) {
  const p = pill(plan, options.length);
  const prices = options.map((o) => o.price_minor);
  return (
    <Link className="opt" to={`/plan/${plan.id}`}>
      <div className="top">
        <span style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
          <span style={{ width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb,var(--accent) 15%,transparent)', color: 'var(--accent)', flex: '0 0 auto' }}>
            <Icon name="sofa" />
          </span>
          <strong>{plan.title}</strong>
        </span>
        <span className={`pill ${p.cls}`}>{p.text}</span>
      </div>
      {(plan.needed_by || prices.length > 0) && (
        <div className="kv">
          {plan.needed_by && <><span>Needed by</span><b>{shortDate(plan.needed_by)}</b></>}
          {prices.length === 1 && <><span>Estimate</span><b className="num">{huf(prices[0])}</b></>}
          {prices.length > 1 && <><span>Options</span><b className="num">{huf(Math.min(...prices))} – {huf(Math.max(...prices))}</b></>}
        </div>
      )}
    </Link>
  );
}

export function PlanScreen() {
  const { data, failed, reload } = usePlanData();
  const right = <Link to="/plan/new" className="ib soft" aria-label="New plan"><Icon name="plus" /></Link>;
  if (!data) {
    return (
      <Screen title="Plan" big right={right}>
        {failed
          ? <div className="card sub">Could not load your plans. <button className="link" onClick={() => void reload()}>Retry</button></div>
          : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      </Screen>
    );
  }

  const optsOf = (id: string) => data.options.filter((o) => o.plan_id === id);
  const sorted = [...data.plans].sort((a, b) => (a.needed_by ?? '9999').localeCompare(b.needed_by ?? '9999') || a.title.localeCompare(b.title));
  const active = sorted.filter((p) => p.status === 'considering' || p.status === 'decided');
  const done = sorted.filter((p) => p.status === 'bought' || p.status === 'dropped');

  const { settings } = data.home;
  const steps = guideSteps({
    trackedMonths: data.planning.trackedMonths,
    emergency: data.emergency ? { savedMinor: data.emergency.savedMinor, targetMinor: data.emergency.targetMinor } : null,
    emergencyMonths: settings.emergency_fund_months,
    hasExpensiveDebt: settings.has_expensive_debt,
    monthlyInvestmentMinor: settings.monthly_investment_amount_minor,
  });
  const step = currentStep(steps);
  const e = data.emergency;

  return (
    <Screen title="Plan" big right={right}>
      <div className="sec">
        <div className="sechd"><h2>Purchases</h2></div>
        {active.length === 0 && <div className="card sub">No plans yet. Add something you are thinking of buying.</div>}
        {active.map((p) => <PlanRow key={p.id} plan={p} options={optsOf(p.id)} />)}
      </div>
      {done.length > 0 && (
        <div className="sec">
          <div className="sechd"><h2>Done</h2></div>
          {done.map((p) => <PlanRow key={p.id} plan={p} options={optsOf(p.id)} />)}
        </div>
      )}
      <div className="sec">
        <div className="sechd"><h2>Savings</h2><Link className="link" to="/savings">Details</Link></div>
        <Link className="card" to="/savings" style={{ display: 'grid', gap: 8 }}>
          {e ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="sub">Emergency fund · {settings.emergency_fund_months} months</span>
                <b className="num">{Math.round(e.ratio * 100)}%</b>
              </div>
              <div className="bar"><b style={{ width: `${e.ratio * 100}%`, background: 'var(--good)' }} /></div>
              <span className="sub num">{huf(e.savedMinor)} of {huf(e.targetMinor)}</span>
            </>
          ) : <strong>Set up your emergency fund</strong>}
        </Link>
      </div>
      {step && (
        <Link className="banner ai" to="/guide">
          <span className="bi"><Icon name="spark" /></span>
          <div><strong>Smart money guide</strong><span>You are on step {step.n} of 5: {step.title}</span></div>
          <Icon name="chev" />
        </Link>
      )}
      <div className="list">
        <Link className="li" to="/budgets">
          <span className="tx"><strong>Category budgets</strong></span>
          <Icon name="chev" />
        </Link>
      </div>
    </Screen>
  );
}
