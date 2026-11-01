import { useState } from 'react';
import type { Account } from '@/domain/types';
import { fromMinor } from '@/domain/money';
import { parseAmountInput } from '@/lib/amountInput';
import type { AccountDraft } from './accountRules';

export const CURRENCIES = ['HUF', 'EUR', 'USD', 'GBP'];
const TYPES: { value: Account['type']; label: string }[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investment' },
];

/** Bottom sheet to create or edit an account. `onSave` receives the raw draft; rules are applied by the caller. */
export function AccountSheet({ account, onSave, onClose }: { account?: Account; onSave: (d: AccountDraft) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? '');
  const [type, setType] = useState<Account['type']>(account?.type ?? 'checking');
  const [currency, setCurrency] = useState(account?.currency ?? 'HUF');
  const [opening, setOpening] = useState(account ? String(fromMinor(account.opening_balance_minor)) : '');
  const [isDefault, setIsDefault] = useState(account?.is_default ?? false);
  const [isTarget, setIsTarget] = useState(account?.is_savings_target ?? false);
  const [archived, setArchived] = useState(account?.archived ?? false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return setError('Give the account a name.');
    const openingMinor = opening.trim() === '' ? 0 : parseAmountInput(opening);
    if (openingMinor === null) return setError('Opening balance is not a number.');
    setBusy(true);
    setError('');
    try {
      await onSave({
        id: account?.id,
        name: trimmed,
        type,
        currency,
        opening_balance_minor: openingMinor,
        is_default: isDefault,
        is_savings_target: type === 'savings' && isTarget,
        archived,
      });
    } catch {
      setError('Could not save. Try again.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={account ? 'Edit account' : 'New account'}>
        <span className="grab" />
        <div className="list">
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MBH" maxLength={40} />
          </label>
          <label className="field">
            <span>Opening balance</span>
            <input value={opening} onChange={(e) => setOpening(e.target.value)} inputMode="decimal" placeholder="0" />
          </label>
        </div>
        <div className="sec">
          <span className="ov">Type</span>
          <div className="seg">
            {TYPES.map((t) => (
              <button key={t.value} type="button" className={type === t.value ? 'on' : ''} onClick={() => setType(t.value)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sec">
          <span className="ov">Currency</span>
          <div className="seg">
            {CURRENCIES.map((c) => (
              <button key={c} type="button" className={currency === c ? 'on' : ''} onClick={() => setCurrency(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="list">
          <Toggle label="Default account" on={isDefault} onChange={setIsDefault} />
          {type === 'savings' && <Toggle label="Month-end savings target" on={isTarget} onChange={setIsTarget} />}
          {account && <Toggle label="Archived" on={archived} onChange={setArchived} />}
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn" onClick={() => void submit()} disabled={busy}>
          {account ? 'Save changes' : 'Add account'}
        </button>
      </div>
    </>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <button type="button" className={`sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
    </div>
  );
}
