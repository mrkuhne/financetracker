import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { analyzeNews, listNewsByIds, type AnalyzeResult } from '@/data/news';
import { huf } from '@/features/home/fmt';
import { Icon } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import { VERDICT_LABEL, ago, displayTitle, safeLink, type NewsRow } from './newsModel';

const DISCLAIMER = 'Oktatási célú, nem befektetési tanácsadás. Te döntesz, és te rögzíted a vásárlást.';

export function NewsItemScreen() {
  const { id = '' } = useParams();
  const [item, setItem] = useState<NewsRow | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const run = useCallback(async (refresh: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const r = await analyzeNews(id, refresh);
    inFlight.current = false;
    if (!alive.current) return;
    setResult(r);
    setBusy(false);
  }, [id]);

  useEffect(() => {
    setItem(null);
    setResult(null);
    listNewsByIds([id]).then((rows) => { if (alive.current) setItem(rows[0] ?? null); }, () => undefined);
    void run(false);
  }, [id, run]);

  const href = item ? safeLink(item.link) : null;
  const meta = item ? [item.source_name, ago(item.published_at, new Date().toISOString())].filter(Boolean).join(' · ') : '';

  return (
    <Screen title="News" back="/news">
      {item && (
        <div style={{ display: 'grid', gap: 4 }}>
          {meta && <span className="sub">{meta}</span>}
          <strong style={{ fontSize: 20, lineHeight: 1.25 }}>{displayTitle(item)}</strong>
        </div>
      )}
      {!result ? (
        <div className="card sub" role="status">Az AI elolvassa a cikket…</div>
      ) : result.status === 'cap' ? (
        <div className="card sub">Elérted a mai elemzési korlátot (20). Holnap újra próbálhatod.</div>
      ) : result.status === 'not_found' ? (
        <div className="card sub">Ez a hír már nem elérhető.</div>
      ) : result.status === 'error' ? (
        <div className="card sub" style={{ display: 'grid', gap: 8 }}>
          Az elemzés most nem sikerült.
          <button className="btn ghost" disabled={busy} onClick={() => void run(false)}>Újra</button>
        </div>
      ) : (
        <Analysis r={result} busy={busy} onRefresh={() => void run(true)} />
      )}
      {href && <a className="link" href={href} target="_blank" rel="noopener noreferrer">Eredeti cikk megnyitása ↗</a>}
      <p className="note"><Icon name="info" />{DISCLAIMER}</p>
    </Screen>
  );
}

function Analysis({ r, busy, onRefresh }: { r: Extract<AnalyzeResult, { status: 'ok' }>; busy: boolean; onRefresh: () => void }) {
  const a = r.analysis;
  const product = a.product?.replace(/^Held: /, '') ?? null;
  return (
    <>
      <div className="card" style={{ display: 'grid', gap: 6 }}>
        <span className="ov">Miről szól</span>
        <span>{a.about}</span>
      </div>
      <div className="card" style={{ display: 'grid', gap: 6 }}>
        <span className="ov">Mit jelent neked</span>
        <span>{a.impact}</span>
      </div>
      <div className="card" style={{ display: 'grid', gap: 8 }}>
        <span className="ov">Ajánlás</span>
        <span><span className="pill ai" style={{ marginLeft: 0 }}>{VERDICT_LABEL[a.verdict]}</span></span>
        {a.verdict === 'buy' && !r.stale && a.amount_minor !== null && product && (
          <div className="bline"><b>Javaslat</b><b className="num">{huf(a.amount_minor)} → {product}</b></div>
        )}
        {r.money_known && r.left_minor !== null ? (
          <div className="bline"><span>Ebben a hónapban még befektethető</span><span className="num">{huf(r.left_minor)}</span></div>
        ) : (
          <span className="sub">Nyisd meg az Invest fület a havi számok frissítéséhez.</span>
        )}
        <span>{a.reason}</span>
      </div>
      {r.stale && <p className="sub">Az elemzés óta változott a kereted</p>}
      {r.stale
        ? <button className="btn" disabled={busy} onClick={onRefresh}>Újraelemzés</button>
        : <button className="link" style={{ justifySelf: 'start' }} disabled={busy} onClick={onRefresh}>Újraelemzés</button>}
      {a.from_summary && <span className="sub" style={{ fontSize: 12, color: 'var(--faint)' }}>Csak a hír összefoglalójából</span>}
    </>
  );
}
