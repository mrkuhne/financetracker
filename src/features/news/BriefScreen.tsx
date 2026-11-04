import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDigest, listNewsByIds, type DigestRow } from '@/data/news';
import { huf } from '@/features/home/fmt';
import { Icon } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import { briefTitle, parseNumbers, pctLabel, type Fx, type NumbersView } from './newsModel';

const FOOTER = 'Educational, not financial advice. You decide and record the buy.';
const STALE = "Open the app to update this month's numbers.";
const AI_FAILED = 'AI note unavailable';

interface BriefData { digest: DigestRow | null; sources: string[] | null }

export function BriefScreen() {
  const { date = '' } = useParams();
  const [data, setData] = useState<BriefData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    setData(null);
    try {
      const digest = /^\d{4}-\d{2}-\d{2}$/.test(date) ? await getDigest(date) : null;
      let sources: string[] | null = [];
      if (digest && digest.news_ids.length > 0) {
        try {
          const items = await listNewsByIds(digest.news_ids);
          sources = [...new Set(items.map((i) => i.source_name).filter(Boolean))];
        } catch {
          sources = null;
        }
      }
      setData({ digest, sources });
    } catch {
      setFailed(true);
    }
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  const title = briefTitle(date);
  if (!data) {
    return (
      <Screen title={title} back="/news">
        {failed
          ? <div className="card sub">Could not load the brief. <button className="link" onClick={() => void load()}>Retry</button></div>
          : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      </Screen>
    );
  }
  const { digest, sources } = data;
  if (!digest) {
    return (
      <Screen title={title} back="/news">
        <div className="card sub">No brief for this day.</div>
      </Screen>
    );
  }

  const n = parseNumbers(digest.numbers);
  const incomplete = digest.incomplete || !n;
  return (
    <Screen title={title} back="/news" right={incomplete ? <span className="pill">Incomplete</span> : undefined}>
      <InvestmentsCard n={n} />

      <div className="aibox">
        <span className="who"><Icon name="spark" />What happened</span>
        <p className={digest.ai_ok && digest.what_happened ? undefined : 'sub'}>
          {digest.ai_ok && digest.what_happened ? digest.what_happened : AI_FAILED}
        </p>
        {digest.news_ids.length > 0 && (
          <span className="sub" style={{ fontSize: 12 }}>
            Based on {digest.news_ids.length} news {digest.news_ids.length === 1 ? 'item' : 'items'}
            {sources && sources.length > 0 && ` · ${sources.join(', ')}`}
          </span>
        )}
      </div>

      <MonthCard digest={digest} n={n} />

      <p className="note"><Icon name="info" />{FOOTER}</p>
    </Screen>
  );
}

function Pct({ x }: { x: number | null }) {
  const cls = x === null ? 'sub' : Math.round(x * 1000) > 0 ? 'pos' : Math.round(x * 1000) < 0 ? 'neg' : undefined;
  return <span className={cls}>{pctLabel(x)}</span>;
}

function FxLine({ label, fx }: { label: string; fx: Fx | null }) {
  return (
    <div className="bline">
      <span>{label}</span>
      {fx
        ? <span className="num">{fx.rate.toFixed(1)} · <Pct x={fx.weekChange} /> week</span>
        : <span className="num sub">no data</span>}
    </div>
  );
}

function InvestmentsCard({ n }: { n: NumbersView | null }) {
  return (
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <span className="ov">Your investments</span>
      {!n ? (
        <span className="sub">No data</span>
      ) : (
        <>
          {!n.holdingsKnown && <span className="sub">Your holdings are not known yet. {STALE}</span>}
          {n.holdings.map((h, i) => (
            <div className="bline" key={`${h.name}-${i}`}>
              <span>{h.name}</span>
              {h.fixed
                ? <span className="num sub">fixed</span>
                : <span className="num"><Pct x={h.day} /> day · <Pct x={h.week} /> week</span>}
            </div>
          ))}
          {n.holdingsKnown && n.holdings.length === 0 && <span className="sub">You have no investments yet.</span>}
          {n.portfolioWeek !== null && n.holdings.length > 1 && (
            <div className="bline"><b>Whole portfolio</b><span className="num"><Pct x={n.portfolioWeek} /> week</span></div>
          )}
          {n.market && (
            <div className="bline">
              <span>World ETF (market)</span>
              <span className="num"><Pct x={n.market.day} /> day · <Pct x={n.market.week} /> week</span>
            </div>
          )}
          <FxLine label="EUR/HUF" fx={n.eurHuf} />
          {n.usdHuf && <FxLine label="USD/HUF" fx={n.usdHuf} />}
          <span className="sub" style={{ fontSize: 12 }}>Prices: Yahoo, ECB · closing prices from yesterday</span>
        </>
      )}
    </div>
  );
}

function monthName(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? 'this month' : d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
}

const money = (m: number | null | undefined) => (typeof m === 'number' ? huf(m) : 'no data');

function MonthCard({ digest, n }: { digest: DigestRow; n: NumbersView | null }) {
  const m = n?.month ?? null;
  const stale = !n || n.stale;
  return (
    <div className="aibox">
      <span className="who"><Icon name="spark" />This month's money</span>
      {stale ? (
        <p className="sub">{STALE}</p>
      ) : m && m.suggestedMinor !== null ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="bline"><span>Planned for {monthName(digest.date)}</span><span className="num">{money(m.suggestedMinor)}</span></div>
          <div className="bline"><span>Already bought</span><span className="num">{money(m.investedMinor)}</span></div>
          <div className="bline"><b>Left</b><b className="num">{money(m.leftMinor)}</b></div>
        </div>
      ) : (
        <p className="sub">No monthly amount yet. Already bought {money(m?.investedMinor)}.</p>
      )}
      <p className={digest.ai_ok && digest.this_month ? undefined : 'sub'}>
        {digest.ai_ok && digest.this_month ? digest.this_month : AI_FAILED}
      </p>
      <Link className="link" to="/invest" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        Open Invest<Icon name="chev" style={{ width: 16, height: 16 }} />
      </Link>
    </div>
  );
}
