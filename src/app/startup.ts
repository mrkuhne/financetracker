import { ensureDefaultCategories } from '@/data/categories';
import { getSettings } from '@/data/settings';
import { todayInTz } from '@/domain/dates';
import { runMaterialize } from './runMaterialize';

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
    try {
      const { timezone } = await getSettings();
      await runMaterialize(todayInTz(timezone));
    } catch (e) {
      // Retry-safe: the next open tries again. Never block the app on it.
      console.error('Recurring materialization failed', e);
    }
    done = { ok: true };
    return done;
  })().finally(() => {
    running = null;
  });
  return running;
}
