import { useCallback, useEffect, useState } from 'react';
import { Screen } from '@/features/shell/Screen';
import { Icon } from '@/features/shell/Icons';
import { createAccount, listAccounts, updateAccount } from '@/data/accounts';
import { listAllTransactions } from '@/data/transactions';
import { accountBalanceMinor } from '@/domain/balances';
import { formatMoney } from '@/domain/money';
import type { Account, Txn } from '@/domain/types';
import { AccountSheet } from './AccountSheet';
import { planAccountSave, type AccountDraft } from './accountRules';

type Editing = { account?: Account } | null;

export function AccountsScreen() {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([listAccounts(), listAllTransactions()]);
      setAccounts(a);
      setTxns(t);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(draft: AccountDraft) {
    const others = (accounts ?? []).filter((a) => a.id !== draft.id);
    const { saved, patches } = planAccountSave(others, draft);
    const { id, ...fields } = saved;
    if (id) await updateAccount(id, fields);
    else await createAccount(fields);
    for (const p of patches) await updateAccount(p.id, p.patch);
    setEditing(null);
    await load();
  }

  const visible = (accounts ?? []).filter((a) => showArchived || !a.archived);
  const hasArchived = (accounts ?? []).some((a) => a.archived);

  return (
    <Screen
      title="Accounts"
      back="/settings"
      right={
        <button className="ib soft" aria-label="Add account" onClick={() => setEditing({})}>
          <Icon name="plus" />
        </button>
      }
    >
      {failed && (
        <div className="card sub">
          Could not load accounts.{' '}
          <button className="link" style={{ color: 'var(--accent)', fontWeight: 600 }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {accounts === null && !failed && <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      {accounts !== null && visible.length === 0 && <div className="card sub">No accounts yet. Tap + to add your first one.</div>}
      {visible.length > 0 && (
        <div className="list">
          {visible.map((a) => (
            <button key={a.id} className="li" onClick={() => setEditing({ account: a })}>
              <span className="ci" style={{ ['--c' as string]: a.type === 'savings' ? 'var(--good)' : 'var(--accent)' }}>
                <Icon name={a.type === 'savings' ? 'piggy' : a.type === 'cash' ? 'coin' : 'wallet'} />
              </span>
              <span className="tx">
                <strong>{a.name}</strong>
                <span>{subtitle(a)}</span>
              </span>
              <span className="amt num">{formatMoney(accountBalanceMinor(a, txns), a.currency)}</span>
            </button>
          ))}
        </div>
      )}
      {hasArchived && (
        <div className="list">
          <div className="field">
            <span>Show archived</span>
            <button className={`sw${showArchived ? ' on' : ''}`} role="switch" aria-checked={showArchived} aria-label="Show archived" onClick={() => setShowArchived((v) => !v)} />
          </div>
        </div>
      )}
      {editing && <AccountSheet account={editing.account} onSave={save} onClose={() => setEditing(null)} />}
    </Screen>
  );
}

function subtitle(a: Account): string {
  const parts: string[] = [a.type[0].toUpperCase() + a.type.slice(1), a.currency];
  if (a.is_default) parts.push('Default');
  if (a.is_savings_target) parts.push('Savings target');
  if (a.archived) parts.push('Archived');
  return parts.join(' · ');
}
