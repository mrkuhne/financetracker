import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Screen } from '@/features/shell/Screen';
import { Icon } from '@/features/shell/Icons';
import { listAccounts } from '@/data/accounts';
import { listCategories, type Category } from '@/data/categories';
import { getSms, type SmsMessageRow } from '@/data/smsMessages';
import { getTransaction, listReviewTxns, updateTransaction } from '@/data/transactions';
import { formatMoney } from '@/domain/money';
import type { Account, Txn } from '@/domain/types';
import { TransactionForm } from '@/features/transactions/TransactionForm';
import { notifyTxnsChanged } from '@/features/transactions/events';

const niceDate = (d: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(Date.parse(`${d}T12:00:00Z`));

export function ReviewSmsScreen() {
  const { id = '' } = useParams();
  return <ReviewSmsInner key={id} id={id} />;
}

function ReviewSmsInner({ id }: { id: string }) {
  const nav = useNavigate();
  const [txn, setTxn] = useState<Txn | null | undefined>(undefined); // undefined = loading
  const [sms, setSms] = useState<SmsMessageRow | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setTxn(undefined);
    setFailed(false);
    try {
      const t = await getTransaction(id);
      if (!t) { setTxn(null); return; }
      const [a, c, s] = await Promise.all([
        listAccounts(), listCategories(), t.sms_message_id ? getSms(t.sms_message_id) : Promise.resolve(null),
      ]);
      setAccounts(a); setCategories(c); setSms(s); setTxn(t);
    } catch {
      setFailed(true);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (failed) {
    return <Screen title="Check SMS" back="/"><div className="card sub">Could not load this item. <button className="link" onClick={() => void load()}>Retry</button></div></Screen>;
  }
  if (txn === undefined) {
    return <Screen title="Check SMS" back="/"><div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} /></Screen>;
  }
  if (txn === null) {
    return <Screen title="Check SMS" back="/"><div className="card sub">This item is gone. <Link to="/" className="link">Back to Home</Link></div></Screen>;
  }

  const cat = categories.find((c) => c.id === txn.category_id);
  const acct = accounts.find((a) => a.id === txn.account_id);
  const plus = txn.kind === 'income';

  async function approve() {
    setBusy(true);
    setError('');
    try {
      await updateTransaction(id, { needs_review: false });
    } catch {
      setError('Could not save. Try again.');
      setBusy(false);
      return;
    }
    notifyTxnsChanged();
    let next: Txn | undefined;
    try {
      next = (await listReviewTxns())
        .filter((t) => t.sms_message_id && t.id !== id)
        .sort((x, y) => x.date.localeCompare(y.date))[0];
    } catch {
      next = undefined;
    }
    nav(next ? `/review/${next.id}` : '/');
  }

  return (
    <Screen title="Check SMS" back="/">
      {sms?.text && (
        <div className="sec"><span className="ov">Message from {sms.sender}</span><div className="smsraw">{sms.text}</div></div>
      )}
      <div className="sec">
        <span className="ov">What we read</span>
        <div className="list">
          <div className="field"><span>Amount</span><b className="num">{plus ? '+' : '−'}{formatMoney(txn.amount_minor, txn.currency)}</b></div>
          <div className="field"><span>Merchant</span><b>{txn.note || '—'}</b></div>
          <div className="field"><span>Category</span><b>{cat?.name ?? 'Uncategorised'} <span className="pill ai">AI guess</span></b></div>
          <div className="field"><span>Account</span><b>{acct?.name ?? 'Account'}</b></div>
          <div className="field"><span>Date</span><b>{niceDate(txn.date)}</b></div>
        </div>
      </div>
      {error && <div className="card sub" role="alert">{error}</div>}
      <div className="row2">
        <button className="btn ghost" disabled={busy} onClick={() => setEditing(true)}><Icon name="edit" />Edit</button>
        <button className="btn" disabled={busy} onClick={() => void approve()}><Icon name="check" />Looks right</button>
      </div>
      <p className="note"><Icon name="info" />SMS items count toward your allowance right away. Checking only confirms the details.</p>
      {editing && <TransactionForm txn={txn} accounts={accounts} categories={categories} onClose={() => nav('/')} />}
    </Screen>
  );
}
