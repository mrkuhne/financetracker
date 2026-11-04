import { describe, expect, it, vi } from 'vitest';

const me = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/data/client', () => ({ base44: { auth: { me: async () => me.value } } }));

import { getSettings } from '@/data/settings';

describe('getSettings brief coercion', () => {
  it('defaults when missing', async () => {
    me.value = {};
    const s = await getSettings();
    expect(s.digest_enabled).toBe(false);
    expect(s.news_interval_hours).toBe(4);
  });
  it('coerces invalid values', async () => {
    me.value = { digest_enabled: 'yes', news_interval_hours: 3 };
    const s = await getSettings();
    expect(s.digest_enabled).toBe(false);
    expect(s.news_interval_hours).toBe(4);
  });
  it('keeps valid values', async () => {
    me.value = { digest_enabled: true, news_interval_hours: 12 };
    const s = await getSettings();
    expect(s.digest_enabled).toBe(true);
    expect(s.news_interval_hours).toBe(12);
  });
});
