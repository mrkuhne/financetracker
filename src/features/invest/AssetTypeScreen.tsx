import { useCallback, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ASSET_TYPES } from '@/domain/invest';
import type { AssetType } from '@/domain/types';
import { huf } from '@/features/home/fmt';
import { Icon } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import { BuySheet } from './BuySheet';
import { TYPE_INFO, defaultProduct, findProduct } from './catalog';
import { templateText } from './investAi';
import { DISCLAIMER, PLATFORM_LABEL, adviceFor } from './investModel';
import { HoldingRow } from './InvestScreen';
import { investFacts, useInvestAdvice, useInvestData, type InvestModel } from './useInvestData';

const RISK_LABEL = { low: 'Low', medium: 'Medium', high: 'High' } as const;

/** `/invest/type/:type`; an unknown type goes back to Invest. */
export function AssetTypeScreen() {
  const { type } = useParams();
  if (!ASSET_TYPES.includes(type as AssetType)) return <Navigate to="/invest" replace />;
  return <AssetTypeLoader type={type as AssetType} />;
}

function AssetTypeLoader({ type }: { type: AssetType }) {
  const { data, failed, reload } = useInvestData();
  if (!data) {
    return (
      <Screen title={TYPE_INFO[type].title} back="/invest">
        {failed
          ? <div className="card sub">Could not load your investments. <button className="link" onClick={() => void reload()}>Retry</button></div>
          : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      </Screen>
    );
  }
  return <AssetTypeBody type={type} data={data} />;
}

function AssetTypeBody({ type, data }: { type: AssetType; data: InvestModel }) {
  const info = TYPE_INFO[type];
  const facts = investFacts(data);
  // Cache only: the Invest tab makes the call; this page never does.
  const { advice } = useInvestAdvice(facts, false);
  const mine = adviceFor(advice, type);
  const product = (mine && findProduct(mine.product_id)) || defaultProduct(type);
  const part = data.split?.parts[type] ?? 0;
  const tooSmall = data.split?.tooSmall.includes(type) ?? false;
  const held = data.positions.filter((p) => p.holding.asset_type === type);
  const text = mine?.text || (facts ? templateText(type, facts) : null);
  const [buying, setBuying] = useState(false);
  const close = useCallback(() => setBuying(false), []);

  return (
    <Screen title={info.title} back="/invest">
      <p className="sub" style={{ margin: 0, lineHeight: 1.5 }}>{info.what}</p>

      {data.split && (
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <span className="sub">This month</span>
          {tooSmall && part === 0
            ? <b>Too small this month</b>
            : <b className="num">{huf(part)}{tooSmall && <small className="sub"> · too small this month</small>}</b>}
        </div>
      )}

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <span className="ov">Example product</span>
        <strong style={{ fontSize: 16 }}>{product.name}</strong>
        <div className="kv">
          <span>Where</span><b>{product.where.map((w) => PLATFORM_LABEL[w]).join(', ')}</b>
          <span>Risk</span><b className={product.risk === 'high' ? 'warnc' : undefined}>{RISK_LABEL[product.risk]}</b>
          {product.rate_pct !== null && <><span>Yearly rate</span><b className="num">{product.rate_pct.toFixed(2)}%</b></>}
          {product.min_minor !== null && <><span>Minimum</span><b className="num">{huf(product.min_minor)}</b></>}
        </div>
        <p className="sub" style={{ margin: 0, lineHeight: 1.5 }}>{product.summary}</p>
        <p className="note" style={{ margin: 0 }}><Icon name="info" />Check the current terms before you buy.</p>
        <a className="link" href={product.source_url} target="_blank" rel="noopener noreferrer">Source · checked {product.checked_at}</a>
      </div>
      <p className="sub" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>{info.where_note}</p>

      <div className="sec">
        <span className="ov">What you hold</span>
        {held.length > 0
          ? <div className="list">{held.map((p) => <HoldingRow key={p.holding.id} p={p} v={data.valuations.get(p.holding.id)} />)}</div>
          : <span className="sub">Nothing of this type yet.</span>}
      </div>

      {text && (
        <div className="aibox">
          <span className="who"><Icon name="spark" />{mine?.text ? 'Why this part' : 'About this part'}</span>
          <p>{text}</p>
        </div>
      )}
      <p className="note"><Icon name="info" />{DISCLAIMER}</p>
      <button className="btn" onClick={() => setBuying(true)}><Icon name="plus" />Bought it</button>

      {buying && (
        <BuySheet
          type={type} productId={product.id} partMinor={part} accounts={data.home.accounts} moneyTxns={data.home.txns}
          txns={data.txns} today={data.home.today} onClose={close}
        />
      )}
    </Screen>
  );
}
