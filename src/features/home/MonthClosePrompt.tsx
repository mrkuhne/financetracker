import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createMonthClose } from '@/data/monthCloses';
import { createTransfer, listTransactions } from '@/data/transactions';
import { getHufPerUnit } from '@/data/fx';
import { lastDay } from '@/domain/dates';
import type { Account } from '@/domain/types';
import { Icon } from '@/features/shell/Icons';
import { monthLabel } from '@/features/transactions/txLogic';
import { notifyTxnsChanged } from '@/features/transactions/events';
import { huf, hufNum } from './fmt';
import { canMoveLeftover, closeRecord, findCloseTransfer, type CloseSummary } from './homeModel';

/** Bottom sheet for ONE pending month (the caller passes the oldest first and re-renders with the next after `onClosed`). */
export function MonthClosePrompt({ summary, accounts, transferPairId, onTransferred, onClosed, onDismiss }: {
  summary: CloseSummary; accounts: Account[]; transferPairId: string | null; onTransferred: (pairId: string) => void; onClosed: () => void | Promise<void>; onDismiss: () => void;
}) {
  const active = accounts.filter((a) => !a.archived);
  const from = active.find((a) => a.is_default);
  const to = active.find((a) => a.is_savings_target);
  const { month, leftoverMinor, deficitMinor, allowance } = summary;
  const canMove = canMoveLeftover(from, to);
  const currencyMismatch = !!from && !!to && !canMove;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  // If the transfer succeeded but saving the close failed, a retry must not transfer twice
  // (the parent keeps the pair id across sheet unmounts).
  const pairId = useRef<string | null>(transferPairId);

  async function act(picked: 'move' | 'keep' | 'ok') {
    const choice = pairId.current ? 'move' : picked; // a written transfer can only be finished, not undone
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (choice === 'move' && leftoverMinor > 0 && !pairId.current) {
        if (!from || !to || !canMoveLeftover(from, to)) throw new Error('cannot move');
        const date = lastDay(month);
        const rate = await getHufPerUnit(from.currency, date);
        const amountMinor = from.currency === 'HUF' ? leftoverMinor : Math.round(leftoverMinor / rate);
        // After a reload the in-memory pair id is gone: reuse a transfer already written for this close.
        const existing = findCloseTransfer(await listTransactions({ from: date, to: date }), {
          fromAccountId: from.id, toAccountId: to.id, date, amountMinor,
        });
        pairId.current = existing ?? await createTransfer({
          fromAccountId: from.id, toAccountId: to.id, currency: from.currency, date, amountMinor,
          note: `${monthLabel(month)} leftover`,
        });
        onTransferred(pairId.current);
        notifyTxnsChanged();
      }
      await createMonthClose(closeRecord(summary, choice, pairId.current));
      await onClosed();
    } catch {
      setError('Could not save. Try again.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const label = monthLabel(month);
  return (
    <>
      <div className="scrim" onClick={() => !busy && !pairId.current && onDismiss()} />
      <div className="sheet" role="dialog" aria-label={`Close ${label}`}>
        <span className="grab" />
        <div style={{ display: 'grid', gap: 6, textAlign: 'center', padding: '6px 0' }}>
          <span className="ov">{label} · closed</span>
          <div className={`big num${deficitMinor > 0 ? ' neg' : ''}`} style={{ fontSize: 54 }}>
            {hufNum(allowance.remainingMinor)}<small>Ft</small>
          </div>
          <span className="sub">left from your {label.split(' ')[0]} allowance</span>
        </div>
        <div className="list">
          <div className="field"><span>Free to spend</span><b className="num">{huf(allowance.freeMinor)}</b></div>
          <div className="field"><span>Spent</span><b className="num">{huf(-allowance.spentMinor)}</b></div>
          {leftoverMinor > 0 && (
            <>
              <div className="field"><span>From</span><b>{from?.name ?? '—'}</b></div>
              <div className="field"><span>To</span><b>{to?.name ?? '—'}</b></div>
            </>
          )}
        </div>
        {deficitMinor > 0 || leftoverMinor === 0 ? (
          <>
            <p className="sub" style={{ textAlign: 'center' }}>
              {deficitMinor > 0
                ? `You overspent ${huf(deficitMinor)}. Next month starts with ${huf(deficitMinor)} less.`
                : `You spent exactly your allowance in ${label.split(' ')[0]}.`}
            </p>
            <button className="btn" disabled={busy} onClick={() => void act('ok')}>OK</button>
          </>
        ) : (
          <>
            {canMove ? (
              <button className="btn" disabled={busy} onClick={() => void act('move')}>
                <Icon name="piggy" />Move to Savings
              </button>
            ) : currencyMismatch ? (
              <p className="note"><Icon name="info" />
                <span>{from!.name} ({from!.currency}) and {to!.name} ({to!.currency}) use different currencies, so the leftover can't be moved automatically.</span>
              </p>
            ) : (
              <p className="note"><Icon name="info" />
                <span>
                  {to ? 'Set a default account' : 'Create a savings account'} to move leftovers.{' '}
                  <Link to="/accounts" style={{ color: 'var(--accent)', fontWeight: 600 }}>Open accounts</Link>
                </span>
              </p>
            )}
            <button className={`btn${canMove ? ' ghost' : ''}`} disabled={busy} onClick={() => void act('keep')}>
              Keep it{from ? ` in ${from.name}` : ''}
            </button>
          </>
        )}
        {error && <p className="note" role="alert" style={{ color: 'var(--bad)' }}>{error}</p>}
        <p className="note"><Icon name="info" />The next month starts fresh either way. If you overspend a month, the next one starts lower.</p>
      </div>
    </>
  );
}
