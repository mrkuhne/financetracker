import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { HomeData } from '@/features/home/useHomeData';
import type { InvestCore } from '@/features/invest/investModel';

const m = vi.hoisted(() => ({ loadHomeData: vi.fn(), loadInvestCore: vi.fn(), saveBriefSnapshot: vi.fn() }));
vi.mock('@/features/home/useHomeData', () => ({ loadHomeData: m.loadHomeData }));
vi.mock('@/features/invest/useInvestData', () => ({ loadInvestCore: m.loadInvestCore }));
vi.mock('@/data/settings', () => ({ saveBriefSnapshot: m.saveBriefSnapshot }));

import { refreshBriefSnapshot } from './briefSnapshot';

const home = (log: Record<string, number>) => ({
  today: '2026-11-03', txns: [], settings: { invest_suggested_log: log }, model: { monthly: { remainingMinor: 1 } },
}) as unknown as HomeData;
const core = (suggestion: unknown) => ({
  suggestion, split: null, emergencyDone: false, positions: [], valuations: new Map(),
}) as unknown as InvestCore;
const computed = { kind: 'amount', amountMinor: 3_700_000, source: 'computed', emergencyDone: false };

beforeEach(() => { vi.resetAllMocks(); m.saveBriefSnapshot.mockResolvedValue(undefined); });

describe('refreshBriefSnapshot', () => {
  test('merges the computed amount into the log, keeping other months', async () => {
    m.loadHomeData.mockResolvedValue(home({ '2026-10': 100 }));
    m.loadInvestCore.mockResolvedValue(core(computed));
    await refreshBriefSnapshot();
    expect(m.saveBriefSnapshot.mock.calls[0][1]).toEqual({ '2026-10': 100, '2026-11': 3_700_000 });
  });

  test('skips the log for a setting amount and when unchanged', async () => {
    m.loadHomeData.mockResolvedValue(home({}));
    m.loadInvestCore.mockResolvedValue(core({ ...computed, source: 'setting' }));
    await refreshBriefSnapshot();
    expect(m.saveBriefSnapshot.mock.calls[0][1]).toBeUndefined();
    m.loadHomeData.mockResolvedValue(home({ '2026-11': 3_700_000 }));
    m.loadInvestCore.mockResolvedValue(core(computed));
    await refreshBriefSnapshot();
    expect(m.saveBriefSnapshot.mock.calls[1][1]).toBeUndefined();
  });

  test('calls during a run coalesce into exactly one trailing rerun', async () => {
    let release!: () => void;
    m.loadHomeData.mockImplementationOnce(() => new Promise((r) => { release = () => r(home({})); }));
    m.loadHomeData.mockResolvedValue(home({}));
    m.loadInvestCore.mockResolvedValue(core({ kind: 'no_data' }));
    const first = refreshBriefSnapshot();
    const a = refreshBriefSnapshot();
    const b = refreshBriefSnapshot();
    expect(m.loadHomeData).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, a, b]);
    expect(m.loadHomeData).toHaveBeenCalledTimes(2);
    expect(m.saveBriefSnapshot).toHaveBeenCalledTimes(2);
  });

  test('never throws', async () => {
    m.loadHomeData.mockRejectedValue(new Error('x'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(refreshBriefSnapshot()).resolves.toBeUndefined();
  });
});
