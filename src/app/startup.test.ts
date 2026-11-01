import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensure = vi.fn(async () => {});
vi.mock('@/data/categories', () => ({ ensureDefaultCategories: () => ensure() }));

const materialize = vi.fn(async (_today: string) => 0);
vi.mock('./runMaterialize', () => ({ runMaterialize: (t: string) => materialize(t) }));
vi.mock('@/data/settings', () => ({ getSettings: async () => ({ timezone: 'Europe/Budapest' }) }));
const notify = vi.fn();
vi.mock('@/features/transactions/events', () => ({ notifyTxnsChanged: () => notify() }));
const today = vi.fn(() => '2026-11-01');
vi.mock('@/domain/dates', () => ({ todayInTz: () => today() }));

describe('runStartup', () => {
  beforeEach(() => {
    ensure.mockClear();
    materialize.mockClear();
    notify.mockClear();
    today.mockReturnValue('2026-11-01');
    vi.resetModules();
  });

  it('seeds categories once under concurrent calls', async () => {
    const { runStartup } = await import('./startup');
    await Promise.all([runStartup(), runStartup()]);
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(materialize).toHaveBeenCalledTimes(1);
  });

  it('allows a retry after failure', async () => {
    const { runStartup } = await import('./startup');
    ensure.mockRejectedValueOnce(new Error('boom'));
    await expect(runStartup()).rejects.toThrow('boom');
    await runStartup();
    expect(ensure).toHaveBeenCalledTimes(2);
  });

  it('does not fail startup when materialization throws', async () => {
    const { runStartup } = await import('./startup');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    materialize.mockRejectedValueOnce(new Error('offline'));
    await expect(runStartup()).resolves.toMatchObject({ ok: true });
    spy.mockRestore();
  });

  it('re-materializes on resume only when the day changed', async () => {
    const { runStartup, resumeIfNewDay } = await import('./startup');
    await runStartup();
    await resumeIfNewDay();
    expect(materialize).toHaveBeenCalledTimes(1);
    today.mockReturnValue('2026-11-02');
    materialize.mockResolvedValueOnce(2);
    await resumeIfNewDay();
    expect(materialize).toHaveBeenLastCalledWith('2026-11-02');
    expect(materialize).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(1);
    await resumeIfNewDay();
    expect(materialize).toHaveBeenCalledTimes(2);
  });
});
