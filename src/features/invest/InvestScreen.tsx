import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { updateSettings } from '@/data/settings';
import { ASSET_TYPES, INVEST_RULES, type Position, type Valuation } from '@/domain/invest';
import type { AssetType } from '@/domain/types';
import { huf, hufNum, hufSigned } from '@/features/home/fmt';
import { Icon, type IconName } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import { TYPE_INFO } from './catalog';
import { DISCLAIMER, TYPE_COLOR, introTemplate, nextProfile, pctSigned, platformOf, sharesOf } from './investModel';
import { investFacts, useInvestAdvice, useInvestData, type InvestModel } from './useInvestData';

const TYPE_ICON: Record<AssetType, IconName> = { bond: 'shield', etf: 'globe', stock: 'chart', crypto: 'coin' };

export function InvestScreen() {
  const { data, failed, reload } = useInvestData();
  if (!data) {
    return (
      <Screen title="Invest" big>
        {failed
          ? <div className="card sub">Could not load your investments. <button className="link" onClick={() => void reload()}>Retry</button></div>
          : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      </Screen>
    );
  }
  return <InvestBody data={data} reload={reload} />;
}

/** One held product: name · platform, its value and return (or "Price not updated"). */
export function HoldingRow({ p, v }: { p: Position; v: Valuation | undefined }) {
  const t = p.holding.asset_type;
  return (
    <Link to={`/invest/holding/${p.holding.id}`} className="li">
      <span className="ci" style={{ ['--c' as string]: TYPE_COLOR[t] }}><Icon name={TYPE_ICON[t]} /></span>
      <span className="tx"><strong>{p.holding.name}</strong><span>{platformOf(p.holding)}</span></span>
      <span className="amt num">
        {huf(v?.valueMinor ?? p.costMinor)}
        {v && !v.priced
          ? <small>Price not updated</small>
          : v && v.gainRatio !== null && <small className={v.gainMinor < 0 ? 'neg' : 'pos'}>{pctSigned(v.gainRatio)}</small>}
      </span>
    </Link>
  );
}

function InvestBody({ data, reload }: { data: InvestModel; reload: () => Promise<unknown> | void }) {
  const facts = investFacts(data);
  const { advice, loading, failed: aiFailed, refresh } = useInvestAdvice(facts, true);
  const settings = data.home.settings;
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [checkinError, setCheckinError] = useState(false);

  useEffect(() => {
    if (!checkinSaving) return;
    if (!data.checkinDue) { setCheckinSaving(false); return; }
    // If the reload never shows the change, stop blocking the buttons.
    const t = setTimeout(() => setCheckinSaving(false), 8000);
    return () => clearTimeout(t);
  }, [checkinSaving, data.checkinDue]);

  async function answerCheckin(bolder: boolean) {
    setCheckinSaving(true);
    setCheckinError(false);
    try {
      await updateSettings({
        ...(bolder ? { risk_profile: nextProfile(settings.risk_profile) } : {}),
        risk_checkin_at: data.home.today,
      });
      await reload();
    } catch {
      setCheckinSaving(false);
      setCheckinError(true);
    }
  }

  const held = data.positions.length > 0;
  const shares = sharesOf(data.summary.byType);
  const targets = INVEST_RULES.profiles[settings.risk_profile];

  return (
    <Screen title="Invest" big>
      {data.checkinDue && (
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <strong>How did the ups and downs feel?</strong>
          <div className="row2">
            <button className="btn" disabled={checkinSaving} onClick={() => void answerCheckin(true)}>Calm, try bolder</button>
            <button className="btn ghost" disabled={checkinSaving} onClick={() => void answerCheckin(false)}>Keep it as is</button>
          </div>
          {checkinError && <p className="err" role="alert">Could not save. Try again.</p>}
        </div>
      )}

      {held ? (
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          <span className="ov">Portfolio</span>
          <div className="big num" style={{ fontSize: 50 }}>{hufNum(data.summary.valueMinor)}<small>Ft</small></div>
          <span className="sub">
            <b className={`num ${data.summary.gainMinor < 0 ? 'neg' : 'pos'}`}>
              {hufSigned(data.summary.gainMinor)}{data.summary.gainRatio !== null && ` (${pctSigned(data.summary.gainRatio)})`}
            </b>{' '}since you started
          </span>
          {data.summary.unpriced > 0 && <span className="sub">Price not updated for {data.summary.unpriced} holding{data.summary.unpriced > 1 ? 's' : ''}: shown at what you paid.</span>}
          <div className="alloc" aria-hidden="true">
            {ASSET_TYPES.filter((t) => shares[t] > 0).map((t) => <i key={t} style={{ width: `${shares[t] * 100}%`, background: TYPE_COLOR[t] }} />)}
          </div>
          <div className="legend">
            {ASSET_TYPES.map((t) => (
              <div key={t}>
                <i style={{ background: TYPE_COLOR[t] }} />
                <span>{TYPE_INFO[t].title}</span>
                <b className="num">{Math.round(shares[t] * 100)}% <small>· target {Math.round(targets[t] * 100)}%</small></b>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ display: 'grid', gap: 8, textAlign: 'center', padding: '22px 18px' }}>
          <span className="ci" style={{ justifySelf: 'center', width: 56, height: 56, borderRadius: 18, ['--c' as string]: 'var(--accent)' }}><Icon name="chart" /></span>
          <strong style={{ fontSize: 17 }}>You have no investments yet</strong>
          <span className="sub">Pick a monthly amount, see a suggested split, then add your first purchase when you have made it.</span>
        </div>
      )}

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <span className="ov">This month</span>
        {data.suggestion.kind === 'no_data' && (
          <>
            <span>Track one full month first. Then you'll get a monthly suggestion.</span>
            <Link className="link" to="/settings">Or set a monthly amount in Settings</Link>
          </>
        )}
        {data.suggestion.kind === 'nothing_spare' && <span>Nothing spare this month after savings.</span>}
        {data.card && data.split && (
          <>
            <span className="num">
              Suggested <b>{huf(data.card.suggestedMinor)}</b> · invested <b>{huf(data.card.investedMinor)}</b> · <b>{huf(data.card.leftMinor)}</b> left this month
            </span>
            <div className="legend">
              {ASSET_TYPES.map((t) => (
                <Link key={t} to={`/invest/type/${t}`}>
                  <i style={{ background: TYPE_COLOR[t] }} />
                  <span>
                    {TYPE_INFO[t].title}
                    {data.split!.tooSmall.includes(t) && <small> · too small this month</small>}
                  </span>
                  <b className="num">{huf(data.split!.parts[t])}</b>
                  <Icon name="chev" />
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {data.card && data.split && facts && (
        <div className="aibox">
          <span className="who"><Icon name="spark" />Why this split</span>
          <p>{advice?.intro || introTemplate(facts.amountMinor, facts.profile)}</p>
          {loading && <div className="spinner" role="status" aria-label="Loading" />}
          {!loading && aiFailed && (
            <>
              <p className="sub" style={{ margin: 0 }}>Personal notes are unavailable right now.</p>
              <button className="btn ghost" onClick={() => void refresh()}>Refresh</button>
            </>
          )}
        </div>
      )}

      {held && (
        <div className="sec">
          <div className="sechd"><h2>Holdings</h2></div>
          <div className="list">
            {data.positions.map((p) => <HoldingRow key={p.holding.id} p={p} v={data.valuations.get(p.holding.id)} />)}
          </div>
        </div>
      )}

      <p className="note"><Icon name="info" />{DISCLAIMER}</p>
    </Screen>
  );
}
