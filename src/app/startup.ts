import { ensureDefaultCategories } from '@/data/categories';
import { getSettings } from '@/data/settings';
import { todayInTz } from '@/domain/dates';
import type { ISODate } from '@/domain/types';
import { TXNS_CHANGED, notifyTxnsChanged } from '@/features/transactions/events';
import { refreshBriefSnapshot } from './briefSnapshot';
import { runConvertSms } from './runConvertSms';
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

/** Turn pending parsed SMS into transactions. Never throws. */
async function convertSms(): Promise<void> {
  try {
    if ((await runConvertSms()) > 0) notifyTxnsChanged();
  } catch (e) {
    console.error('SMS conversion failed', e);
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

/**
 * Refresh the brief snapshot whenever transactions change in-app (expenses, buys, sells…), so tomorrow's brief
 * never reads stale numbers. Bursts coalesce in refreshBriefSnapshot's single-flight. Returns an unsubscribe.
 */
export function wireSnapshotRefresh(target: EventTarget, refresh: () => Promise<void> = refreshBriefSnapshot): () => void {
  const h = () => void refresh();
  target.addEventListener(TXNS_CHANGED, h);
  return () => target.removeEventListener(TXNS_CHANGED, h);
}

function listenForResume() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  if (typeof window !== 'undefined') wireSnapshotRefresh(window);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    void Promise.all([resumeIfNewDay(), convertSms()]).then(refreshBriefSnapshot);
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
    // Not awaited: conversion can be slow (FX lookups) and notifies on its own when done.
    // The snapshot waits for conversion so it sees the same transactions Home does.
    void convertSms().then(refreshBriefSnapshot);
    listenForResume();
    done = { ok: true };
    return done;
  })().finally(() => {
    running = null;
  });
  return running;
}
