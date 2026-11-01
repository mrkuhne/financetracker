import { base44 } from '@/data/client';
import type { Settings } from '@/domain/types';

export const DEFAULT_SETTINGS: Settings = {
  base_currency: 'HUF',
  monthly_savings_target_minor: 0,
  monthly_investment_amount_minor: null,
  emergency_fund_months: 6,
  week_start: 'monday',
  digest_time: '07:00',
  timezone: 'Europe/Budapest',
};

export async function getSettings(): Promise<Settings> {
  const me = (await base44.auth.me()) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (me[k] !== undefined && me[k] !== null) out[k] = me[k];
  return out as unknown as Settings;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await base44.auth.updateMe(patch);
}
