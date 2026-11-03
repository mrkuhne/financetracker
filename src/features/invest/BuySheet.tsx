import { useEffect, useRef, useState } from 'react';
import { recordBuy } from '@/data/investments';
import { formatMoney } from '@/domain/money';
import type { Account, AssetType, InvestmentTxn, ISODate, Platform, Txn } from '@/domain/types';
import { notifyTxnsChanged } from '@/features/transactions/events';
import { parseAmountInput } from '@/lib/amountInput';
import { findProduct, productsFor } from './catalog';
import { PLATFORM_LABEL } from './investModel';
import { findSmsCandidates, parseDecimal, payableAccounts, validateBuy, type BuyInput } from './record';

const PLATFORMS: Platform[] = ['mbh', 'revolut', 'other'];
const LINK_GONE = 'That bank payment no longer matches this buy';

/**
 * "Bought it": records a buy of one catalog product of `type`. A single matching bank SMS is linked
 * silently; several are offered to pick from. Stays busy until the reloaded `txns` hold the new
 * InvestmentTxn (8 s fallback), then closes.
 */
export function BuySheet({ type, productId, partMinor, accounts, moneyTxns, txns, today, onClose }: {
  type: AssetType; productId: string; partMinor: number; accounts: Account[]; moneyTxns: Txn[];
  txns: InvestmentTxn[]; today: ISODate; onClose: () => void;
}) {
  const products = productsFor(type);
  const payable = payableAccounts(accounts);
  const initial = findProduct(productId) ?? products[0];
  const prefill = partMinor > 0 ? String(partMinor / 100) : '';

  const [pid, setPid] = useState(initial.id);
  const [accountId, setAccountId] = useState(payable[0]?.id ?? '');
  const [amount, setAmount] = useState(payable[0]?.currency === 'HUF' ? prefill : '');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState<ISODate>(today);
  const [platform, setPlatform] = useState<Platform>(initial.where[0]);
  const [platformName, setPlatformName] = useState('');
  const [rate, setRate] = useState(initial.rate_pct !== null ? String(initial.rate_pct) : '');
  const [candidates, setCandidates] = useState<Txn[] | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [awaiting, setAwaiting] = useState<Set<string> | null>(null);
  const inFlight = useRef(false); // recordBuy has no idempotency guard: never run it twice at once

  const product = findProduct(pid) ?? initial;
  const account = payable.find((a) => a.id === accountId);
  const currency = account?.currency ?? 'HUF';

  // A changed account, amount or date can match other bank messages: ask again.
  useEffect(() => { setCandidates(null); setChoice(null); }, [accountId, amount, date]);

  useEffect(() => {
    if (!awaiting) return;
    if (txns.some((t) => !awaiting.has(t.id))) { onClose(); return; }
    // If the reload never shows the buy, close anyway.
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [awaiting, txns, onClose]);

  function pickProduct(id: string) {
    const p = findProduct(id);
    if (!p) return;
    setPid(id);
    setPlatform(p.where[0]);
    setRate(p.rate_pct !== null ? String(p.rate_pct) : '');
  }

  function pickAccount(id: string) {
    const next = payable.find((a) => a.id === id);
    setAccountId(id);
    // The amount is in the account's currency: a HUF prefill makes no sense for a EUR account.
    if (next && next.currency !== 'HUF' && amount === prefill) setAmount('');
  }

  function buildInput(): BuyInput | string {
    const amountMinor = parseAmountInput(amount);
    if (amountMinor === null) return 'Enter the amount you paid';
    const q = parseDecimal(quantity);
    if (Number.isNaN(q)) return 'Quantity is not a number';
    const pr = parseDecimal(price);
    if (Number.isNaN(pr) || (pr !== null && !(pr > 0))) return 'Price is not a valid number';
    const r = product.type === 'bond' ? parseDecimal(rate) : null;
    if (Number.isNaN(r)) return 'Rate is not a number';
    const input: BuyInput = {
      productId: product.id, amountMinor, quantity: q, price: pr, date, platform,
      platformName: platform === 'other' ? platformName.trim() || null : null, accountId, bondRatePct: r,
    };
    return validateBuy(input, accounts) ?? input;
  }

  async function save() {
    const input = buildInput();
    if (typeof input === 'string') { setError(input); return; }
    setError('');
    let link: string | null;
    if (candidates) {
      if (choice === null) { setError('Pick a bank message, or None of these'); return; }
      link = choice === 'none' ? null : choice;
    } else {
      const found = findSmsCandidates({ accountId, amountMinor: input.amountMinor, date }, moneyTxns, accounts);
      if (found.length > 1) { setCandidates(found); return; }
      link = found[0]?.id ?? null;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const before = new Set(txns.map((t) => t.id));
      await recordBuy(input, link);
      setAwaiting(before);
      notifyTxnsChanged();
    } catch (e) {
      inFlight.current = false;
      setBusy(false);
      if (e instanceof Error && e.message === LINK_GONE) {
        setCandidates(null);
        setChoice(null);
        setError(`${LINK_GONE}. Save again to check.`);
      } else {
        setError('Could not save. Try again.');
      }
    }
  }

  return (
    <>
      <div className="scrim" onClick={() => !busy && onClose()} />
      <div className="sheet" role="dialog" aria-label="Bought it">
        <span className="grab" />
        <strong style={{ fontSize: 17 }}>Record your buy</strong>
        {payable.length === 0 ? (
          <p className="sub" style={{ margin: 0 }}>Add a current account or cash account first, so the buy has an account to come from.</p>
        ) : (
          <>
            <div className="list">
              <label className="field">
                <span>Product</span>
                <select value={pid} onChange={(e) => pickProduct(e.target.value)} disabled={busy}>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Amount ({currency})</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0" disabled={busy} />
              </label>
              <label className="field">
                <span>{product.type === 'bond' ? 'Quantity (optional)' : 'Quantity (or the price below)'}</span>
                <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder="e.g. 0.5" disabled={busy} />
              </label>
              <label className="field">
                <span>{product.quote_currency ? `Price per unit (${product.quote_currency})` : 'Price per unit (optional)'}</span>
                <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="—" disabled={busy} />
              </label>
              {product.type === 'bond' && (
                <label className="field">
                  <span>Yearly rate (%)</span>
                  <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" disabled={busy} />
                </label>
              )}
              <label className="field">
                <span>Date</span>
                <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} disabled={busy} />
              </label>
              <label className="field">
                <span>Pay from</span>
                <select value={accountId} onChange={(e) => pickAccount(e.target.value)} disabled={busy}>
                  {payable.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
                </select>
              </label>
            </div>
            <div className="sec">
              <span className="ov">Platform</span>
              <div className="seg">
                {PLATFORMS.map((p) => (
                  <button key={p} type="button" className={platform === p ? 'on' : ''} disabled={busy} onClick={() => setPlatform(p)}>{PLATFORM_LABEL[p]}</button>
                ))}
              </div>
              {platform === 'other' && (
                <div className="list">
                  <label className="field">
                    <span>Name</span>
                    <input value={platformName} onChange={(e) => setPlatformName(e.target.value)} placeholder="e.g. your crypto provider" maxLength={40} disabled={busy} />
                  </label>
                </div>
              )}
            </div>
            {candidates && (
              <div className="sec">
                <span className="ov">Which bank message is this?</span>
                <div className="list" role="radiogroup">
                  {candidates.map((t) => (
                    <label key={t.id} className="radio">
                      <input type="radio" name="sms" checked={choice === t.id} onChange={() => setChoice(t.id)} disabled={busy} />
                      <span className="num">{t.date} · {formatMoney(t.amount_minor, t.currency)}</span>
                    </label>
                  ))}
                  <label className="radio">
                    <input type="radio" name="sms" checked={choice === 'none'} onChange={() => setChoice('none')} disabled={busy} />
                    <span>None of these</span>
                  </label>
                </div>
              </div>
            )}
          </>
        )}
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn" disabled={busy || payable.length === 0} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </>
  );
}
