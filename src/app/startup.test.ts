import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensure = vi.fn(async () => {});
vi.mock('@/data/categories', () => ({ ensureDefaultCategories: () => ensure() }));

const materialize = vi.fn(async () => 0);
vi.mock('./materialize', () => ({ materializeRecurring: () => materialize() }));
vi.mock('@/data/settings', () => ({ getSettings: async () => ({ timezone: 'Europe/Budapest' }) }));
vi.mock('@/data/recurring', () => ({ listRules: vi.fn(), updateRule: vi.fn() }));
vi.mock('@/data/transactions', () => ({ createTransaction: vi.fn(), listTransactions: vi.fn() }));
vi.mock('@/data/fx', () => ({ getHufPerUnit: vi.fn() }));

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
});
