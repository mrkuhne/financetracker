import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createGoal, deleteGoal, updateGoal } from '@/data/savingsGoals';
import { updateSettings } from '@/data/settings';
import { savingsTargetFor } from '@/domain/allowance';
import { monthsCovered, monthsToReach, type GoalProgress } from '@/domain/savings';
import { huf, hufNum } from '@/features/home/fmt';
import { Icon } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import { CatIcon } from '@/features/transactions/CatIcon';
import { parseAmountInput } from '@/lib/amountInput';
import { upcomingOverrides } from './budgets';
import { usePlanData, type PlanData } from './usePlanData';

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(`${iso}T12:00:00Z`));

const monthYear = (ym: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.parse(`${ym}-01T12:00:00Z`));

interface Draft { name: string; targetText: string; accountId: string }

export function SavingsScreen() {
  const { data, failed, reload } = usePlanData();
  const [editing, setEditing] = useState<string | null>(null); // goal id, 'new', or null
  const [draft, setDraft] = useState<Draft>({ name: '', targetText: '', accountId: '' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [overrideError, setOverrideError] = useState('');
  const [awaiting, setAwaiting] = useState<((d: PlanData) => boolean) | null>(null);

  useEffect(() => {
    if (!awaiting || !data) return;
    if (awaiting(data)) { setAwaiting(null); setBusy(false); setEditing(null); setConfirming(false); return; }
    // If the reload never shows the change, stop blocking the screen.
    const t = setTimeout(() => { setAwaiting(null); setBusy(false); setEditing(null); setConfirming(false); }, 8000);
    return () => clearTimeout(t);
  }, [awaiting, data]);

  if (!data) {
    return (
      <Screen title="Savings" back="/plan">
        {failed
          ? <div className="card sub">Could not load your savings. <button className="link" onClick={() => void reload()}>Retry</button></div>
          : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      </Screen>
    );
  }

  const { settings, txns } = data.home;
  const month = data.planning.month;
  const savingsAccounts = data.home.model.accounts.filter((a) => a.account.type === 'savings');
  const targetAccount = savingsAccounts.find((a) => a.account.is_savings_target) ?? null;
  const balanceMinor = targetAccount ? targetAccount.balanceHufMinor : savingsAccounts.reduce((s, a) => s + a.balanceHufMinor, 0);
  const defaultAccountId = (targetAccount ?? savingsAccounts[0])?.account.id ?? '';
  const planned = savingsTargetFor(settings, month);
  const savingsIds = new Set(savingsAccounts.map((a) => a.account.id));
  const accountName = (id: string) => data.home.accounts.find((a) => a.id === id)?.name ?? '';
  const history = txns
    .filter((t) => t.kind === 'transfer_in' && savingsIds.has(t.account_id))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 10);
  const overrides = upcomingOverrides(settings, data.categories, month);

  async function run(fn: () => Promise<unknown>, expect: (d: PlanData) => boolean) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch {
      setError('Could not save. Try again.');
      setBusy(false);
      return;
    }
    setAwaiting(() => expect);
    void reload();
  }

  async function resetMonth(ym: string) {
    setBusy(true);
    setOverrideError('');
    try {
      const { [ym]: _removed, ...rest } = settings.month_overrides ?? {};
      await updateSettings({ month_overrides: rest });
    } catch {
      setOverrideError('Could not reset this month. Try again.');
      setBusy(false);
      return;
    }
    setAwaiting(() => (d: PlanData) => !(ym in (d.home.settings.month_overrides ?? {})));
    void reload();
  }

  function startNew() {
    setEditing('new');
    setDraft({ name: '', targetText: '', accountId: defaultAccountId });
    setConfirming(false);
    setError('');
  }
  function startEdit(p: GoalProgress) {
    setEditing(p.goal.id);
    setDraft({
      name: p.goal.name,
      targetText: p.goal.target_minor === null ? '' : String(p.goal.target_minor / 100),
      accountId: savingsIds.has(p.goal.account_id) ? p.goal.account_id : defaultAccountId,
    });
    setConfirming(false);
    setError('');
  }

  function setUpEmergency() {
    void run(
      () => createGoal({ name: 'Emergency fund', kind: 'emergency', target_minor: null, account_id: defaultAccountId, priority: 1, icon: 'shield' }),
      (d) => d.emergency !== null,
    );
  }

  function saveGoal(existing: GoalProgress | null) {
    const name = draft.name.trim();
    const isEmergency = existing?.goal.kind === 'emergency';
    const target = parseAmountInput(draft.targetText);
    if (!name) return setError('Give the goal a name.');
    if (!isEmergency && (target === null || target <= 0)) return setError('Enter a target amount.');
    if (!draft.accountId) return setError('Choose an account.');
    if (existing) {
      const id = existing.goal.id;
      const patch = { name, account_id: draft.accountId, ...(isEmergency ? {} : { target_minor: target }) };
      void run(() => updateGoal(id, patch), (d) => {
        const g = d.goals.find((x) => x.id === id);
        return !!g && g.name === name && g.account_id === draft.accountId && (isEmergency || g.target_minor === target);
      });
    } else {
      const known = new Set(data!.goals.map((g) => g.id));
      const priority = Math.max(0, ...data!.goals.map((g) => g.priority)) + 1;
      void run(
        () => createGoal({ name, kind: 'custom', target_minor: target, account_id: draft.accountId, priority, icon: 'piggy' }),
        (d) => d.goals.some((g) => !known.has(g.id)),
      );
    }
  }

  function removeGoal(id: string) {
    void run(() => deleteGoal(id), (d) => !d.goals.some((g) => g.id === id));
  }

  const form = (existing: GoalProgress | null) => {
    const isEmergency = existing?.goal.kind === 'emergency';
    return (
      <div className="list">
        <label className="field">
          <span>Name</span>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Summer trip" maxLength={60} />
        </label>
        {!isEmergency && (
          <label className="field">
            <span>Target (Ft)</span>
            <input value={draft.targetText} onChange={(e) => setDraft({ ...draft, targetText: e.target.value })} inputMode="decimal" placeholder="0" aria-label="Goal target" />
          </label>
        )}
        <label className="field">
          <span>Account</span>
          <select value={draft.accountId} onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}>
            {savingsAccounts.map((a) => <option key={a.account.id} value={a.account.id}>{a.account.name}</option>)}
          </select>
        </label>
        <div className="field">
          <button type="button" className="link" disabled={busy} onClick={() => saveGoal(existing)}>Save</button>
          <button type="button" className="link" disabled={busy} onClick={() => { setEditing(null); setConfirming(false); setError(''); }}>Cancel</button>
          {existing && (confirming
            ? <button type="button" className="link neg" disabled={busy} onClick={() => removeGoal(existing.goal.id)}>Delete for good?</button>
            : <button type="button" className="link neg" disabled={busy} onClick={() => setConfirming(true)}>Delete</button>)}
        </div>
      </div>
    );
  };

  return (
    <Screen title="Savings" back="/plan">
      <div className="card">
        <span className="ov">Savings account</span>
        <div className="big num" style={{ fontSize: 52, marginTop: 6 }}>{hufNum(balanceMinor)}<small>Ft</small></div>
        <div className="sub">+{huf(planned)} planned every month</div>
      </div>

      <div className="sec">
        <div className="sechd">
          <h2>Goals</h2>
          {savingsAccounts.length > 0 && editing !== 'new' && (
            <button type="button" className="ib soft" aria-label="Add goal" onClick={startNew}><Icon name="plus" /></button>
          )}
        </div>
        {data.goalProgress.length > 0 && (
          <div className="list">
            {data.goalProgress.map((p) => {
              const isEmergency = p.goal.kind === 'emergency';
              const label = isEmergency
                ? `${monthsCovered(p.savedMinor, data.planning.avgExpensesMinor) ?? '—'} / ${settings.emergency_fund_months} months`
                : `${huf(p.savedMinor)} / ${huf(p.targetMinor)}`;
              const eta = isEmergency && p.targetMinor > p.savedMinor ? monthsToReach(p.targetMinor - p.savedMinor, planned) : null;
              return (
                <div key={p.goal.id}>
                  <button type="button" className="li" style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: 12 }} onClick={() => startEdit(p)} aria-label={`Edit ${p.goal.name}`}>
                    <CatIcon icon={p.goal.icon as Parameters<typeof CatIcon>[0]['icon']} />
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong style={{ fontWeight: 500 }}>{p.goal.name}</strong>
                        <span className="num sub">{label}</span>
                      </div>
                      <div className="bar"><b style={{ width: `${p.ratio * 100}%`, background: isEmergency ? 'var(--good)' : undefined }} /></div>
                      {eta !== null && <span className="sub">At {huf(planned)} a month you reach it in about {eta} months.</span>}
                    </div>
                  </button>
                  {editing === p.goal.id && form(p)}
                </div>
              );
            })}
          </div>
        )}
        {editing === 'new' && form(null)}
        {!data.emergency && (savingsAccounts.length > 0
          ? <button type="button" className="btn" disabled={busy} onClick={setUpEmergency}>Set up emergency fund</button>
          : <div className="card sub">Add a savings account first. <Link className="link" to="/accounts">Go to accounts</Link></div>)}
        {error && <p className="err" role="alert">{error}</p>}
      </div>

      {overrides.length > 0 && (
        <div className="sec">
          <div className="sechd"><h2>Changes for one month</h2></div>
          <div className="list">
            {overrides.map((o) => (
              <div className="li" key={o.month}>
                <span className="tx">
                  <strong>{monthYear(o.month)}</strong>
                  {o.savingsTargetMinor !== null && <span className="num">· Savings {huf(o.savingsTargetMinor)}</span>}
                  {o.categories.map((c) => <span className="num" key={c.id}>· {c.name} budget {huf(c.budgetMinor)}</span>)}
                </span>
                <button type="button" className="btn ghost" style={{ width: 'auto', height: 36, padding: '0 14px', fontSize: 13 }}
                  disabled={busy} onClick={() => void resetMonth(o.month)} aria-label={`Reset ${monthYear(o.month)}`}>Reset</button>
              </div>
            ))}
          </div>
          {overrideError && <p className="err" role="alert">{overrideError}</p>}
        </div>
      )}

      {history.length > 0 && (
        <div className="sec">
          <div className="sechd"><h2>History</h2></div>
          <div className="list">
            {history.map((t) => (
              <div className="li" key={t.id}>
                <CatIcon icon="swap" />
                <span className="tx"><strong>{t.note || 'Monthly saving'}</strong><span>{accountName(t.account_id)} · {shortDate(t.date)}</span></span>
                <span className="amt num pos">+{huf(t.amount_huf_minor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Screen>
  );
}
