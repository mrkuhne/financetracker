import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { invokeLlm } from '@/data/ai';
import { updateCategory } from '@/data/categories';
import { updatePlan } from '@/data/purchasePlans';
import { updateSettings } from '@/data/settings';
import { savingsTargetFor } from '@/domain/allowance';
import { emergencyAfterMinor, simulateOption } from '@/domain/planning';
import { monthsCovered } from '@/domain/savings';
import type { Advice, AdviceChange, PurchasePlan, StoredAdvice, YearMonth } from '@/domain/types';
import { huf } from '@/features/home/fmt';
import { Icon, type IconName } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import { ADVICE_SCHEMA, adviceCutsMinor, adviceFingerprint, buildAdvicePrompt, normalizeAdvice } from './advice';
import { planApply } from './applyChanges';
import { effectiveCategoryBudget } from './budgets';
import { optionLetter, usePlanData, type PlanData } from './usePlanData';

const monthName = (ym: YearMonth) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(Date.parse(`${ym}-01T12:00:00Z`));
const monthYear = (ym: YearMonth) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${ym}-01T12:00:00Z`));
const hufNum = (minor: number) => huf(minor).replace(/\s*Ft$/, '');

export function AdviceScreen() {
  const { id } = useParams();
  const { data, failed, reload } = usePlanData();
  const plan = data?.plans.find((p) => p.id === id);
  if (!data || !plan) {
    return (
      <Screen title="Recommendation" back={id ? `/plan/${id}` : '/plan'}>
        {failed
          ? <div className="card sub">Could not load this plan. <button className="link" onClick={() => void reload()}>Retry</button></div>
          : data
            ? <div className="card sub">This plan no longer exists.</div>
            : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      </Screen>
    );
  }
  return <AdviceBody key={plan.id} data={data} plan={plan} reload={reload} />;
}

function AdviceBody({ data, plan, reload }: { data: PlanData; plan: PurchasePlan; reload: () => Promise<unknown> | void }) {
  const { planning, categories } = data;
  const options = data.options.filter((o) => o.plan_id === plan.id).sort((a, b) => a.position - b.position);
  const currentMonth = planning.month;
  const settings = data.home.settings;
  const fingerprint = adviceFingerprint(options, planning);
  const stored = plan.advice?.fingerprint === fingerprint ? plan.advice.advice : null;

  // Once advice is on screen it stays, even after Apply changes the numbers it was based on.
  // Seeded from the stored advice on first render, so a later fingerprint change cannot remove it.
  const [generated, setGenerated] = useState<Advice | null>(stored);
  const [loading, setLoading] = useState(false);
  const [failedCall, setFailedCall] = useState(false);
  const [mode, setMode] = useState<'month' | 'permanent'>('month');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(false);
  const [awaiting, setAwaiting] = useState<((p: PurchasePlan) => boolean) | null>(null);
  const started = useRef(false);
  const advice = generated;

  const effectiveBudget = (cid: string) => {
    const c = categories.find((x) => x.id === cid);
    return c ? effectiveCategoryBudget(c, settings, currentMonth) : null;
  };

  async function generate() {
    setLoading(true);
    setFailedCall(false);
    setError('');
    try {
      const spent = new Map<string, number>();
      for (const t of data.home.txns) {
        if (t.kind === 'expense' && t.category_id && t.date.slice(0, 7) === currentMonth) {
          spent.set(t.category_id, (spent.get(t.category_id) ?? 0) + t.amount_huf_minor);
        }
      }
      const prompt = buildAdvicePrompt({
        planTitle: plan.title, neededBy: plan.needed_by, currentMonth,
        options: options.map((o, i) => ({
          letter: optionLetter(i), name: o.name, payment: o.payment, priceMinor: o.price_minor,
          installmentMinor: o.installment_minor, count: o.installment_count,
          impact: simulateOption({ option: o, remainingMinor: planning.remainingMinor, setAsideMinor: planning.setAsideMinor, currentMonth }),
        })),
        remainingMinor: planning.remainingMinor, setAsideMinor: planning.setAsideMinor,
        savingsTargetMinor: savingsTargetFor(settings, currentMonth),
        emergencyMonthsCovered: monthsCovered(data.emergency?.savedMinor ?? 0, planning.avgExpensesMinor),
        emergencyGoalMonths: settings.emergency_fund_months,
        categories: categories.filter((c) => c.kind === 'expense').map((c) => ({
          name: c.name, budgetMinor: effectiveCategoryBudget(c, settings, currentMonth), spentThisMonthMinor: spent.get(c.id) ?? 0,
        })),
      });
      const raw = await invokeLlm(prompt, ADVICE_SCHEMA);
      const result = normalizeAdvice(raw, {
        optionCount: options.length, currentMonth, savingsTargetMinor: savingsTargetFor(settings, currentMonth), categories, effectiveBudget,
      });
      if (!result) { setFailedCall(true); return; }
      setGenerated(result);
      const record: StoredAdvice = { fingerprint, generated_at: new Date().toISOString(), advice: result };
      await updatePlan(plan.id, { advice: record }).catch(() => undefined);
    } catch {
      setFailedCall(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // One call per visit; the ref also stops React StrictMode's double mount from calling twice.
    if (started.current || advice || options.length === 0) return;
    started.current = true;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!awaiting) return;
    if (awaiting(plan)) { setAwaiting(null); setBusy(false); setApplied(true); return; }
    // If the reload never shows the change, stop blocking the screen.
    const t = setTimeout(() => { setAwaiting(null); setBusy(false); setApplied(true); }, 8000);
    return () => clearTimeout(t);
  }, [awaiting, plan]);

  const back = <Link className="link" to={`/plan/${plan.id}`}>Back to the options</Link>;
  const shell = (body: React.ReactNode) => (
    <Screen title="Recommendation" back={`/plan/${plan.id}`}>
      <div className="steps"><i className="on" /><i className="on" /><i className="on" /></div>
      {body}
    </Screen>
  );

  if (!advice) {
    return shell(loading || (!failedCall && options.length > 0)
      ? (
        <div className="card" style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
          <div className="spinner" role="status" aria-label="Loading" />
          <span className="sub">Thinking it through…</span>
        </div>
      )
      : (
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <p className="sub" style={{ margin: 0 }}>{options.length === 0 ? 'This plan has no options yet.' : 'Could not get a suggestion right now.'}</p>
          {options.length > 0 && <button className="btn" onClick={() => void generate()}>Try again</button>}
          {back}
        </div>
      ));
  }

  const option = options[advice.option_index];
  if (!option) {
    return shell(<div className="card sub">This suggestion no longer matches the options. <button className="link" onClick={() => void generate()}>Get a new one</button></div>);
  }
  const mon = monthName(advice.month);
  const hasSettingChange = advice.changes.some((c) => c.type !== 'postpone');
  const cuts = adviceCutsMinor(advice.changes);
  const emergencySaved = data.emergency?.savedMinor ?? 0;
  const after = emergencyAfterMinor({
    option, remainingMinor: planning.remainingMinor, setAsideMinor: planning.setAsideMinor, currentMonth,
    plannedMonth: advice.month, cutsMinor: cuts, emergencySavedMinor: emergencySaved,
  });
  const months = monthsCovered(after, planning.avgExpensesMinor);
  const untouched = after >= emergencySaved;
  const oneMonth = mode === 'month';
  const suffix = oneMonth ? ', once' : ', from now on';

  async function apply() {
    if (!advice || !option) return;
    setBusy(true);
    setError('');
    try {
      const { settingsPatch, categoryPatches } = planApply({ changes: advice.changes, mode, month: advice.month, settings });
      if (Object.keys(settingsPatch).length > 0) await updateSettings(settingsPatch);
      for (const p of categoryPatches) await updateCategory(p.id, { monthly_budget_minor: p.monthly_budget_minor });
      await updatePlan(plan.id, { status: 'decided', selected_option_id: option.id, planned_month: advice.month });
    } catch {
      setError('Could not apply the changes. Try again.');
      setBusy(false);
      return;
    }
    // Stay busy until the reloaded plan shows the change.
    setAwaiting(() => (p: PurchasePlan) => p.status === 'decided' && p.selected_option_id === option.id && p.planned_month === advice.month);
    void reload();
  }

  const changeRow = (c: AdviceChange, i: number) => {
    let icon: IconName = 'info', tone = 'var(--ai)', title = '', detail = '';
    if (c.type === 'category_budget') {
      const cat = categories.find((x) => x.id === c.category_id);
      icon = (cat?.icon as IconName | undefined) ?? 'dots'; tone = 'var(--accent)';
      title = `${c.category_name} budget`;
      detail = `${c.from_minor === null ? 'No limit' : hufNum(c.from_minor)} → ${huf(c.to_minor)}${oneMonth ? `, ${mon}` : ', from now on'}`;
    } else if (c.type === 'savings_target') {
      icon = 'piggy'; tone = 'var(--good)';
      title = `${mon} savings`;
      detail = `${hufNum(c.from_minor)} → ${huf(c.to_minor)}${suffix}`;
    } else {
      icon = 'clock';
      title = `Buy in ${monthYear(c.month)}`;
    }
    return (
      <div className="change" key={i}>
        <span className="ci" style={{ ['--c' as string]: tone }}><Icon name={icon} /></span>
        <div><strong>{title}</strong>{detail && <span className="num">{detail}</span>}</div>
      </div>
    );
  };

  return shell(
    <>
      <div className="aibox">
        <span className="who"><Icon name="spark" />Assistant</span>
        <p>{advice.summary}</p>
        {advice.others && <p className="sub" style={{ margin: 0 }}>{advice.others}</p>}
      </div>
      <div className="sec">
        <span className="ov">Changes for {mon}</span>
        <div className="list">
          {advice.changes.map(changeRow)}
          <div className="change">
            <span className="ci" style={{ ['--c' as string]: 'var(--ai)' }}><Icon name="shield" /></span>
            <div>
              <strong>Emergency fund after</strong>
              <span>{months === null ? '—' : `${months} months of expenses`}</span>
            </div>
            <span className={`pill ${untouched ? 'good' : ''}`}>{untouched ? 'OK' : 'Uses savings'}</span>
          </div>
        </div>
      </div>
      {hasSettingChange && !applied && (
        <div className="seg">
          <button type="button" className={oneMonth ? 'on' : ''} disabled={busy} onClick={() => setMode('month')}>Just for {mon}</button>
          <button type="button" className={!oneMonth ? 'on' : ''} disabled={busy} onClick={() => setMode('permanent')}>From now on</button>
        </div>
      )}
      {applied ? (
        <>
          <Link className="btn ghost" to="/plan"><Icon name="check" />Applied · back to plans</Link>
          <p className="sub" role="status" style={{ margin: 0 }}>Changes applied.</p>
        </>
      ) : (
        <>
          <button className="btn" disabled={busy || loading} onClick={() => void apply()}><Icon name="check" />{busy ? 'Applying…' : 'Apply changes'}</button>
          <button className="btn ghost" disabled={busy || loading} onClick={() => void generate()}>{loading ? 'Thinking it through…' : 'Get a new suggestion'}</button>
        </>
      )}
      {failedCall && <p className="err" role="alert">Could not get a suggestion right now.</p>}
      {error && <p className="err" role="alert">{error}</p>}
      <p className="note"><Icon name="info" />The assistant suggests. Numbers come from your own data, and nothing changes until you tap Apply.</p>
    </>,
  );
}
