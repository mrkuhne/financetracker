import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { runMaterialize } from '@/app/runMaterialize';
import { createRule } from '@/data/recurring';
import { createTransaction } from '@/data/transactions';
import { updatePlan } from '@/data/purchasePlans';
import { simulateOption } from '@/domain/planning';
import type { PurchaseOption, YearMonth } from '@/domain/types';
import { huf } from '@/features/home/fmt';
import { Icon } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import { notifyTxnsChanged } from '@/features/transactions/events';
import { planPurchaseRecord } from './purchaseRecord';
import { optionLetter, usePlanData } from './usePlanData';

const monthName = (ym: YearMonth) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(Date.parse(`${ym}-01T12:00:00Z`));
const monthYear = (ym: YearMonth) =>
  new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${ym}-01T12:00:00Z`));

type Mode = 'idle' | 'bought' | 'drop';

export function PlanImpactScreen() {
  const { id } = useParams();
  const { data, failed, reload } = usePlanData();
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Ids written by an attempt whose plan update failed, so a retry links them instead of creating again.
  const written = useRef<{ transaction_id?: string; recurring_rule_id?: string } | null>(null);

  useEffect(() => { setPicked(undefined); setMode('idle'); setError(''); written.current = null; }, [id]);

  const plan = data?.plans.find((p) => p.id === id);
  if (!data || !plan) {
    return (
      <Screen title="Purchase" back="/plan">
        {failed
          ? <div className="card sub">Could not load this plan. <button className="link" onClick={() => void reload()}>Retry</button></div>
          : data
            ? <div className="card sub">This plan no longer exists.</div>
            : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      </Screen>
    );
  }

  const options = data.options.filter((o) => o.plan_id === plan.id).sort((a, b) => a.position - b.position);
  const { planning } = data;
  const currentMonth = planning.month;
  const stored = options.some((o) => o.id === plan.selected_option_id) ? plan.selected_option_id : null;
  const selectedId = picked !== undefined && (picked === null || options.some((o) => o.id === picked)) ? picked : stored;
  const selected: PurchaseOption | undefined = options.find((o) => o.id === selectedId);
  const selectedIdx = selected ? options.indexOf(selected) : -1;
  const open = plan.status === 'considering' || plan.status === 'decided';
  const impactOf = (o: PurchaseOption) =>
    simulateOption({ option: o, remainingMinor: planning.remainingMinor, setAsideMinor: planning.setAsideMinor, currentMonth });

  async function run(fn: () => Promise<void>, failMsg: string) {
    setBusy(true);
    setError('');
    try {
      await fn();
      setMode('idle');
      setPicked(undefined);
      reload();
    } catch {
      setError(failMsg);
    }
    setBusy(false);
  }

  const choose = () => selected && run(
    () => updatePlan(plan.id, { status: 'decided', selected_option_id: selected.id, planned_month: impactOf(selected).safeMonth ?? currentMonth }).then(() => undefined),
    'Could not save. Try again.',
  );

  const markBought = (record: boolean) => run(async () => {
    if (!selected) return;
    if (!record) {
      await updatePlan(plan.id, { status: 'bought' });
      return;
    }
    const r = planPurchaseRecord({ plan, option: selected, accounts: data.home.accounts, categories: data.categories, today: data.home.today });
    if (r.kind === 'error') throw new Error(r.reason);
    if (!written.current) {
      written.current = r.kind === 'txn'
        ? { transaction_id: (await createTransaction(r.txn)).id }
        : { recurring_rule_id: (await createRule(r.rule)).id };
    }
    await updatePlan(plan.id, { status: 'bought', ...written.current });
    written.current = null;
    if (r.kind === 'rule') await runMaterialize(data.home.today).catch(() => undefined);
    notifyTxnsChanged();
  }, 'Could not save. Try again.');

  // Show the specific refusal for a record that cannot be made, without touching the data layer.
  const recordPreview = selected && open
    ? planPurchaseRecord({ plan, option: selected, accounts: data.home.accounts, categories: data.categories, today: data.home.today })
    : null;
  const recordError = recordPreview?.kind === 'error'
    ? (recordPreview.reason === 'no_account' ? 'Add a HUF account first.' : 'Already recorded.')
    : '';
  const isRule = selected?.payment === 'installments';

  const right = <Link to={`/plan/${plan.id}/edit`} className="ib soft" aria-label="Edit purchase"><Icon name="edit" /></Link>;

  return (
    <Screen title={plan.title} back="/plan" right={right}>
      <div className="steps"><i className="on" /><i className="on" /><i /></div>
      <p className="sub" style={{ margin: 0 }}>
        If you buy now, from the <b className="num">{huf(planning.remainingMinor)}</b> left in {monthName(currentMonth)}:
      </p>
      {options.map((o, i) => {
        const m = impactOf(o);
        const cls = m.leftThisMonthMinor >= 0 ? 'pos' : m.leftThisMonthMinor > -6_000_000 ? 'warnc' : 'neg';
        return (
          <div key={o.id} role="button" tabIndex={0} aria-pressed={o.id === selectedId} className={`opt${o.id === selectedId ? ' sel' : ''}`}
            style={{ cursor: open ? 'pointer' : 'default' }}
            onClick={() => open && setPicked(o.id)}
            onKeyDown={(e) => { if (open && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setPicked(o.id); } }}>
            <div className="top">
              <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <strong>{optionLetter(i)} · {o.name}</strong>
                {o.payment === 'installments' && <span className="sub num">{huf(o.installment_minor ?? 0)} × {o.installment_count}</span>}
              </span>
              <b className="num">{huf(o.price_minor)}</b>
            </div>
            <div className="kv">
              <span>Left this month</span><b className={`num ${cls}`}>{huf(m.leftThisMonthMinor)}</b>
              <span>Savings this month</span>
              <b className={m.touchesSavingsMinor === 0 ? 'pos' : 'warnc'}>{m.touchesSavingsMinor === 0 ? 'Untouched' : `Needs ${huf(m.touchesSavingsMinor)}`}</b>
              <span>Safe to buy</span>
              <b>{m.safeMonth === null ? 'Not within 2 years' : m.safeMonth === currentMonth ? 'Now' : `From ${monthYear(m.safeMonth)}`}</b>
            </div>
            {o.link && (
              <a className="link" href={o.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>Open link</a>
            )}
          </div>
        );
      })}
      <p className="note"><Icon name="info" />“Safe to buy” sets aside {huf(planning.setAsideMinor)} a month and keeps your emergency fund untouched.</p>

      {open ? (
        <>
          <Link className="btn ai" to={`/plan/${plan.id}/advice`}><Icon name="spark" />Which one should I pick?</Link>
          <button className="btn ghost" disabled={!selected || busy} onClick={() => void choose()}>
            {selected ? `Choose ${optionLetter(selectedIdx)}` : 'Choose an option'}
          </button>
        </>
      ) : (
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className={`pill ${plan.status === 'bought' ? 'good' : ''}`}>{plan.status === 'bought' ? 'Bought' : 'Dropped'}</span>
          <button className="btn ghost" style={{ width: 'auto', padding: '0 18px' }} disabled={busy}
            onClick={() => void run(() => updatePlan(plan.id, { status: 'considering' }).then(() => undefined), 'Could not save. Try again.')}>Reopen</button>
        </div>
      )}

      {plan.status === 'decided' && selected && (
        mode === 'bought' ? (
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            <strong>{plan.title} · {selected.name}</strong>
            {recordError
              ? <p className="err" role="alert">{recordError}</p>
              : <button className="btn" disabled={busy} onClick={() => void markBought(true)}>{isRule ? 'Add the monthly payment' : 'Add the expense'}</button>}
            <button className="btn ghost" disabled={busy} onClick={() => void markBought(false)}>It's already in Activity</button>
            <button className="btn ghost" disabled={busy} onClick={() => setMode('idle')}>Cancel</button>
          </div>
        ) : (
          <button className="btn" disabled={busy} onClick={() => { setError(''); setMode('bought'); }}>Mark as bought</button>
        )
      )}

      {open && (
        mode === 'drop' ? (
          <div className="row2">
            <button className="btn ghost" disabled={busy} onClick={() => setMode('idle')}>Keep it</button>
            <button className="btn" disabled={busy} style={{ background: 'var(--bad)', color: '#fff' }}
              onClick={() => void run(() => updatePlan(plan.id, { status: 'dropped' }).then(() => undefined), 'Could not save. Try again.')}>Drop plan</button>
          </div>
        ) : (
          <button className="btn ghost" disabled={busy} onClick={() => { setError(''); setMode('drop'); }}>Drop this plan</button>
        )
      )}
      {error && <p className="err" role="alert">{error}</p>}
    </Screen>
  );
}
