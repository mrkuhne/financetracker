import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensure = vi.fn(async () => {});
vi.mock('@/data/categories', () => ({ ensureDefaultCategories: () => ensure() }));

describe('runStartup', () => {
  beforeEach(() => {
    ensure.mockClear();
    vi.resetModules();
  });

  it('seeds categories once under concurrent calls', async () => {
    const { runStartup } = await import('./startup');
    await Promise.all([runStartup(), runStartup()]);
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it('allows a retry after failure', async () => {
    const { runStartup } = await import('./startup');
    ensure.mockRejectedValueOnce(new Error('boom'));
    await expect(runStartup()).rejects.toThrow('boom');
    await runStartup();
    expect(ensure).toHaveBeenCalledTimes(2);
  });
});
