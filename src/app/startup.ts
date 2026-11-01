import { ensureDefaultCategories } from '@/data/categories';

export interface StartupResult {
  ok: true;
}

let running: Promise<StartupResult> | null = null;
let done: StartupResult | null = null;

/** Runs once per session (single-flight, safe under StrictMode double effects). Extended in Tasks 10 and 11. */
export function runStartup(): Promise<StartupResult> {
  if (done) return Promise.resolve(done);
  running ??= (async () => {
    await ensureDefaultCategories();
    done = { ok: true };
    return done;
  })().finally(() => {
    running = null;
  });
  return running;
}
