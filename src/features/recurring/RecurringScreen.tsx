import { useCallback, useEffect, useState } from 'react';
import { Screen } from '@/features/shell/Screen';
import { Icon } from '@/features/shell/Icons';
import { CatIcon } from '@/features/transactions/CatIcon';
import { notifyTxnsChanged } from '@/features/transactions/events';
import { listAccounts } from '@/data/accounts';
import { listCategories, type Category } from '@/data/categories';
import { createRule, deleteRule, listRules, updateRule } from '@/data/recurring';
import { getHufPerUnit } from '@/data/fx';
import { getSettings } from '@/data/settings';
import { runMaterialize } from '@/app/runMaterialize';
import { todayInTz } from '@/domain/dates';
import { formatMoney, toHufMinor } from '@/domain/money';
import type { Account, RecurringRule } from '@/domain/types';
import { RecurringSheet, type RuleDraft } from './RecurringSheet';
import { frequencyLabel, monthlyHufMinor, rulePatchForEdit, rulePatchForToggle } from './recurringMath';

type Editing = { rule?: RecurringRule } | null;

export function RecurringScreen() {
  const [rules, setRules] = useState<RecurringRule[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [today, setToday] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [r, a, c, s] = await Promise.all([listRules(), listAccounts(), listCategories(), getSettings()]);
      setRules(r);
      setAccounts(a);
      setCategories(c);
      setToday(todayInTz(s.timezone));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(draft: RuleDraft, existing?: RecurringRule) {
    setNotice('');
    const rate = await getHufPerUnit(draft.currency, today);
    const fields = { ...draft, amount_huf_minor: toHufMinor(draft.amount_minor, rate) };
    try {
      if (existing) {
        await updateRule(existing.id, rulePatchForEdit(fields));
      } else {
        await createRule({ ...fields, last_materialized_date: null, active: true });
      }
    } catch (e) {
      await load();
      throw e;
    }
    // The rule is persisted: close the sheet. Materialization failures are reported separately.
    setEditing(null);
    if (draft.start_date <= today) {
      try {
        if ((await runMaterialize(today)) > 0) notifyTxnsChanged();
      } catch {
        setNotice('Saved. Past entries will be added next time you open the app.');
      }
    }
    await load();
  }

  async function toggle(r: RecurringRule) {
    try {
      await updateRule(r.id, rulePatchForToggle(r, todayInTz((await getSettings()).timezone)));
    } finally {
      await load();
    }
  }

  async function remove(r: RecurringRule) {
    try {
      await deleteRule(r.id);
      setEditing(null);
    } finally {
      await load();
    }
  }

  const income = (rules ?? []).filter((r) => r.kind === 'income');
  const expense = (rules ?? []).filter((r) => r.kind === 'expense');
  const total = (list: RecurringRule[]) => list.filter((r) => r.active).reduce((s, r) => s + monthlyHufMinor(r), 0);

  const row = (r: RecurringRule) => {
    const acct = accounts.find((a) => a.id === r.account_id)?.name;
    return (
      <div key={r.id} className="li" style={r.active ? undefined : { opacity: 0.55 }}>
        <button style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, textAlign: 'left' }} onClick={() => setEditing({ rule: r })}>
          <CatIcon category={categories.find((c) => c.id === r.category_id)} />
          <span className="tx">
            <strong>{r.name}</strong>
            <span>{[frequencyLabel(r), acct, r.active ? null : 'Paused'].filter(Boolean).join(' · ')}</span>
          </span>
          <span className={`amt num ${r.kind === 'income' ? 'pos' : ''}`}>
            {r.kind === 'income' ? '+' : '−'}
            {formatMoney(r.amount_minor, r.currency)}
          </span>
        </button>
        <button className={`sw${r.active ? ' on' : ''}`} role="switch" aria-checked={r.active} aria-label={`${r.name} active`} onClick={() => void toggle(r)} />
      </div>
    );
  };

  return (
    <Screen
      title="Recurring"
      back="/transactions"
      right={
        <button className="ib soft" aria-label="New rule" onClick={() => setEditing({})} disabled={!today}>
          <Icon name="plus" />
        </button>
      }
    >
      {failed && (
        <div className="card sub">
          Could not load recurring rules.{' '}
          <button className="link" style={{ color: 'var(--accent)', fontWeight: 600 }} onClick={() => void load()}>Retry</button>
        </div>
      )}
      {notice && <div className="card sub" role="status">{notice}</div>}
      {rules === null && !failed && <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      {rules !== null && (
        <>
          <div className="row2">
            <div className="card">
              <span className="ov">In / month</span>
              <div className="mid num pos" style={{ fontSize: 26, marginTop: 6 }}>{formatMoney(total(income), 'HUF')}</div>
            </div>
            <div className="card">
              <span className="ov">Out / month</span>
              <div className="mid num" style={{ fontSize: 26, marginTop: 6 }}>{formatMoney(total(expense), 'HUF')}</div>
            </div>
          </div>
          {rules.length === 0 && <div className="card sub">No recurring rules yet. Tap + to add your salary or a bill.</div>}
          {income.length > 0 && (
            <div className="sec"><span className="ov">Income</span><div className="list">{income.map(row)}</div></div>
          )}
          {expense.length > 0 && (
            <div className="sec"><span className="ov">Expenses</span><div className="list">{expense.map(row)}</div></div>
          )}
          <p className="note"><Icon name="info" />These show up on their day by themselves and are already part of your monthly plan.</p>
        </>
      )}
      {editing && (
        <RecurringSheet
          rule={editing.rule}
          accounts={accounts}
          categories={categories}
          today={today}
          onSave={(d) => save(d, editing.rule)}
          onDelete={editing.rule ? () => remove(editing.rule!) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </Screen>
  );
}
