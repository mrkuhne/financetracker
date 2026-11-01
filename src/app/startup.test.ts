import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensure = vi.fn(async () => {});
vi.mock('@/data/categories', () => ({ ensureDefaultCategories: () => ensure() }));

const materialize = vi.fn(async (_today: string) => 0);
vi.mock('./runMaterialize', () => ({ runMaterialize: (t: string) => materialize(t) }));
vi.mock('@/data/settings', () => ({ getSettings: async () => ({ timezone: 'Europe/Budapest' }) }));

describe('runStartup', () => {
  beforeEach(() => {
    ensure.mockClear();
    materialize.mockClear();
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
    await expect(runStartup()).resolves.toEqual({ ok: true });
    spy.mockRestore();
  });
});
