import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '@/features/shell/Screen';
import { Icon } from '@/features/shell/Icons';
import { base44 } from '@/data/client';
import { getSettings, updateSettings } from '@/data/settings';
import { formatMoney } from '@/domain/money';
import { parseAmountInput } from '@/lib/amountInput';
import { exportAllJson, exportTransactionsCsv, saveBlob } from '@/data/export';
import { todayInTz } from '@/domain/dates';
import { listApiKeys } from '@/data/apiKeys';
import { listRecentSms } from '@/data/smsMessages';
import type { RiskProfile, Settings } from '@/domain/types';
import { normalizeHour } from '@/features/settings/briefSettings';
import { PROFILE_LABEL } from '@/features/invest/investModel';
import { refreshBriefSnapshot } from '@/app/briefSnapshot';

const STEP = 1_000_000; // 10 000 Ft in minor units
const RISK_PROFILES: RiskProfile[] = ['cautious', 'balanced', 'bold'];
const ZONES = ['Europe/Budapest', 'Europe/London', 'Europe/Berlin', 'Europe/Vienna', 'America/New_York', 'UTC'];

export function SettingsScreen() {
  const [s, setS] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const latest = useRef<Settings | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    getSettings().then(
      (v) => {
        latest.current = v;
        setS(v);
      },
      () => setFailed(true),
    );
  }, []);

  /** Computes the change from the latest value, shows it at once, and saves in order. On failure, re-fetch the truth. */
  function patch(make: (cur: Settings) => Partial<Settings>) {
    const cur = latest.current;
    if (!cur) return;
    const p = make(cur);
    latest.current = { ...cur, ...p };
    setS(latest.current);
    setSaveError(false);
    chain.current = chain.current
      .then(() => updateSettings(p))
      // Every setting on this screen feeds the brief snapshot (savings target, emergency months, timezone, investing).
      .then(() => void refreshBriefSnapshot())
      .catch(async () => {
        setSaveError(true);
        try {
          const fresh = await getSettings();
          latest.current = fresh;
          setS(fresh);
        } catch {
          /* keep the optimistic value; the error message is already shown */
        }
      });
  }

  const [smsSub, setSmsSub] = useState('Off');
  useEffect(() => {
    (async () => {
      try {
        const keys = await listApiKeys();
        if (!keys.some((k) => !k.revoked)) return setSmsSub('Off');
        const last = (await listRecentSms(1))[0];
        setSmsSub(last ? `On · last one ${fmtWhen(last.received_at)}` : 'On');
      } catch {
        /* keep the default subtitle */
      }
    })();
  }, []);

  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  async function runExport(kind: 'json' | 'csv') {
    if (!latest.current || exporting) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const day = todayInTz(latest.current.timezone);
      const name = kind === 'json' ? `finance-export-${day}.json` : `transactions-${day}.csv`;
      const blob = await (kind === 'json' ? exportAllJson() : exportTransactionsCsv());
      await saveBlob(blob, name);
      setExportMsg({ ok: true, text: `Saved ${name}` });
    } catch {
      setExportMsg({ ok: false, text: 'Could not export. Try again.' });
    } finally {
      setExporting(false);
    }
  }

  async function signOut() {
    await base44.auth.logout();
    window.location.reload(); // no-op if logout already navigated; the AuthGate then shows the login screen
  }

  return (
    <Screen title="Settings" back="/">
      {failed && <div className="card sub">Could not load settings. Reload to try again.</div>}
      {!s && !failed && <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      {s && (
        <>
          <div className="sec">
            <span className="ov">Monthly plan</span>
            <div className="list">
              <AmountField label="Save every month" minor={s.monthly_savings_target_minor} onChange={(f) => patch((c) => ({ monthly_savings_target_minor: f(c.monthly_savings_target_minor) ?? 0 }))} />
              <div className="field">
                <span>Emergency fund</span>
                <div className="stepper">
                  <button aria-label="Fewer months" onClick={() => patch((c) => ({ emergency_fund_months: Math.max(1, c.emergency_fund_months - 1) }))}>−</button>
                  <b className="num">{s.emergency_fund_months} months</b>
                  <button aria-label="More months" onClick={() => patch((c) => ({ emergency_fund_months: Math.min(36, c.emergency_fund_months + 1) }))}>+</button>
                </div>
              </div>
              <label className="field">
                <span>Timezone</span>
                <select value={s.timezone} onChange={(e) => { const value = e.target.value; patch(() => ({ timezone: value })); }}>
                  {(ZONES.includes(s.timezone) ? ZONES : [s.timezone, ...ZONES]).map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </label>
            </div>
            {saveError && <p className="err" role="alert">Could not save that change.</p>}
          </div>
          <div className="sec">
            <span className="ov">Investing</span>
            <div className="list">
              <AmountField label="Monthly investment (optional)" minor={s.monthly_investment_amount_minor} optional onChange={(f) => patch((c) => ({ monthly_investment_amount_minor: f(c.monthly_investment_amount_minor) }))} />
            </div>
            <span className="sub">Leave empty to get a suggestion. It comes out of your allowance only when you record a buy.</span>
            <span className="ov">Risk profile</span>
            <div className="seg" role="radiogroup" aria-label="Risk profile">
              {RISK_PROFILES.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={s.risk_profile === r} className={s.risk_profile === r ? 'on' : ''}
                  onClick={() => patch(() => ({ risk_profile: r }))}>{PROFILE_LABEL[r]}</button>
              ))}
            </div>
          </div>
          <div className="sec">
            <span className="ov">Accounts</span>
            <div className="list">
              <Link to="/accounts" className="li">
                <span className="ci" style={{ ['--c' as string]: 'var(--accent)' }}><Icon name="wallet" /></span>
                <span className="tx"><strong>Accounts</strong><span>Balances, currencies, default account</span></span>
                <Icon name="chev" />
              </Link>
            </div>
          </div>
          <div className="sec">
            <span className="ov">Automation</span>
            <div className="list">
              <Link to="/settings/sms" className="li">
                <span className="ci" style={{ ['--c' as string]: 'var(--accent)' }}><Icon name="sms" /></span>
                <span className="tx"><strong>SMS automation</strong><span>{smsSub}</span></span>
                <Icon name="chev" />
              </Link>
              <Link to="/settings/brief" className="li">
                <span className="ci" style={{ ['--c' as string]: 'var(--accent)' }}><Icon name="bell" /></span>
                <span className="tx"><strong>Morning brief</strong><span>{s.digest_enabled ? `On · ${normalizeHour(s.digest_time)}` : 'Off'}</span></span>
                <Icon name="chev" />
              </Link>
            </div>
          </div>
          <div className="sec">
            <span className="ov">Data</span>
            <div className="list">
              <button className="li" disabled={exporting} onClick={() => void runExport('json')}>
                <span className="ci" style={{ ['--c' as string]: 'var(--good)' }}><Icon name="download" /></span>
                <span className="tx"><strong>Export everything (JSON)</strong><span>Back up your data</span></span>
              </button>
              <button className="li" disabled={exporting} onClick={() => void runExport('csv')}>
                <span className="ci" style={{ ['--c' as string]: 'var(--good)' }}><Icon name="download" /></span>
                <span className="tx"><strong>Export transactions (CSV)</strong><span>For spreadsheets</span></span>
              </button>
            </div>
            {exportMsg && (exportMsg.ok ? <p className="sub" role="status">{exportMsg.text}</p> : <p className="err" role="alert">{exportMsg.text}</p>)}
          </div>
          <button className="btn ghost" onClick={() => void signOut()}>Sign out</button>
        </>
      )}
    </Screen>
  );
}

