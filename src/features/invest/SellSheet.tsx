import { useEffect, useRef, useState } from 'react';
import { getHufPerUnit } from '@/data/fx';
import { recordSell } from '@/data/investments';
import type { Position } from '@/domain/invest';
import { toHufMinor } from '@/domain/money';
import type { Account, InvestmentTxn, ISODate } from '@/domain/types';
import { notifyTxnsChanged } from '@/features/transactions/events';
import { parseAmountInput } from '@/lib/amountInput';
import { parseDecimal, payableAccounts, planSell } from './record';

/** Messages recordSell throws before writing anything; anything else is a failed save. */
const USER_ERROR = /^(Enter |You hold |Nothing left|Pay from)/;

/**
 * "Record a sale" of one holding. Without a known quantity the sale closes the whole holding (R13),
 * so the quantity field is hidden; with one, the quantity is required. Stays busy until the reloaded
 * `txns` hold the new InvestmentTxn (8 s fallback), then closes.
 */
export function SellSheet({ position, accounts, txns, today, onClose }: {
  position: Position; accounts: Account[]; txns: InvestmentTxn[]; today: ISODate; onClose: () => void;
}) {
  const payable = payableAccounts(accounts);
  const hasQuantity = position.quantity !== null;
  const [accountId, setAccountId] = useState(payable[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState<ISODate>(today);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [awaiting, setAwaiting] = useState<Set<string> | null>(null);
  const inFlight = useRef(false); // recordSell has no idempotency guard: never run it twice at once

  const currency = payable.find((a) => a.id === accountId)?.currency ?? 'HUF';

  useEffect(() => {
    if (!awaiting) return;
    if (txns.some((t) => !awaiting.has(t.id))) { onClose(); return; }
    // If the reload never shows the sale, close anyway.
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [awaiting, txns, onClose]);

  async function save() {
    if (inFlight.current) return;
    const amountMinor = parseAmountInput(amount);
    if (amountMinor === null) { setError('Enter the amount you received'); return; }
    const q = hasQuantity ? parseDecimal(quantity) : null;
    if (Number.isNaN(q)) { setError('Quantity is not a number'); return; }
    if (hasQuantity && q === null) { setError('Enter how many units you sold'); return; }
    const pr = parseDecimal(price);
    if (Number.isNaN(pr) || (pr !== null && !(pr > 0))) { setError('Price is not a valid number'); return; }

    inFlight.current = true;
    setBusy(true);
    setError('');
    const fail = (message: string) => { inFlight.current = false; setBusy(false); setError(message); };
    let amountHuf: number;
    try {
      amountHuf = toHufMinor(amountMinor, await getHufPerUnit(currency, date));
    } catch {
      fail('Could not get the exchange rate. Try again.');
      return;
    }
    const planError = planSell(position, { amountMinor: amountHuf, quantity: q });
    if (planError) { fail(planError); return; }
    try {
      const before = new Set(txns.map((t) => t.id));
      await recordSell(position.holding, { amountMinor, quantity: q, price: pr, date, accountId });
      setAwaiting(before);
      notifyTxnsChanged();
    } catch (e) {
      fail(e instanceof Error && USER_ERROR.test(e.message) ? e.message : 'Could not save. Try again.');
    }
  }

  return (
    <>
      <div className="scrim" onClick={() => !busy && onClose()} />
      <div className="sheet" role="dialog" aria-label="Record a sale">
        <span className="grab" />
        <strong style={{ fontSize: 17 }}>Record your sale</strong>
        {payable.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>Add a current account or cash account first, so the sale has an account to arrive in.</p>
        ) : (
          <>
            <div className="list">
              <label className="field">
                <span>Amount received ({currency})</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" disabled={busy} />
              </label>
              {hasQuantity && (
                <label className="field">
                  <span>Quantity sold</span>
                  <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder="e.g. 0.5" disabled={busy} />
                </label>
              )}
              <label className="field">
                <span>Price per unit (optional)</span>
                <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="—" disabled={busy} />
              </label>
              <label className="field">
                <span>Date</span>
                <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} disabled={busy} />
              </label>
              <label className="field">
                <span>Arrived in</span>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={busy}>
                  {payable.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
                </select>
              </label>
            </div>
            {!hasQuantity && <p className="sub" style={{ margin: 0 }}>Selling closes this holding.</p>}
          </>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn" disabled={busy || payable.length === 0} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </>
  );
}
