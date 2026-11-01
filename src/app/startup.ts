import { ensureDefaultCategories } from '@/data/categories';
import { getSettings } from '@/data/settings';
import { listRules, updateRule } from '@/data/recurring';
import { createTransaction, listTransactions } from '@/data/transactions';
import { getHufPerUnit } from '@/data/fx';
import { todayInTz } from '@/domain/dates';
import { materializeRecurring } from './materialize';

export interface StartupResult {
  ok: true;
}

let running: Promise<StartupResult> | null = null;
let done: StartupResult | null = null;

/** Runs once per session (single-flight, safe under StrictMode double effects). Extended in Task 11. */
export function runStartup(): Promise<StartupResult> {
  if (done) return Promise.resolve(done);
  running ??= (async () => {
    await ensureDefaultCategories();
    const { timezone } = await getSettings();
    await materializeRecurring(todayInTz(timezone), { listRules, listTransactions, createTransaction, updateRule, getHufPerUnit });
    done = { ok: true };
    return done;
  })().finally(() => {
    running = null;
  });
  return running;
}
