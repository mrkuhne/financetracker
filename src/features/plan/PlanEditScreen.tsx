import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createOption, createPlan, deleteOption, deletePlan, getPlan, listOptionsForPlan, updateOption, updatePlan } from '@/data/purchasePlans';
import { Icon } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import type { PurchaseOption, PurchasePlan } from '@/domain/types';
import { diffOptions, draftFromPlan, MAX_OPTIONS, validatePlanDraft, type OptionDraft, type PlanDraft } from './planDraft';
import { optionLetter } from './usePlanData';

const blankOption = (): OptionDraft => ({ name: '', priceText: '', payment: 'one_time', installmentText: '', countText: '', link: '', note: '' });

export function PlanEditScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const [existing, setExisting] = useState<{ plan: PurchasePlan; options: PurchaseOption[] } | null>(null);
  const [draft, setDraft] = useState<PlanDraft | null>(id ? null : { title: '', needed_by: null, options: [blankOption()] });
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!id) return;
    let live = true;
    void (async () => {
      try {
        const [plan, options] = await Promise.all([getPlan(id), listOptionsForPlan(id)]);
        if (!live) return;
        if (!plan) return setLoadFailed(true);
        setExisting({ plan, options });
        setDraft(draftFromPlan(plan, options));
      } catch {
        if (live) setLoadFailed(true);
      }
    })();
    return () => { live = false; };
  }, [id]);

  const back = id ? `/plan/${id}` : '/plan';
  const title = id ? 'Edit purchase' : 'New purchase';
  if (!draft) {
    return (
      <Screen title={title} back={back}>
        {loadFailed ? <div className="card sub">Could not load this plan.</div> : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      </Screen>
    );
  }

  const setOpt = (i: number, patch: Partial<OptionDraft>) =>
    setDraft({ ...draft, options: draft.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  async function save() {
    if (!draft) return;
    const v = validatePlanDraft(draft);
    if (!v.ok) return setError(v.error);
    setBusy(true);
    setError('');
    try {
      let planId = existing?.plan.id;
      if (existing) {
        await updatePlan(existing.plan.id, { title: v.title, needed_by: v.needed_by });
      } else {
        planId = (await createPlan({
          title: v.title, needed_by: v.needed_by, status: 'considering', selected_option_id: null,
          planned_month: null, transaction_id: null, recurring_rule_id: null, advice: null,
        })).id;
      }
      const pid = planId as string;
      const d = diffOptions(existing?.options ?? [], v.options);
      await Promise.all([
        ...d.create.map(({ id: _unused, ...o }) => createOption({ ...o, plan_id: pid })),
        ...d.update.map(({ id: oid, ...o }) => updateOption(oid, o)),
        ...d.remove.map((oid) => deleteOption(oid)),
      ]);
      nav(`/plan/${pid}`);
    } catch {
      setError('Could not save. Try again.');
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    setError('');
    try {
      await deletePlan(existing.plan.id);
      nav('/plan');
    } catch {
      setError('Could not delete. Try again.');
      setBusy(false);
    }
  }

  return (
    <Screen title={title} back={back}>
      <div className="steps"><i className="on" /><i /><i /></div>
      <div className="list">
        <label className="field">
          <span>What</span>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Couch" maxLength={60} />
        </label>
        <label className="field">
          <span>Needed by (optional)</span>
          <input type="date" value={draft.needed_by ?? ''} onChange={(e) => setDraft({ ...draft, needed_by: e.target.value || null })} />
        </label>
      </div>
      <div className="sec">
        <span className="ov">Options</span>
        {draft.options.map((o, i) => (
          <div className="opt" key={o.id ?? i}>
            <div className="top">
              <strong>Option {optionLetter(i)}</strong>
              <button type="button" className="link" onClick={() => setDraft({ ...draft, options: draft.options.filter((_, j) => j !== i) })}>Remove</button>
            </div>
            <div className="list">
              <label className="field">
                <span>Name</span>
                <input value={o.name} onChange={(e) => setOpt(i, { name: e.target.value })} placeholder="e.g. IKEA Kivik" maxLength={60} />
              </label>
              <label className="field">
                <span>Price (Ft)</span>
                <input value={o.priceText} onChange={(e) => setOpt(i, { priceText: e.target.value })} inputMode="decimal" placeholder="0" aria-label={`Option ${optionLetter(i)} price`} />
              </label>
            </div>
            <div className="seg">
              {([['one_time', 'All at once'], ['installments', 'Installments']] as const).map(([k, label]) => (
                <button key={k} type="button" className={o.payment === k ? 'on' : ''} onClick={() => setOpt(i, { payment: k })}>{label}</button>
              ))}
            </div>
            <div className="list">
              {o.payment === 'installments' && (
                <>
                  <label className="field">
                    <span>Monthly payment (Ft)</span>
                    <input value={o.installmentText} onChange={(e) => setOpt(i, { installmentText: e.target.value })} inputMode="decimal" placeholder="0" />
                  </label>
                  <label className="field">
                    <span>Months</span>
                    <input value={o.countText} onChange={(e) => setOpt(i, { countText: e.target.value })} inputMode="numeric" placeholder="12" />
                  </label>
                </>
              )}
              <label className="field">
                <span>Link</span>
                <input value={o.link} onChange={(e) => setOpt(i, { link: e.target.value })} inputMode="url" placeholder="https://" autoCapitalize="none" />
              </label>
              <label className="field">
                <span>Note</span>
                <input value={o.note} onChange={(e) => setOpt(i, { note: e.target.value })} placeholder="Optional" />
              </label>
            </div>
          </div>
        ))}
        {draft.options.length < MAX_OPTIONS && (
          <button type="button" className="chip" style={{ justifySelf: 'start' }} onClick={() => setDraft({ ...draft, options: [...draft.options, blankOption()] })}>
            <Icon name="plus" />Add option
          </button>
        )}
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <button className="btn" disabled={busy} onClick={() => void save()}>See what it does to my money</button>
      {existing &&
        (confirming ? (
          <div className="row2">
            <button className="btn ghost" disabled={busy} onClick={() => setConfirming(false)}>Keep it</button>
            <button className="btn" disabled={busy} style={{ background: 'var(--bad)', color: '#fff' }} onClick={() => void remove()}>Delete plan</button>
          </div>
        ) : (
          <button className="btn ghost" disabled={busy} onClick={() => setConfirming(true)}>Delete plan</button>
        ))}
    </Screen>
  );
}
