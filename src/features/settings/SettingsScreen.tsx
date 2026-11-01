import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '@/features/shell/Screen';
import { Icon } from '@/features/shell/Icons';
import { base44 } from '@/data/client';
import { getSettings, updateSettings } from '@/data/settings';
import { formatMoney } from '@/domain/money';
import { parseAmountInput } from '@/lib/amountInput';
import type { Settings } from '@/domain/types';

const STEP = 1_000_000; // 10 000 Ft in minor units
const ZONES = ['Europe/Budapest', 'Europe/London', 'Europe/Berlin', 'Europe/Vienna', 'America/New_York', 'UTC'];

export function SettingsScreen() {
  const [s, setS] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    getSettings().then(setS, () => setFailed(true));
  }, []);

  async function patch(p: Partial<Settings>) {
    if (!s) return;
    const prev = s;
    setS({ ...s, ...p });
    setSaveError(false);
    try {
      await updateSettings(p);
    } catch {
      setS(prev);
      setSaveError(true);
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
              <AmountField label="Save every month" minor={s.monthly_savings_target_minor} onChange={(v) => void patch({ monthly_savings_target_minor: v ?? 0 })} />
              <AmountField label="Invest every month" minor={s.monthly_investment_amount_minor} optional onChange={(v) => void patch({ monthly_investment_amount_minor: v })} />
              <div className="field">
                <span>Emergency fund</span>
                <div className="stepper">
                  <button aria-label="Fewer months" onClick={() => void patch({ emergency_fund_months: Math.max(1, s.emergency_fund_months - 1) })}>−</button>
                  <b className="num">{s.emergency_fund_months} months</b>
                  <button aria-label="More months" onClick={() => void patch({ emergency_fund_months: Math.min(36, s.emergency_fund_months + 1) })}>+</button>
                </div>
              </div>
              <label className="field">
                <span>Timezone</span>
                <select value={s.timezone} onChange={(e) => void patch({ timezone: e.target.value })}>
                  {(ZONES.includes(s.timezone) ? ZONES : [s.timezone, ...ZONES]).map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </label>
            </div>
            {saveError && <p className="err" role="alert">Could not save that change.</p>}
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
          {/* Task 12 adds the Data (export) section here. */}
          <button className="btn ghost" onClick={() => void signOut()}>Sign out</button>
        </>
      )}
    </Screen>
  );
}

/** Stepper with +/- 10 000 Ft; tap the value to type an exact amount. `optional` allows empty (= not set). */
function AmountField({ label, minor, optional = false, onChange }: { label: string; minor: number | null; optional?: boolean; onChange: (v: number | null) => void }) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (typing) ref.current?.focus();
  }, [typing]);

  const clamp = (n: number) => Math.max(0, n);
  const commit = () => {
    setTyping(false);
    if (text.trim() === '') return onChange(optional ? null : 0);
    const v = parseAmountInput(text);
    if (v !== null) onChange(clamp(v));
  };

  return (
    <div className="field">
      <span>{label}</span>
      <div className="stepper">
        <button aria-label={`Less ${label}`} onClick={() => onChange(clamp((minor ?? 0) - STEP))}>−</button>
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
        <button aria-label={`More ${label}`} onClick={() => onChange(clamp((minor ?? 0) + STEP))}>+</button>
      </div>
    </div>
  );
}
