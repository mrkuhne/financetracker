import { base44 } from '@/data/client';
import type { BriefSnapshot, GuideCache, InvestCache, Settings } from '@/domain/types';

export const DEFAULT_SETTINGS: Settings = {
  base_currency: 'HUF',
  monthly_savings_target_minor: 0,
  monthly_investment_amount_minor: null,
  emergency_fund_months: 6,
  week_start: 'monday',
  digest_time: '07:00',
  digest_enabled: false,
  news_interval_hours: 4,
  timezone: 'Europe/Budapest',
  month_overrides: {},
  has_expensive_debt: null,
  risk_profile: 'cautious',
  risk_checkin_at: null,
  invest_suggested_log: {},
};

export async function getSettings(): Promise<Settings> {
  const me = (await base44.auth.me()) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (me[k] !== undefined && me[k] !== null) out[k] = me[k];
  const mo = me.month_overrides;
  if (!mo || typeof mo !== 'object' || Array.isArray(mo)) out.month_overrides = {};
  const log = me.invest_suggested_log;
  if (!log || typeof log !== 'object' || Array.isArray(log)) out.invest_suggested_log = {};
  if (!['cautious', 'balanced', 'bold'].includes(out.risk_profile as string)) out.risk_profile = 'cautious';
  if (typeof out.digest_enabled !== 'boolean') out.digest_enabled = false;
  if (![2, 4, 8, 12].includes(out.news_interval_hours as number)) out.news_interval_hours = 4;
  return out as unknown as Settings;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await base44.auth.updateMe(patch);
}

export async function getGuideCache(): Promise<GuideCache | null> {
  const me = (await base44.auth.me()) as Record<string, unknown>;
  const c = me.guide_cache as Record<string, unknown> | null | undefined;
  if (!c || typeof c !== 'object' || typeof c.key !== 'string' || typeof c.intro !== 'string') return null;
  const tips = c.tips && typeof c.tips === 'object' && !Array.isArray(c.tips) ? c.tips : {};
  return { ...c, tips, generated_at: typeof c.generated_at === 'string' ? c.generated_at : '' } as unknown as GuideCache;
}

export async function saveGuideCache(c: GuideCache): Promise<void> {
  await base44.auth.updateMe({ guide_cache: c });
}

export async function getInvestCache(): Promise<InvestCache | null> {
  const me = (await base44.auth.me()) as Record<string, unknown>;
  const c = me.invest_cache as Record<string, unknown> | null | undefined;
  if (!c || typeof c !== 'object' || typeof c.key !== 'string' || typeof c.intro !== 'string') return null;
  if (!c.per_type || typeof c.per_type !== 'object' || Array.isArray(c.per_type)) return null;
  return { ...c, generated_at: typeof c.generated_at === 'string' ? c.generated_at : '' } as unknown as InvestCache;
}

export async function saveInvestCache(c: InvestCache): Promise<void> {
  await base44.auth.updateMe({ invest_cache: c });
}

export async function saveBriefSnapshot(s: BriefSnapshot, suggestedLog?: Record<string, number>): Promise<void> {
  await base44.auth.updateMe(suggestedLog ? { brief_snapshot: s, invest_suggested_log: suggestedLog } : { brief_snapshot: s });
}
