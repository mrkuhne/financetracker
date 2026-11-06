import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { latestDigest, listNews, type DigestRow } from '@/data/news';
import { getSettings } from '@/data/settings';
import { todayInTz } from '@/domain/dates';
import type { Settings } from '@/domain/types';
import { Icon } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import { NEWS_FILTERS, ago, briefTitle, displayTitle, filterNews, firstBriefCopy, newsChip, safeLink, type NewsFilter, type NewsRow } from './newsModel';

interface NewsData { settings: Settings; digest: DigestRow | null; news: NewsRow[] }

export function NewsScreen() {
  const [data, setData] = useState<NewsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<NewsFilter>('All');

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [settings, digest, news] = await Promise.all([getSettings(), latestDigest(), listNews(100)]);
      setData({ settings, digest, news });
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data) {
    return (
      <Screen title="News" big>
        {failed
          ? <div className="card sub">Could not load the news. <button className="link" onClick={() => void load()}>Retry</button></div>
          : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      </Screen>
    );
  }

  const { settings, digest, news } = data;
  const nowIso = new Date().toISOString();
  const today = todayInTz(settings.timezone);
  const todays = digest && digest.date === today ? digest : null;
  const shown = filterNews(news, filter);

  return (
    <Screen title="News" big>
      {todays ? (
        <Link to={`/brief/${todays.date}`} className="card" style={{ display: 'grid', gap: 6, color: 'inherit', textDecoration: 'none' }}>
          <span className="ov" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Morning brief · {briefTitle(todays.date)}
            {todays.incomplete && <span className="pill">Incomplete</span>}
          </span>
          <span>{todays.notification || 'Your brief is ready.'}</span>
          <span className="link" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>Open the brief<Icon name="chev" style={{ width: 16, height: 16 }} /></span>
        </Link>
      ) : (
        <div className="card" style={{ display: 'grid', gap: 6 }}>
          <span className="ov">Morning brief</span>
          {settings.digest_enabled ? (
            <span className="sub">{firstBriefCopy(settings.digest_time, settings.timezone, new Date(), !digest)}</span>
          ) : (
            <>
              <span className="sub">The morning brief is off.</span>
              <Link className="link" to="/settings/brief">Turn it on in Settings</Link>
            </>
          )}
          {digest && digest.date && (
            <Link className="link" to={`/brief/${digest.date}`}>Open the last brief ({briefTitle(digest.date)})</Link>
          )}
        </div>
      )}

      <div className="chips" role="group" aria-label="Filter news">
        {NEWS_FILTERS.map((f) => (
          <button key={f} type="button" className={`chip${f === filter ? ' on' : ''}`} aria-pressed={f === filter} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      {news.length === 0 ? (
        <div className="card sub">News arrives within a few hours.</div>
      ) : shown.length === 0 ? (
        <div className="card sub">No news in this filter yet.</div>
      ) : (
        <div className="list">
          {shown.map((n) => <NewsItemRow key={n.id} n={n} nowIso={nowIso} />)}
        </div>
      )}

      <p className="note"><Icon name="info" />Each item opens the original article. One-line summaries are written by AI.</p>
    </Screen>
  );
}

function NewsItemRow({ n, nowIso }: { n: NewsRow; nowIso: string }) {
  const chip = newsChip(n);
  const when = ago(n.published_at, nowIso);
  const meta = [n.source_name, when].filter(Boolean).join(' · ');
  const content = (
    <>
      <span className="newsmeta">
        {chip && <span className={`pill${chip.mine ? ' ai' : ''}`} style={{ marginLeft: 0 }}>{chip.label}</span>}
        <span>{meta}</span>
      </span>
      <strong>{displayTitle(n)}</strong>
      {n.summary && <span className="sub">{n.summary}</span>}
    </>
  );
  const href = safeLink(n.link);
  return href
    ? <a className="newsrow" href={href} target="_blank" rel="noopener noreferrer">{content}</a>
    : <div className="newsrow">{content}</div>;
}
