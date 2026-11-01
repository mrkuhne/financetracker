import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '@/features/shell/Icons';
import { listAccounts } from '@/data/accounts';
import { listCategories, type Category } from '@/data/categories';
import { createTransaction, createTransfer, listTransactions } from '@/data/transactions';
import { getHufPerUnit } from '@/data/fx';
import { getSettings } from '@/data/settings';
import { addDays, todayInTz } from '@/domain/dates';
import { toHufMinor } from '@/domain/money';
import { parseAmountInput } from '@/lib/amountInput';
import type { Account, ISODate, Txn } from '@/domain/types';
import { notifyTxnsChanged } from './events';
import { applyKey, categoryColor, formatTyped, keysFor, normalizeAmountFor, recentCategoryIds } from './txLogic';

type Mode = 'expense' | 'income' | 'transfer';

export function QuickAddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Sheet onClose={onClose} />;
}

function Sheet({ onClose }: { onClose: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recent, setRecent] = useState<Txn[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [mode, setMode] = useState<Mode>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [date, setDate] = useState<ISODate>('');
  const [today, setToday] = useState<ISODate>('');
  const [note, setNote] = useState('');
  const [details, setDetails] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const settings = await getSettings();
        const today = todayInTz(settings.timezone);
        const [accts, cats, txns] = await Promise.all([
          listAccounts(),
          listCategories(),
          listTransactions({ from: addDays(today, -90), to: today }),
        ]);
        if (!alive) return;
        const active = accts.filter((a) => !a.archived);
        const def = active.find((a) => a.is_default) ?? active[0];
        setAccounts(active);
        setCategories(cats);
        setRecent(txns);
        setDate(today);
        setToday(today);
        setAccountId(def?.id ?? '');
        setToAccountId(active.find((a) => a.id !== def?.id)?.id ?? '');
        setReady(true);
      } catch {
        if (alive) setLoadError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? 'HUF';
  const kind = mode === 'income' ? 'income' : 'expense';
  const chipIds = useMemo(() => {
    const all = categories.filter((c) => c.kind === kind);
    if (more || all.length <= 6) return recentCategoryIds(recent, categories, all.length, kind);
    return recentCategoryIds(recent, categories, 6, kind);
  }, [more, recent, categories, kind]);
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const decimals = currency !== 'HUF';
  useEffect(() => {
    setAmount((a) => normalizeAmountFor(a, decimals));
  }, [decimals]);
  const shown = formatTyped(amount);
  const hasMore = categories.filter((c) => c.kind === kind).length > 6;
  const unit = currency === 'HUF' ? 'Ft' : currency;
  const acctName = account?.name ?? 'No account';
  const dateLabel = date === today ? 'Today' : date;

  async function saveExpenseOrIncome(categoryId: string) {
    if (inFlight.current) return;
    const amountMinor = parseAmountInput(normalizeAmountFor(amount, decimals));
    if (!amountMinor) return setError('Type an amount first.');
    if (!account) return setError('Add an account first.');
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const rate = await getHufPerUnit(currency, date);
      await createTransaction({
        account_id: account.id,
        kind,
        amount_minor: amountMinor,
        currency,
        amount_huf_minor: toHufMinor(amountMinor, rate),
        category_id: categoryId,
        date,
        note: note.trim() || undefined,
        source: 'manual',
        needs_review: false,
        recurring_rule_id: null,
        transfer_pair_id: null,
      });
      notifyTxnsChanged();
      onClose();
    } catch {
      setError('Could not save. Try again.');
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function saveTransfer() {
    const to = accounts.find((a) => a.id === toAccountId);
    if (inFlight.current) return;
    const amountMinor = parseAmountInput(normalizeAmountFor(amount, decimals));
    if (!amountMinor) return setError('Type an amount first.');
    if (!account || !to) return setError('Pick both accounts.');
    if (account.id === to.id) return setError('Pick two different accounts.');
    if (account.currency !== to.currency) return setError('Transfers between different currencies are not supported yet.');
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await createTransfer({
        fromAccountId: account.id,
        toAccountId: to.id,
        amountMinor,
        currency,
        date,
        note: note.trim() || undefined,
      });
      notifyTxnsChanged();
      onClose();
    } catch {
      setError('Could not save. Try again.');
      inFlight.current = false;
      setBusy(false);
    }
  }

  const accountSelect = (value: string, set: (v: string) => void, label: string) => (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.currency})
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <div className="scrim" onClick={() => !busy && onClose()} />
      <div className="sheet" role="dialog" aria-label="Quick add">
        <span className="grab" />
        {loadError ? (
          <p className="err" role="alert">Could not load your accounts. Close and try again.</p>
        ) : !ready ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><div className="spinner" /></div>
        ) : (
          <>
            <div className="seg">
              {(['expense', 'income', 'transfer'] as Mode[]).map((m) => (
                <button key={m} type="button" disabled={busy} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setMore(false); setError(''); }}>
                  {m[0].toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
            <div className="amtin">
              <div className={`big num${amount ? '' : ' zero'}`} aria-label="Amount">
                {shown}
                <small>{unit}</small>
              </div>
              <span className="sub">{acctName} · {dateLabel}</span>
            </div>

            {mode === 'transfer' ? (
              <div className="list">
                {accountSelect(accountId, setAccountId, 'From')}
                {accountSelect(toAccountId, setToAccountId, 'To')}
              </div>
            ) : (
              <div className="chips" style={{ justifyContent: 'center' }}>
                {chipIds.map((id) => {
                  const c = byId.get(id);
                  if (!c) return null;
                  return (
                    <button key={id} type="button" className="chip" disabled={busy} style={{ '--c': categoryColor(c) } as CSSProperties} onClick={() => void saveExpenseOrIncome(id)}>
                      <Icon name={c.icon as Parameters<typeof Icon>[0]['name']} />
                      {c.name}
                    </button>
                  );
                })}
                {hasMore && (
                  <button type="button" className="chip" onClick={() => setMore((v) => !v)}>
                    <Icon name="dots" />
                    {more ? 'Fewer' : 'More'}
                  </button>
                )}
              </div>
            )}

            <div className="keys">
              {keysFor(decimals).map((k) => (
                <button key={k} type="button" disabled={busy} aria-label={k === '⌫' ? 'Backspace' : k} onClick={() => setAmount((a) => applyKey(a, k, decimals))}>
                  {k}
                </button>
              ))}
            </div>

            {details && (
              <div className="list">
                {mode !== 'transfer' && accountSelect(accountId, setAccountId, 'Account')}
                <label className="field">
                  <span>Date</span>
                  <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
                </label>
                <label className="field">
                  <span>Note</span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" maxLength={80} />
                </label>
              </div>
            )}
            {error && <p className="err" role="alert" style={{ textAlign: 'center' }}>{error}</p>}
            {mode === 'transfer' && (
              <button className="btn" disabled={busy} onClick={() => void saveTransfer()}>
                <Icon name="swap" />
                Transfer
              </button>
            )}
            <button type="button" className="btn ghost" onClick={() => setDetails((v) => !v)}>
              {details ? 'Hide details' : 'Details'}
            </button>
            {mode !== 'transfer' && (
              <p className="note" style={{ justifyContent: 'center' }}>
                <Icon name="info" />
                Type the amount, then tap a category to save.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
