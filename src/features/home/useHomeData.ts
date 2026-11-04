import { useCallback, useEffect, useRef, useState } from 'react';
import { listAccounts } from '@/data/accounts';
import { getHufPerUnit } from '@/data/fx';
import { listMonthCloses } from '@/data/monthCloses';
import { listRules } from '@/data/recurring';
import { getSettings } from '@/data/settings';
import { listAllTransactions } from '@/data/transactions';
import { monthOf, todayInTz } from '@/domain/dates';
import { monthsToClose } from '@/domain/monthClose';
import type { Account, ISODate, MonthClose, RecurringRule, Settings, Txn, YearMonth } from '@/domain/types';
import { TXNS_CHANGED } from '@/features/transactions/events';
import { buildHomeModel, type HomeModel } from './homeModel';

export interface HomeData {
  today: ISODate; rules: RecurringRule[]; txns: Txn[]; settings: Settings; closes: MonthClose[];
  accounts: Account[]; model: HomeModel; pending: YearMonth[];
}

/** Loads everything Home/Breakdown need and builds the model. Throws when a load fails. */
export async function loadHomeData(): Promise<HomeData> {
  const [settings, rules, txns, closes, accounts] = await Promise.all([
    getSettings(), listRules(), listAllTransactions(), listMonthCloses(), listAccounts(),
  ]);
  const today = todayInTz(settings.timezone);
  // Non-HUF accounts are valued at today's rate; a failed lookup just values that account at 0.
  const rates: Record<string, number> = {};
  for (const c of new Set(accounts.filter((a) => !a.archived && a.currency !== 'HUF').map((a) => a.currency))) {
    try { rates[c] = await getHufPerUnit(c, today); } catch { /* leave unvalued */ }
  }
  const earliest = txns.length ? monthOf(txns.reduce((m, t) => (t.date < m ? t.date : m), txns[0].date)) : null;
  return {
    today, rules, txns, settings, closes, accounts,
    model: buildHomeModel({ today, rules, txns, settings, closes, accounts, rates }),
    pending: monthsToClose(today, earliest, closes),
  };
}

/** Loads everything Home/Breakdown need; reloads on `txns-changed` and via `reload()`. */
export function useHomeData() {
  const [data, setData] = useState<HomeData | null>(null);
  const [failed, setFailed] = useState(false);
  const reqId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++reqId.current;
    try {
      const loaded = await loadHomeData();
      if (id !== reqId.current) return;
      setData(loaded);
      setFailed(false);
    } catch {
      if (id === reqId.current) setFailed(true);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const h = () => void reload();
    window.addEventListener(TXNS_CHANGED, h);
    return () => window.removeEventListener(TXNS_CHANGED, h);
  }, [reload]);

  return { data, failed, reload };
}
