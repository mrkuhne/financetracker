import { beforeEach, describe, expect, it, vi } from 'vitest';

const filter = vi.fn();
const create = vi.fn();
vi.mock('@/data/client', () => ({
  base44: { entities: { FxRate: { filter: (...a: unknown[]) => filter(...a), create: (...a: unknown[]) => create(...a) } } },
}));

import { getHufPerUnit } from '@/data/fx';

const json = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

describe('getHufPerUnit', () => {
  beforeEach(() => {
    filter.mockReset();
    create.mockReset();
  });

  it('returns 1 for HUF without fetching', async () => {
    const fetchSpy = vi.fn();
    expect(await getHufPerUnit('HUF', '2026-11-01', fetchSpy)).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(filter).not.toHaveBeenCalled();
  });

  it('fetches on cache miss and caches the rate', async () => {
    filter.mockResolvedValue([]);
    const fetchSpy = vi.fn().mockResolvedValue(json({ rates: { HUF: 395.5 } }));
    expect(await getHufPerUnit('EUR', '2026-11-02', fetchSpy)).toBe(395.5);
    expect(fetchSpy).toHaveBeenCalledWith('https://api.frankfurter.dev/v1/2026-11-02?from=EUR&to=HUF');
    expect(create).toHaveBeenCalledWith({ pair: 'EURHUF', date: '2026-11-02', rate: 395.5 });
  });

  it('uses the cache on hit', async () => {
    filter.mockResolvedValue([{ pair: 'EURHUF', date: '2026-11-02', rate: 400 }]);
    const fetchSpy = vi.fn();
    expect(await getHufPerUnit('EUR', '2026-11-02', fetchSpy)).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('throws on a failed fetch', async () => {
    filter.mockResolvedValue([]);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(getHufPerUnit('EUR', '2026-11-02', fetchSpy)).rejects.toThrow();
  });
});
