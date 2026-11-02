import { base44 } from '@/data/client';
import type { GuideCache, Settings } from '@/domain/types';

export const DEFAULT_SETTINGS: Settings = {
  base_currency: 'HUF',
  monthly_savings_target_minor: 0,
  monthly_investment_amount_minor: null,
  emergency_fund_months: 6,
  week_start: 'monday',
  digest_time: '07:00',
  timezone: 'Europe/Budapest',
  month_overrides: {},
  has_expensive_debt: null,
};

export async function getSettings(): Promise<Settings> {
  const me = (await base44.auth.me()) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (me[k] !== undefined && me[k] !== null) out[k] = me[k];
  const mo = me.month_overrides;
  if (!mo || typeof mo !== 'object' || Array.isArray(mo)) out.month_overrides = {};
  return out as unknown as Settings;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await base44.auth.updateMe(patch);
}

export async function getGuideCache(): Promise<GuideCache | null> {
  const me = (await base44.auth.me()) as Record<string, unknown>;
  const c = me.guide_cache as Record<string, unknown> | null | undefined;
  if (!c || typeof c !== 'object' || typeof c.key !== 'string' || typeof c.intro !== 'string') return null;
  return c as unknown as GuideCache;
}

export async function saveGuideCache(c: GuideCache): Promise<void> {
  await base44.auth.updateMe({ guide_cache: c });
}
