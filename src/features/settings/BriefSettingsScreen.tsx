import { useCallback, useEffect, useState } from 'react';
import { Screen } from '@/features/shell/Screen';
import { Icon } from '@/features/shell/Icons';
import { getSettings, updateSettings } from '@/data/settings';
import { currentSubscription, deviceName, pushSupport, sendTestPush, subscribePush, unsubscribePush, type PushSupport } from '@/data/push';
import { collectNow, latestDigest, listSources, setSourceActive, todayUsage, type DigestRow, type SourceRow } from '@/data/news';
import type { Settings } from '@/domain/types';
import { HOUR_OPTIONS, INTERVAL_OPTIONS, aiLimitReached, normalizeHour, normalizeInterval } from './briefSettings';

const SUPPORT_TEXT: Record<Exclude<PushSupport, 'ok'>, string> = {
  not_installed: 'Add the app to your Home Screen to get notifications.',
  denied: 'Notifications are blocked in iPhone Settings.',
  unsupported: "This browser can't show notifications.",
};

async function hasDeviceSubscription(): Promise<boolean> {
  try {
    return (await currentSubscription()) !== null;
  } catch {
    return false;
  }
}

interface Data {
  settings: Settings;
  subscribed: boolean;
  sources: SourceRow[];
  digest: DigestRow | null;
  limit: boolean;
}

