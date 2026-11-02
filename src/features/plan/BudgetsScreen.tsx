import { useEffect, useState } from 'react';
import { updateCategory } from '@/data/categories';
import { huf } from '@/features/home/fmt';
import { Screen } from '@/features/shell/Screen';
import { CatIcon } from '@/features/transactions/CatIcon';
import { parseAmountInput } from '@/lib/amountInput';
import { categoryBudgetRows } from './budgets';
import { usePlanData } from './usePlanData';

export function BudgetsScreen() {
  const { data, failed, reload } = usePlanData();
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Saved value we are waiting to see in the reloaded categories.
  const [awaiting, setAwaiting] = useState<{ id: string; value: number | null } | null>(null);

  const stored = awaiting && data ? data.categories.find((c) => c.id === awaiting.id)?.monthly_budget_minor ?? null : undefined;
  useEffect(() => {
    if (!awaiting) return;
    if (stored === awaiting.value) { setAwaiting(null); setBusy(false); setEditing(null); return; }
    // If the reload never shows the change, stop blocking the screen.
    const t = setTimeout(() => { setAwaiting(null); setBusy(false); setEditing(null); }, 8000);
    return () => clearTimeout(t);
  }, [awaiting, stored]);

  if (!data) {
    return (
      <Screen title="Category budgets" back="/plan">
        {failed
          ? <div className="card sub">Could not load your budgets. <button className="link" onClick={() => void reload()}>Retry</button></div>
          : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      </Screen>
    );
  }

  const { settings } = data.home;
  const rows = categoryBudgetRows(data.categories, data.home.txns, settings, data.planning.month);

  function open(id: string, budget: number | null) {
    if (busy) return;
    setEditing(id);
    setText(budget === null ? '' : String(budget / 100));
    setError('');
  }

  async function save(id: string) {
    const trimmed = text.trim();
    const value = trimmed === '' ? null : parseAmountInput(trimmed);
    if (trimmed !== '' && (value === null || value < 0)) return setError('Enter an amount, or leave it empty for no budget.');
    setBusy(true);
    setError('');
    try {
      await updateCategory(id, { monthly_budget_minor: value });
    } catch {
      setError('Could not save. Try again.');
      setBusy(false);
      return;
    }
    setAwaiting({ id, value });
    void reload();
  }

  return (
    <Screen title="Category budgets" back="/plan">
      <div className="list">
        {rows.map((r) => (
          <div key={r.category.id}>
            <button className="li" type="button" onClick={() => open(r.category.id, r.category.monthly_budget_minor)} aria-label={`Edit ${r.category.name} budget`}>
              <CatIcon category={r.category} />
              <span className="tx">
                <strong>{r.category.name}</strong>
                <span className="num">{r.budgetMinor === null ? 'No budget' : `Spent ${huf(r.spentMinor)} of ${huf(r.budgetMinor)}`}</span>
              </span>
              {r.isMonthOnly && <span className="pill">month only</span>}
            </button>
            {editing === r.category.id && (
              <div className="field">
                <span>Monthly budget (Ft)</span>
                <input
                  autoFocus inputMode="decimal" value={text} placeholder="No budget" aria-label={`${r.category.name} monthly budget`}
                  onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(r.category.id); }}
                />
                <button className="link" type="button" disabled={busy} onClick={() => void save(r.category.id)}>Save</button>
                <button className="link" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      <p className="note">Budgets are a guide for you and the assistant. Your free-to-spend number comes from the monthly plan.</p>
    </Screen>
  );
}
