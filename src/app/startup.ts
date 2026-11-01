import { ensureDefaultCategories } from '@/data/categories';
import { getSettings } from '@/data/settings';
import { todayInTz } from '@/domain/dates';
import type { ISODate } from '@/domain/types';
import { notifyTxnsChanged } from '@/features/transactions/events';
import { runMaterialize } from './runMaterialize';

export interface StartupResult {
  ok: true;
}

let running: Promise<StartupResult> | null = null;
let done: StartupResult | null = null;
/** The user-timezone day of the last materialize attempt. */
let lastRunDay: ISODate | null = null;
let listening = false;

/** Materialize for `today` (single-flight underneath). Never throws: failures retry on the next open/resume. */
async function materializeFor(today: ISODate): Promise<number> {
  lastRunDay = today;
  try {
    return await runMaterialize(today);
  } catch (e) {
    console.error('Recurring materialization failed', e);
    return 0;
  }
}

/** On returning to the app: if the day (in the user's timezone) changed since the last run, materialize again. */
export async function resumeIfNewDay(): Promise<void> {
  try {
    const today = todayInTz((await getSettings()).timezone);
    if (today === lastRunDay) return;
    if ((await materializeFor(today)) > 0) notifyTxnsChanged();
  } catch (e) {
    console.error('Resume check failed', e);
  }
}

function listenForResume() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void resumeIfNewDay();
  });
}

/** Runs once per session (single-flight, safe under StrictMode double effects). Never blocks on materialize errors. */
export function runStartup(): Promise<StartupResult> {
  if (done) return Promise.resolve(done);
  running ??= (async () => {
    await ensureDefaultCategories();
    try {
      const { timezone } = await getSettings();
      await materializeFor(todayInTz(timezone));
    } catch (e) {
      console.error('Could not load settings for materialization', e);
    }
    listenForResume();
    done = { ok: true };
    return done;
  })().finally(() => {
    running = null;
  });
  return running;
}