/** Stepper with +/- 10 000 Ft; tap the value to type an exact amount. `optional` allows empty (= not set). */
function AmountField({ label, minor, optional = false, onChange }: { label: string; minor: number | null; optional?: boolean; onChange: (f: (cur: number | null) => number | null) => void }) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (typing) ref.current?.focus();
  }, [typing]);

  const clamp = (n: number) => Math.max(0, n);
  const commit = () => {
    setTyping(false);
    if (text.trim() === '') return onChange(() => (optional ? null : 0));
    const v = parseAmountInput(text);
    if (v !== null) onChange(() => clamp(v));
  };

  return (
    <div className="field">
      <span>{label}</span>
      <div className="stepper">
        <button aria-label={`Less ${label}`} onClick={() => onChange((c) => clamp((c ?? 0) - STEP))}>−</button>
        {typing ? (
          <input
            ref={ref}
            inputMode="decimal"
            value={text}
            placeholder={optional ? 'Not set' : '0'}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label={label}
          />
        ) : (
          <button
            style={{ width: 'auto', minWidth: 84, background: 'none' }}
            className="num"
            aria-label={`Edit ${label}`}
            onClick={() => {
              setText(minor === null ? '' : String(minor / 100));
              setTyping(true);
            }}
          >
            <b>{minor === null ? 'Not set' : formatMoney(minor, 'HUF')}</b>
          </button>
        )}
        <button aria-label={`More ${label}`} onClick={() => onChange((c) => clamp((c ?? 0) + STEP))}>+</button>
      </div>
    </div>
  );
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
