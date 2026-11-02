import { useCallback, useEffect, useRef, useState } from 'react';
import { Screen } from '@/features/shell/Screen';
import { Icon } from '@/features/shell/Icons';
import { createApiKey, listApiKeys, revokeApiKey, type ApiKeyRow } from '@/data/apiKeys';
import { listRecentSms, type SmsMessageRow } from '@/data/smsMessages';
import { formatMoney } from '@/domain/money';
import { SAMPLE_SMS, SMS_SENDER, smsStatusLabel, testToast, type IngestResponse } from './smsUi';

const URL_PATH = '/functions/ingest-sms';

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function SmsAutomationScreen() {
  const [key, setKey] = useState<ApiKeyRow | null | undefined>(undefined); // undefined = loading
  const [fullKey, setFullKey] = useState<string | null>(null); // in memory only
  const [recent, setRecent] = useState<SmsMessageRow[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<'new' | 'revoke' | null>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const keyRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<HTMLDivElement>(null);

  const url = `${window.location.origin}${URL_PATH}`;

  const say = useCallback((t: string) => {
    setToast(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(''), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const load = useCallback(async () => {
    try {
      const [keys, sms] = await Promise.all([listApiKeys(), listRecentSms(20)]);
      setKey(keys.find((k) => !k.revoked) ?? null);
      setRecent(sms);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError('');
    try {
      const { key: full, row } = await createApiKey('iPhone');
      setFullKey(full);
      setKey(row);
      setConfirming(null);
    } catch {
      setError('Could not create the key. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!key) return;
    setBusy(true);
    setError('');
    try {
      await revokeApiKey(key.id);
      setKey(null);
      setFullKey(null);
      setConfirming(null);
      say('Key revoked');
    } catch {
      setError('Could not revoke the key. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function select(el: HTMLElement | null) {
    if (!el) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
  }

  function copy(text: string, el: HTMLElement | null, done: string) {
    navigator.clipboard.writeText(text).then(
      () => say(done),
      () => {
        select(el);
        say('Press copy on the selected text');
      },
    );
  }

  async function sendTest() {
    if (!fullKey) return say('Create a new key to test from here');
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': fullKey },
        body: JSON.stringify({ text: SAMPLE_SMS, sender: SMS_SENDER }),
      });
      let body: IngestResponse = {};
      try {
        body = (await res.json()) as IngestResponse;
      } catch {
        /* non-JSON body */
      }
      say(testToast(res.status, body));
      void load();
    } catch {
      say('Could not reach the server');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="SMS automation" back="/settings">
      <p className="sub" style={{ margin: 0 }}>
        When MBH Bank texts you about a payment, an iPhone Shortcut sends the text here, and the expense appears by itself.
      </p>
      {failed && (
        <div className="card sub">
          Could not load. <button className="link" onClick={() => void load()}>Retry</button>
        </div>
      )}
      {key === undefined && !failed && <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}

      {key !== undefined && (
        <div className="sec">
          <span className="ov">1 · Your personal key</span>
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            {key === null ? (
              <>
                <span className="sub">You have no active key yet.</span>
                <button className="btn" disabled={busy} onClick={() => void create()}>Create key</button>
              </>
            ) : (
              <>
                <div className="code" ref={keyRef}>{fullKey ?? `ft_••••${key.last4}`}</div>
                {fullKey ? (
                  <>
                    <button className="btn ghost" onClick={() => copy(fullKey, keyRef.current, 'Key copied')}>Copy</button>
                    <span className="sub">Shown once. Revoke it here if your phone is lost.</span>
                  </>
                ) : (
                  <span className="sub">{key.last_used_at ? `Last used ${fmtWhen(key.last_used_at)}` : 'Not used yet'}</span>
                )}
                {confirming ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <span className="sub">
                      {confirming === 'new'
                        ? 'This revokes your current key. Your Shortcut stops working until you paste the new one. Continue?'
                        : 'This revokes your key. The Shortcut stops working. Continue?'}
                    </span>
                    <div className="row2">
                      <button className="btn ghost" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
                      <button className="btn" disabled={busy} onClick={() => void (confirming === 'new' ? create() : revoke())}>
                        {confirming === 'new' ? 'Create new key' : 'Revoke'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="row2">
                    <button className="btn ghost" disabled={busy} onClick={() => setConfirming('new')}>New key</button>
                    <button className="btn ghost" disabled={busy} onClick={() => setConfirming('revoke')}>Revoke</button>
                  </div>
                )}
              </>
            )}
            {error && <p className="err" role="alert">{error}</p>}
          </div>
        </div>
      )}

      <div className="sec">
        <span className="ov">2 · Set up the Shortcut</span>
        <div className="list">
          <div className="field"><span>1. Shortcuts → Automation → New → Message</span></div>
          <div className="field"><span>2. Sender: <b style={{ color: 'var(--ink)' }}>{SMS_SENDER}</b></span><span className="pill">Run immediately</span></div>
          <div className="field"><span>   Notify off</span></div>
          <div className="field"><span>3. Add action “Get Contents of URL”</span></div>
          <div className="field" style={{ alignItems: 'flex-start' }}>
            <span style={{ minWidth: 0 }}>4. URL<div className="code" ref={urlRef} style={{ marginTop: 6 }}>{url}</div></span>
            <button className="link" onClick={() => copy(url, urlRef.current, 'URL copied')}>Copy</button>
          </div>
          <div className="field"><span>5. Method: POST</span></div>
          <div className="field"><span>6. Header <b style={{ color: 'var(--ink)' }}>X-Api-Key</b> = your key</span></div>
          <div className="field"><span>7. Request Body: JSON. <b style={{ color: 'var(--ink)' }}>text</b> = Shortcut Input → Content, <b style={{ color: 'var(--ink)' }}>sender</b> = {SMS_SENDER}</span></div>
        </div>
      </div>

      <div className="sec">
        <span className="ov">3 · Test it</span>
        <div className="smsraw">{SAMPLE_SMS}</div>
        <button className="btn" disabled={busy} onClick={() => void sendTest()}>Send a test message</button>
        {!fullKey && key !== undefined && <span className="sub">Create a new key to test from here</span>}
      </div>

      {recent.length > 0 && (
        <div className="sec">
          <span className="ov">Recent messages</span>
          <div className="list">
            {recent.map((m) => (
              <div key={m.id} className="li">
                <span className="tx">
                  <strong>{m.merchant ?? m.sender}</strong>
                  <span>{fmtWhen(m.received_at)}</span>
                </span>
                {m.amount_minor != null && m.currency && <span className="amt num">{formatMoney(Math.abs(m.amount_minor), m.currency)}</span>}
                <span className={`pill${m.status === 'converted' ? ' good' : m.status === 'failed' ? ' bad' : ''}`}>{smsStatusLabel(m.status)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="note"><Icon name="info" />Revolut sends app notifications, not SMS. Shortcuts cannot read those, so Revolut stays manual.</p>
      {toast && <div className="toast" role="status">{toast}</div>}
    </Screen>
  );
}