function fmtDate(d: string): string {
  const t = new Date(`${d}T00:00:00`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function BriefSettingsScreen() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const support = pushSupport();

  const load = useCallback(async () => {
    try {
      const [settings, subscribed, sources, digest] = await Promise.all([getSettings(), hasDeviceSubscription(), listSources(), latestDigest()]);
      let limit = false;
      try {
        limit = aiLimitReached(await todayUsage());
      } catch {
        /* the limit note is optional */
      }
      setData({ settings, subscribed, sources, digest, limit });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, fn: () => Promise<void>, failText: string) {
    if (busy) return;
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (err) {
      const m = (err as { message?: string } | null)?.message;
      setError(m === 'permission_denied' ? 'Notifications were not allowed.' : failText);
    } finally {
      setBusy(null);
    }
  }

  const on = !!data && data.settings.digest_enabled && data.subscribed;
  const canToggle = support === 'ok' || on; // let someone turn it off even if support changed

  function toggle() {
    if (!data) return;
    void run('toggle', async () => {
      try {
        if (on) {
          await unsubscribePush();
          await updateSettings({ digest_enabled: false });
        } else {
          await subscribePush(deviceName());
          await updateSettings({ digest_enabled: true });
        }
        setTestMsg(null);
      } finally {
        await load(); // show the real device + settings state, even after a partial failure
      }
    }, on ? 'Could not turn notifications off. Try again.' : 'Could not turn notifications on. Try again.');
  }

  function save(patch: Partial<Settings>) {
    void run('save', async () => {
      await updateSettings(patch);
      setData((d) => d && { ...d, settings: { ...d.settings, ...patch } });
    }, 'Could not save that change.');
  }

  function toggleSource(s: SourceRow) {
    void run(`src-${s.id}`, async () => {
      await setSourceActive(s.id, !s.active);
      setData((d) => d && { ...d, sources: d.sources.map((x) => (x.id === s.id ? { ...x, active: !s.active } : x)) });
    }, 'Could not change that source.');
  }

  function collect() {
    void run('collect', async () => {
      await collectNow();
      const sources = await listSources();
      setData((d) => d && { ...d, sources });
    }, 'Could not collect news. Try again.');
  }

  function test() {
    setTestMsg(null);
    void run('test', async () => {
      const r = await sendTestPush();
      setTestMsg(r.failed === 0 && r.sent > 0
        ? { ok: true, text: `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}.` }
        : { ok: false, text: r.sent + r.failed === 0 ? 'No subscribed devices yet.' : `Sent ${r.sent}, failed ${r.failed}: ${r.errors.join(', ')}` });
    }, 'Could not send the test. Try again.');
  }

  const d = data;
  return (
    <Screen title="Morning brief" back="/settings">
      {failed && (
        <div className="card sub">
          Could not load. <button className="link" onClick={() => void load()}>Retry</button>
        </div>
      )}
      {!d && !failed && <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      {d && (
        <>
          <div className="sec">
            <span className="ov">Notifications</span>
            <div className="list">
              <div className="field">
                <span>Notifications on this phone</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label="Notifications on this phone"
                  className={`sw${on ? ' on' : ''}`}
                  disabled={busy !== null || !canToggle}
                  onClick={toggle}
                />
              </div>
              <label className="field">
                <span>Time</span>
                <select
                  value={normalizeHour(d.settings.digest_time)}
                  disabled={busy !== null}
                  onChange={(e) => save({ digest_time: e.target.value })}
                >
                  {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            </div>
            {busy === 'toggle' && <p className="sub" role="status">Working…</p>}
            <span className="sub">{support === 'ok' ? 'Works only when the app is on your Home Screen.' : SUPPORT_TEXT[support]}</span>
          </div>

          <div className="sec">
            <span className="ov">News</span>
            <div className="list">
              <label className="field">
                <span>Collect news every</span>
                <select
                  value={normalizeInterval(d.settings.news_interval_hours)}
                  disabled={busy !== null}
                  onChange={(e) => save({ news_interval_hours: normalizeInterval(Number(e.target.value)) })}
                >
                  {INTERVAL_OPTIONS.map((h) => <option key={h} value={h}>{h} hours</option>)}
                </select>
              </label>
            </div>
            <span className="sub">Each round uses a few Base44 AI credits.</span>
          </div>

          <div className="sec">
            <span className="ov">Sources</span>
            {d.sources.length === 0 ? (
              <div className="card" style={{ display: 'grid', gap: 10 }}>
                <span className="sub">Sources appear after the first collection.</span>
                <button className="btn ghost" disabled={busy !== null} onClick={collect}>
                  {busy === 'collect' ? 'Collecting…' : 'Collect news now'}
                </button>
              </div>
            ) : (
              <div className="list">
                {d.sources.map((s) => (
                  <div className="field" key={s.id}>
                    <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                      <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{s.name}</b>
                      {s.last_error && <small className="err">{s.last_error}</small>}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={s.active}
                      aria-label={s.name}
                      className={`sw${s.active ? ' on' : ''}`}
                      disabled={busy !== null}
                      onClick={() => toggleSource(s)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sec">
            <span className="ov">Last brief</span>
            <div className="card" style={{ display: 'grid', gap: 6 }}>
              {d.digest ? (
                <>
                  <div className="field" style={{ padding: 0 }}>
                    <span>{fmtDate(d.digest.date)}</span>
                    <span className={d.digest.push_status === 'failed' ? 'err' : 'sub'}>{d.digest.push_status ?? 'not sent'}</span>
                  </div>
                  {d.digest.push_status === 'failed' && d.digest.push_error === 'interrupted' ? (
                    <span className="sub">Interrupted — the next brief will retry tomorrow.</span>
                  ) : (
                    d.digest.push_error && <span className="err">{d.digest.push_error}</span>
                  )}
                </>
              ) : (
                <span className="sub">No brief yet.</span>
              )}
              {d.limit && <span className="sub">Daily AI limit reached</span>}
            </div>
          </div>

          <button className="btn" disabled={busy !== null || support !== 'ok' || !on} onClick={test}>
            <Icon name="send" /> {busy === 'test' ? 'Sending…' : 'Send a test notification'}
          </button>
          {testMsg && (testMsg.ok ? <p className="sub" role="status">{testMsg.text}</p> : <p className="err" role="alert">{testMsg.text}</p>)}
          {error && <p className="err" role="alert">{error}</p>}
        </>
      )}
    </Screen>
  );
}
