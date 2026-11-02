import { useState } from 'react';
import { Icon } from '@/features/shell/Icons';
import type { Category } from '@/data/categories';
import { deleteTransaction, updateTransaction } from '@/data/transactions';
import { getHufPerUnit } from '@/data/fx';
import { formatMoney, fromMinor, toHufMinor } from '@/domain/money';
import type { Account, Txn } from '@/domain/types';
import { parseAmountInput } from '@/lib/amountInput';
import { CatIcon } from './CatIcon';
import { notifyTxnsChanged } from './events';
import { needsHufRecompute } from './txLogic';

const SOURCE: Record<Txn['source'], string> = { manual: 'Added by you', sms: 'SMS', recurring: 'Recurring rule' };

/** Edit sheet for one transaction. Transfer legs are read-only except delete (deleting removes both legs). */
/** `onClose` = dismissed without a change; `onDone` (default `onClose`) = after a successful save or delete. */
export function TransactionForm({ txn, accounts, categories, onClose, onDone }: { txn: Txn; accounts: Account[]; categories: Category[]; onClose: () => void; onDone?: () => void }) {
  const isTransfer = txn.kind === 'transfer_in' || txn.kind === 'transfer_out';
  const [kind, setKind] = useState<'expense' | 'income'>(txn.kind === 'income' ? 'income' : 'expense');
  const [amount, setAmount] = useState(String(fromMinor(txn.amount_minor)));
  const [categoryId, setCategoryId] = useState(txn.category_id ?? '');
  const [accountId, setAccountId] = useState(txn.account_id);
  // Locked to the account's currency (balances are kept in the account currency).
  const currency = accounts.find((a) => a.id === accountId)?.currency ?? txn.currency;
  const [date, setDate] = useState(txn.date);
  const [note, setNote] = useState(txn.note ?? '');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const cats = categories.filter((c) => c.kind === kind);
  const category = categories.find((c) => c.id === txn.category_id);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      notifyTxnsChanged();
      (onDone ?? onClose)();
    } catch {
      setError('Could not save. Try again.');
      setBusy(false);
    }
  }

  async function save() {
    const amountMinor = parseAmountInput(amount);
    if (!amountMinor || amountMinor <= 0) return setError('Enter an amount above zero.');
    if (!date) return setError('Pick a date.');
    await run(async () => {
      const next = { amount_minor: amountMinor, currency, date };
      const patch: Partial<Omit<Txn, 'id'>> = {
        ...next,
        kind,
        category_id: categoryId || null,
        account_id: accountId,
        note: note.trim(),
        needs_review: false,
      };
      if (needsHufRecompute(txn, next)) {
        patch.amount_huf_minor = toHufMinor(amountMinor, await getHufPerUnit(currency, date));
      }
      await updateTransaction(txn.id, patch);
    });
  }

  const acctName = accounts.find((a) => a.id === txn.account_id)?.name ?? 'Account';

  return (
    <>
      <div className="scrim" onClick={() => !busy && onClose()} />
      <div className="sheet" role="dialog" aria-label="Transaction">
        <span className="grab" />
        <div style={{ textAlign: 'center', display: 'grid', gap: 6, justifyItems: 'center' }}>
          <span className="ci-lg">
            <CatIcon category={category} icon={isTransfer ? 'swap' : undefined} />
          </span>
          <div className="big num" style={{ fontSize: 44 }}>{formatMoney(txn.amount_minor, txn.currency)}</div>
          <span className="sub">
            {isTransfer ? `Transfer ${txn.kind === 'transfer_out' ? 'out of' : 'into'} ${acctName}` : SOURCE[txn.source]}
            {txn.currency !== 'HUF' && ` · ${formatMoney(txn.amount_huf_minor, 'HUF')}`}
          </span>
        </div>

        {isTransfer ? (
          <p className="note"><Icon name="info" />Transfers cannot be edited. Deleting one side removes both.</p>
        ) : (
          <>
            <div className="seg">
              {(['expense', 'income'] as const).map((k) => (
                <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setCategoryId(''); }}>
                  {k[0].toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
            <div className="list">
              <label className="field">
                <span>Amount</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Amount" />
              </label>
              <div className="field">
                <span>Currency</span>
                <b>{currency}</b>
              </div>
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
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.filter((a) => !a.archived || a.id === txn.account_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="field">
                <span>Note</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" maxLength={80} />
              </label>
            </div>
          </>
        )}

        {error && <p className="err" role="alert">{error}</p>}
        {!isTransfer && (
          <button className="btn" disabled={busy} onClick={() => void save()}>
            <Icon name="check" />
            {txn.needs_review ? 'Looks right' : 'Save changes'}
          </button>
        )}
        {confirming ? (
          <div className="row2">
            <button className="btn ghost" disabled={busy} onClick={() => setConfirming(false)}>Keep it</button>
            <button className="btn" disabled={busy} style={{ background: 'var(--bad)', color: '#fff' }} onClick={() => void run(() => deleteTransaction(txn.id))}>
              {isTransfer ? 'Delete both sides' : 'Delete'}
            </button>
          </div>
        ) : (
          <button className="btn ghost" disabled={busy} onClick={() => setConfirming(true)}>Delete</button>
        )}
      </div>
    </>
  );
}
