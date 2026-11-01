import { ensureDefaultCategories } from '@/data/categories';
import { getSettings } from '@/data/settings';
import { listMonthCloses } from '@/data/monthCloses';
import { earliestTransactionMonth } from '@/data/transactions';
import { todayInTz } from '@/domain/dates';
import { monthsToClose } from '@/domain/monthClose';
import type { YearMonth } from '@/domain/types';
import { runMaterialize } from './runMaterialize';

export interface StartupResult {
  ok: true;
  /** Past months with data that still need the month-close prompt, oldest first. */
  pendingCloses: YearMonth[];
}

let running: Promise<StartupResult> | null = null;
let done: StartupResult | null = null;

/** Runs once per session (single-flight, safe under StrictMode double effects). Never blocks on materialize errors. */
export function runStartup(): Promise<StartupResult> {
  if (done) return Promise.resolve(done);
  running ??= (async () => {
    await ensureDefaultCategories();
    let pendingCloses: YearMonth[] = [];
    try {
      const { timezone } = await getSettings();
      const today = todayInTz(timezone);
      try {
        await runMaterialize(today);
      } catch (e) {
        // Retry-safe: the next open tries again. Never block the app on it.
        console.error('Recurring materialization failed', e);
      }
      pendingCloses = monthsToClose(today, await earliestTransactionMonth(), await listMonthCloses());
    } catch (e) {
      console.error('Could not determine pending month closes', e);
    }
    done = { ok: true, pendingCloses };
    return done;
  })().finally(() => {
    running = null;
  });
  return running;
}
