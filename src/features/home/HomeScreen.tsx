import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/data/client';
import { listCategories, type Category } from '@/data/categories';
import { formatMoney } from '@/domain/money';
import type { Txn } from '@/domain/types';
import { Icon } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import { CatIcon } from '@/features/transactions/CatIcon';
import { monthLabel } from '@/features/transactions/txLogic';
import { AllowanceBreakdown } from './AllowanceBreakdown';
import { huf, hufNum } from './fmt';
import { avatarInitial, summarizeClose } from './homeModel';
import { MonthClosePrompt } from './MonthClosePrompt';
import { useHomeData } from './useHomeData';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const dm = (d: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...o, timeZone: 'UTC' }).format(Date.parse(`${d}T12:00:00Z`));

export function BreakdownScreen() {
  const { data, failed } = useHomeData();
  if (!data) return <Screen title="Where the numbers come from" back="/">{failed ? <div className="card sub">Could not load.</div> : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}</Screen>;
  return <AllowanceBreakdown model={data.model} rules={data.rules} />;
}

export function HomeScreen() {
  const nav = useNavigate();
  const { data, failed, reload } = useHomeData();
  const [categories, setCategories] = useState<Category[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  // Transfer already written for a month whose MonthClose is not saved yet; survives sheet unmount.
  const [transfers, setTransfers] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState('');
  useEffect(() => { void listCategories().then(setCategories).catch(() => {}); }, []);
  useEffect(() => {
    void base44.auth.me().then((u) => setInitial(avatarInitial(u as { full_name?: string; email?: string }))).catch(() => {});
  }, []);
  const avatar = <Link to="/settings" className="av" aria-label="Settings">{initial}</Link>;
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const shell = (body: React.ReactNode, title = 'Home') => (
    <Screen title={title} big right={avatar}>{body}</Screen>
  );
  if (!data) {
    return shell(failed
      ? <div className="card sub">Could not load your numbers. <button className="link" onClick={() => void reload()}>Retry</button></div>
      : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />);
  }

  const { model: m, pending } = data;
  const oldest = pending[0];
  const summary = oldest ? summarizeClose({ month: oldest, rules: data.rules, txns: data.txns, settings: data.settings, closes: data.closes }) : null;
  const acctName = new Map(data.accounts.map((a) => [a.id, a.name]));
  const wk = m.weekly;
  const mo = m.monthly;
  const max = Math.max(m.dailyShareMinor, ...m.bars.map((b) => b.spentMinor)) * 1.15 || 1;
  const share = Math.max(0, Math.min(100, mo.freeMinor > 0 ? (mo.spentMinor / mo.freeMinor) * 100 : mo.spentMinor > 0 ? 100 : 0));

  const firstSms = m.needsReview.find((t) => t.sms_message_id);
  const reviewTarget = firstSms ? `/review/${firstSms.id}` : '/transactions';

  const row = (t: Txn) => {
    const cat = t.category_id ? catById.get(t.category_id) : undefined;
    const transfer = t.kind === 'transfer_in' || t.kind === 'transfer_out';
    const name = transfer ? `Transfer ${t.kind === 'transfer_out' ? 'out' : 'in'}` : t.note || cat?.name || 'Uncategorised';
    const plus = t.kind === 'income' || t.kind === 'transfer_in';
    return (
      <Link key={t.id} to={t.needs_review && t.sms_message_id ? `/review/${t.id}` : '/transactions'} className={`li${t.needs_review ? ' rev' : ''}`}>
        <CatIcon category={cat} icon={transfer ? 'swap' : undefined} />
        <span className="tx">
          <strong>{name}</strong>
          <span>
            {t.needs_review && <i className="dot" />}
            {t.needs_review && 'Check · '}
            {[cat?.name && t.note ? cat.name : null, acctName.get(t.account_id) ?? 'Account'].filter(Boolean).join(' · ')}
            {t.source === 'sms' ? ' · SMS' : t.source === 'recurring' ? ' · Recurring' : ''}
          </span>
        </span>
        <span className={`amt num${t.kind === 'income' ? ' pos' : ''}`}>{plus ? '+' : '−'}{formatMoney(t.amount_minor, t.currency)}</span>
      </Link>
    );
  };

  return (
    <Screen title={monthLabel(m.month).split(' ')[0]} big right={avatar}>
      {summary && (
        <button className="banner" onClick={() => { setDismissed(false); setOpen(true); }}>
          <span className="bi"><Icon name="piggy" /></span>
          <div>
            <strong>{monthLabel(summary.month).split(' ')[0]} is ready to close</strong>
            <span>{summary.deficitMinor > 0 ? `You overspent ${huf(summary.deficitMinor)}.` : summary.leftoverMinor === 0 ? 'You spent exactly your allowance.' : `You had ${huf(summary.leftoverMinor)} left. Move it to Savings?`}</span>
          </div>
          <Icon name="chev" />
        </button>
      )}
      <button className="hero card" onClick={() => nav('/breakdown')} style={{ textAlign: 'left' }}>
        <div className="meta">
          <span className="ov">Left this week</span>
          <span className="pill">{dm(wk.weekStart, { weekday: 'short', day: 'numeric' })} – {dm(wk.weekEnd, { weekday: 'short', day: 'numeric' })}</span>
        </div>
        <div className={`hero-num num${wk.remainingMinor < 0 ? ' neg' : ''}`}>{hufNum(wk.remainingMinor)}<small style={{ fontSize: 20, marginLeft: 4, fontFamily: 'var(--body)' }}>Ft</small></div>
        <div className="sub">of {huf(wk.budgetMinor)} this week · about {huf(m.perDayLeftMinor)} a day for the {m.daysLeftInWeek} day{m.daysLeftInWeek === 1 ? '' : 's'} left</div>
        <div className="weekbars">
          {m.bars.map((b, i) => (
            <div key={b.date} className={`wb${b.past ? ' past' : ''}${b.today ? ' today' : ''}${b.future ? ' future' : ''}`}>
              <i>
                {!b.future && <b className={b.over ? 'over' : ''} style={{ height: `${Math.min(100, (b.spentMinor / max) * 100)}%` }} />}
                {!b.past && <s style={{ bottom: `${(m.dailyShareMinor / max) * 100}%` }} />}
              </i>
              <em>{WEEKDAYS[i]}</em>
            </div>
          ))}
        </div>
      </button>
      <button className="card monthcard" onClick={() => nav('/breakdown')} style={{ textAlign: 'left' }}>
        <div>
          <div className="ov">Left this month</div>
          <div className={`mid num${mo.remainingMinor < 0 ? ' neg' : ''}`} style={{ marginTop: 6 }}>{huf(mo.remainingMinor)}</div>
        </div>
        <div className="sub" style={{ textAlign: 'right' }}>of {huf(mo.freeMinor)}<br />{m.daysLeftInMonth} day{m.daysLeftInMonth === 1 ? '' : 's'} to go</div>
        <div className="bar"><b style={{ width: `${share}%` }} /></div>
      </button>
      {m.needsReview.length > 0 && (
        <Link to={reviewTarget} className="banner" style={{ background: 'color-mix(in srgb,var(--warn) 13%,var(--surf))' }}>
          <span className="bi" style={{ color: 'var(--warn)' }}><Icon name="sms" /></span>
          <div>
            <strong>{m.needsReview.length} from SMS to check</strong>
            <span>{m.needsReview.slice(0, 3).map((t) => `${t.note || catById.get(t.category_id ?? '')?.name || 'Expense'} ${formatMoney(t.amount_minor, t.currency)}`).join(' · ')}</span>
          </div>
          <Icon name="chev" />
        </Link>
      )}
      <div className="sec">
        <div className="sechd"><h2>Accounts</h2><Link to="/accounts" className="link">{huf(m.totalBalanceHufMinor)}</Link></div>
        <div className="accts">
          {m.accounts.length === 0 && <Link to="/accounts" className="acct"><span>No accounts yet</span><strong>Add one</strong></Link>}
          {m.accounts.map((a) => (
            <Link key={a.account.id} to="/accounts" className="acct">
              <span>{a.account.name}</span>
              <strong className={`num${a.balanceMinor < 0 ? ' neg' : ''}`}>{formatMoney(a.balanceMinor, a.account.currency)}</strong>
            </Link>
          ))}
        </div>
      </div>
      <div className="sec">
        <div className="sechd"><h2>Recent</h2><Link to="/transactions" className="link">See all</Link></div>
        {m.recent.length === 0 ? <div className="card sub">Nothing yet. Tap + to add your first transaction.</div> : <div className="list">{m.recent.map(row)}</div>}
      </div>
      {summary && open && !dismissed && (
        <MonthClosePrompt
          key={summary.month}
          summary={summary}
          accounts={data.accounts}
          transferPairId={transfers[summary.month] ?? null}
          onTransferred={(id) => setTransfers((t) => ({ ...t, [summary.month]: id }))}
          onClosed={async () => { await reload(); }}
          onDismiss={() => { setDismissed(true); setOpen(false); }}
        />
      )}
    </Screen>
  );
}
