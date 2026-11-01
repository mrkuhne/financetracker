import { useState } from 'react';
import type { Category } from '@/data/categories';
import { fromMinor } from '@/domain/money';
import type { Account, RecurringRule } from '@/domain/types';
import { parseAmountInput } from '@/lib/amountInput';
import { CURRENCIES } from '@/features/accounts/AccountSheet';

export interface RuleDraft {
  name: string;
  kind: 'expense' | 'income';
  amount_minor: number;
  currency: string;
  category_id: string | null;
  account_id: string;
  frequency: RecurringRule['frequency'];
  start_date: string;
  end_date: string | null;
}

const FREQ: RecurringRule['frequency'][] = ['weekly', 'monthly', 'yearly'];

/** Bottom sheet to create or edit a recurring rule. */
export function RecurringSheet({ rule, accounts, categories, today, onSave, onDelete, onClose }: {
  rule?: RecurringRule;
  accounts: Account[];
  categories: Category[];
  today: string;
  onSave: (d: RuleDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const defaultAccount = accounts.find((a) => a.is_default) ?? accounts[0];
  const [name, setName] = useState(rule?.name ?? '');
  const [kind, setKind] = useState<'expense' | 'income'>(rule?.kind ?? 'expense');
  const [amount, setAmount] = useState(rule ? String(fromMinor(rule.amount_minor)) : '');
  const [currency, setCurrency] = useState(rule?.currency ?? defaultAccount?.currency ?? 'HUF');
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? '');
  const [accountId, setAccountId] = useState(rule?.account_id ?? defaultAccount?.id ?? '');
  const [frequency, setFrequency] = useState<RecurringRule['frequency']>(rule?.frequency ?? 'monthly');
  const [start, setStart] = useState(rule?.start_date ?? today);
  const [end, setEnd] = useState(rule?.end_date ?? '');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cats = categories.filter((c) => c.kind === kind);
  const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [...CURRENCIES, currency];

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch {
      setError('Could not save. Try again.');
      setBusy(false);
    }
  }

  function save() {
    const amountMinor = parseAmountInput(amount);
    if (!name.trim()) return setError('Give the rule a name.');
    if (!amountMinor || amountMinor <= 0) return setError('Enter an amount above zero.');
    if (!accountId) return setError('Pick an account.');
    if (!start) return setError('Pick a start date.');
    if (end && end < start) return setError('The end date is before the start date.');
    void run(() =>
      onSave({
        name: name.trim(), kind, amount_minor: amountMinor, currency, category_id: categoryId || null,
        account_id: accountId, frequency, start_date: start, end_date: end || null,
      }),
    );
  }

  return (
    <>
      <div className="scrim" onClick={() => !busy && onClose()} />
      <div className="sheet" role="dialog" aria-label={rule ? 'Edit rule' : 'New rule'}>
        <span className="grab" />
        <div className="seg">
          {(['expense', 'income'] as const).map((k) => (
            <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setCategoryId(''); }}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        <div className="list">
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Salary" maxLength={40} />
          </label>
          <label className="field">
            <span>Amount</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Amount" />
          </label>
          <label className="field">
            <span>Currency</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Category</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorised</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Account</span>
            <select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                const a = accounts.find((x) => x.id === e.target.value);
                if (a) setCurrency(a.currency);
              }}
            >
              {accounts.filter((a) => !a.archived || a.id === rule?.account_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        <div className="sec">
          <span className="ov">Repeats</span>
          <div className="seg">
            {FREQ.map((f) => (
              <button key={f} type="button" className={frequency === f ? 'on' : ''} onClick={() => setFrequency(f)}>
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="list">
          <label className="field">
            <span>Starts</span>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            <span>Ends (optional)</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn" disabled={busy} onClick={save}>{rule ? 'Save changes' : 'Add rule'}</button>
        {rule && onDelete &&
          (confirming ? (
            <div className="row2">
              <button className="btn ghost" disabled={busy} onClick={() => setConfirming(false)}>Keep it</button>
              <button className="btn" disabled={busy} style={{ background: 'var(--bad)', color: '#fff' }} onClick={() => void run(onDelete)}>Delete rule</button>
            </div>
          ) : (
            <button className="btn ghost" disabled={busy} onClick={() => setConfirming(true)}>Delete</button>
          ))}
      </div>
    </>
  );
}
