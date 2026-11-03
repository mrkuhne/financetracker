import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { deleteInvestmentTxn } from '@/data/investments';
import { isBigDrop } from '@/domain/invest';
import type { InvestmentTxn } from '@/domain/types';
import { huf, hufNum, hufSigned } from '@/features/home/fmt';
import { Icon } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import { notifyTxnsChanged } from '@/features/transactions/events';
import { TYPE_INFO } from './catalog';
import { deleteConfirmCopy, holdingDetail, pctSigned, platformOf, priceLine, type HoldingDetail } from './investModel';
import { SellSheet } from './SellSheet';
import { useInvestData, type InvestModel } from './useInvestData';

const fmtQty = (q: number): string => String(Number(q.toFixed(8)));

/** `/invest/holding/:id`; an unknown holding (or one whose last txn was deleted) goes back to Invest. */
export function HoldingScreen() {
  const { id = '' } = useParams();
  const { data, failed, reload } = useInvestData();
  if (!data) {
    return (
      <Screen title="Holding" back="/invest">
        {failed
          ? <div className="card sub">Could not load your investments. <button className="link" onClick={() => void reload()}>Retry</button></div>
          : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      </Screen>
    );
  }
  const detail = holdingDetail(data, id);
  if (!detail) return <Navigate to="/invest" replace />;
  return <HoldingBody detail={detail} data={data} />;
}

function HoldingBody({ detail, data }: { detail: HoldingDetail; data: InvestModel }) {
  const { holding: h, position: p, valuation: v, quote, history } = detail;
  const info = TYPE_INFO[h.asset_type];
  const price = priceLine(h, v, quote, p.quantity);
  const [selling, setSelling] = useState(false);
  const close = useCallback(() => setSelling(false), []);

  return (
    <Screen title={h.ticker ?? info.title} back="/invest">
      <div className="card" style={{ display: 'grid', gap: 6 }}>
        <span className="ov">{info.title} · {platformOf(h)}</span>
        <strong style={{ fontSize: 16 }}>{h.name}</strong>
        {v ? (
          <>
            <div className="big num" style={{ fontSize: 48 }}>{hufNum(v.valueMinor)}<small>Ft</small></div>
            <div className="kv">
              <span>Cost</span><b className="num">{huf(v.costMinor)}</b>
              <span>Return</span>
              <b className={`num ${v.gainMinor < 0 ? 'neg' : v.gainMinor > 0 ? 'pos' : ''}`}>
                {hufSigned(v.gainMinor)}{v.gainRatio !== null && ` · ${pctSigned(v.gainRatio)}`}
              </b>
              {p.quantity !== null && <><span>Quantity</span><b className="num">{fmtQty(p.quantity)}</b></>}
            </div>
            {price && <span className="sub">{price}</span>}
          </>
        ) : (
          <span className="sub">You sold all of this. Its history stays below.</span>
        )}
      </div>

      {v && isBigDrop(v) && (
        <div className="card dropnote">
          <strong><Icon name="info" />{info.title} often swing like this.</strong>
          <p>{info.drop_note}</p>
        </div>
      )}

      <div className="sec">
        <span className="ov">History</span>
        <div className="list">
          {history.map((t) => <HistoryRow key={t.id} t={t} data={data} />)}
        </div>
      </div>

      {v && <button className="btn ghost" onClick={() => setSelling(true)}>Record a sale</button>}

      {selling && (
        <SellSheet position={p} accounts={data.home.accounts} txns={data.txns} today={data.home.today} onClose={close} />
      )}
    </Screen>
  );
}

/** One buy/sell with an in-page delete confirmation. Stays busy until the reload drops the row (8 s fallback). */
function HistoryRow({ t, data }: { t: InvestmentTxn; data: InvestModel }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleted, setDeleted] = useState(false);
  const inFlight = useRef(false);

  // The reload removes this row (and the page, after the last one); this only covers a reload that never comes.
  useEffect(() => {
    if (!deleted) return;
    const timer = setTimeout(() => { inFlight.current = false; setBusy(false); setConfirming(false); setDeleted(false); }, 8000);
    return () => clearTimeout(timer);
  }, [deleted]);

  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await deleteInvestmentTxn(t);
      setDeleted(true);
      notifyTxnsChanged();
    } catch {
      inFlight.current = false;
      setBusy(false);
      setError('Could not delete. Try again.');
    }
  }

  const label = t.side === 'buy' ? 'Buy' : 'Sell';
  return (
    <div className="hrow">
      <div className="li">
        <span className="tx">
          <strong>{label}</strong>
          <span className="num">{t.date}{t.quantity !== null && ` · ${fmtQty(t.quantity)} units`}</span>
        </span>
        <span className="amt num">{huf(t.amount_huf_minor)}</span>
        {!confirming && (
          <button type="button" className="ib" aria-label={`Delete this ${t.side}`} onClick={() => setConfirming(true)}>
            <Icon name="close" />
          </button>
        )}
      </div>
      {confirming && (
        <div className="confirm">
          <span className="sub">{deleteConfirmCopy(t, data.home.txns)}</span>
          {error && <span className="err" role="alert">{error}</span>}
          <div className="row2">
            <button className="btn ghost" disabled={busy} onClick={() => { setConfirming(false); setError(''); }}>Keep it</button>
            <button className="btn" disabled={busy} style={{ background: 'var(--bad)', color: '#fff' }} onClick={() => void remove()}>
              {busy ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
