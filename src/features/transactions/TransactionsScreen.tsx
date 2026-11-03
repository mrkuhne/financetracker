import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '@/features/shell/Screen';
import { Icon } from '@/features/shell/Icons';
import { listAccounts } from '@/data/accounts';
import { listCategories, type Category } from '@/data/categories';
import { getSettings } from '@/data/settings';
import { listTransactions } from '@/data/transactions';
import { firstDay, lastDay, monthOf, nextMonth, prevMonth, todayInTz } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import type { Account, Txn, YearMonth } from '@/domain/types';
import { CatIcon } from './CatIcon';
import { TransactionForm } from './TransactionForm';
import { TXNS_CHANGED } from './events';
import { isInvest } from '@/domain/allowance';
import { dayLabel, groupByDay, investTitle, monthLabel } from './txLogic';

export function TransactionsScreen() {
  const nav = useNavigate();
  const [today, setToday] = useState('');
  const [month, setMonth] = useState<YearMonth>('');
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Txn | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void getSettings().then((s) => {
      const t = todayInTz(s.timezone);
      setToday(t);
      setMonth((m) => m || monthOf(t));
    }).catch(() => setFailed(true));
  }, []);

  const reqId = useRef(0);
  const load = useCallback(async () => {
    if (!month) return;
    const id = ++reqId.current;
    try {
      const [t, a, c] = await Promise.all([
        listTransactions({ from: firstDay(month), to: lastDay(month) }),
        listAccounts(),
        listCategories(),
      ]);
      if (id !== reqId.current) return;
      setTxns(t);
      setAccounts(a);
      setCategories(c);
      setFailed(false);
    } catch {
      if (id === reqId.current) setFailed(true);
    }
  }, [month]);

  useEffect(() => {
    setTxns(null);
    void load();
  }, [load]);
  useEffect(() => {
    const h = () => void load();
    window.addEventListener(TXNS_CHANGED, h);
    return () => window.removeEventListener(TXNS_CHANGED, h);
  }, [load]);

  const groups = useMemo(() => groupByDay(txns ?? []), [txns]);
  const acctName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const row = (t: Txn) => {
    const cat = t.category_id ? catById.get(t.category_id) : undefined;
    const transfer = t.kind === 'transfer_in' || t.kind === 'transfer_out';
    const name = transfer
      ? `Transfer ${t.kind === 'transfer_out' ? 'out' : 'in'}`
      : isInvest(t) ? investTitle(t) : t.note || cat?.name || 'Uncategorised';
    const sign = t.kind === 'income' || t.kind === 'transfer_in' || t.kind === 'invest_sell' ? '+' : '−';
    return (
      <button key={t.id} className={`li${t.needs_review ? ' rev' : ''}`} onClick={() => (t.needs_review && t.sms_message_id ? nav(`/review/${t.id}`) : setEditing(t))}>
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
        <span className={`amt num${t.kind === 'income' ? ' pos' : ''}`}>
          {sign}{formatMoney(t.amount_minor, t.currency)}
          {t.currency !== 'HUF' && <small>{formatMoney(t.amount_huf_minor, 'HUF')}</small>}
        </span>
      </button>
    );
  };

  return (
    <Screen
      title="Activity"
      big
      right={
        <Link to="/recurring" className="ib soft" aria-label="Recurring">
          <Icon name="repeat" />
        </Link>
      }
    >
      <div className="monthnav">
        <button className="ib soft" aria-label="Previous month" disabled={!month} onClick={() => setMonth(prevMonth(month))}>
          <Icon name="back" />
        </button>
        <strong>{month ? monthLabel(month) : ''}</strong>
        <button className="ib soft flip" aria-label="Next month" disabled={!month} onClick={() => setMonth(nextMonth(month))}>
          <Icon name="back" />
        </button>
      </div>
      {failed ? (
        <div className="card sub">
          Could not load transactions. <button className="chip" onClick={() => void load()}>Retry</button>
        </div>
      ) : txns === null ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : groups.length === 0 ? (
        <div className="card sub">Nothing in {monthLabel(month)} yet. Tap + to add a transaction.</div>
      ) : (
        groups.map((g) => (
          <div key={g.date} className="sec">
            <div className="dayhd">
              <span>{dayLabel(g.date, today)}</span>
              <span className="num">{g.totalHufMinor === 0 ? '' : `${g.totalHufMinor > 0 ? '+' : '−'}${formatMoney(Math.abs(g.totalHufMinor), 'HUF')}`}</span>
            </div>
            <div className="list">{g.txns.map(row)}</div>
          </div>
        ))
      )}
      {editing && <TransactionForm txn={editing} accounts={accounts} categories={categories} onClose={() => setEditing(null)} />}
    </Screen>
  );
}
