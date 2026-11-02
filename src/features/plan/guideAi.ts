import { currentStep, type GuideStep } from '@/domain/guide';
import { huf } from '@/features/home/fmt';

export interface GuideFacts {
  avgIncomeMinor: number; avgExpensesMinor: number; trackedMonths: number; savingsTargetMinor: number; investmentMinor: number | null;
  emergencySavedMinor: number | null; emergencyTargetMinor: number | null; emergencyMonthsCovered: number | null; emergencyGoalMonths: number;
  monthsToEmergency: number | null; hasExpensiveDebt: boolean | null; steps: GuideStep[];
}

export const GUIDE_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string' },
    tips: {
      type: 'array',
      items: { type: 'object', properties: { step: { type: 'integer' }, text: { type: 'string' } }, required: ['step', 'text'] },
    },
  },
  required: ['intro', 'tips'],
};

const ft = (minor: number | null) => (minor == null ? 'unknown' : `${Math.round(minor / 100)} Ft`);

export function buildGuidePrompt(f: GuideFacts): string {
  const debt = f.hasExpensiveDebt === null ? 'not answered' : f.hasExpensiveDebt ? 'yes' : 'no';
  return [
    'Explain where the user stands on the five steps of a smart money guide, in plain, warm English.',
    'This is educational: no specific securities, tickers or guaranteed returns. Use only the numbers given below; never invent a number.',
    'Return "intro" (at most 3 sentences) and "tips": one tip per step, each at most 2 sentences, with "step" set to the step number 1 to 5.',
    '',
    'Numbers (HUF):',
    `- Average monthly income: ${ft(f.avgIncomeMinor)}`,
    `- Average monthly expenses: ${ft(f.avgExpensesMinor)}`,
    `- Months tracked: ${f.trackedMonths}`,
    `- Monthly savings target: ${ft(f.savingsTargetMinor)}`,
    `- Monthly investment amount: ${ft(f.investmentMinor)}`,
    `- Emergency fund saved: ${ft(f.emergencySavedMinor)} of ${ft(f.emergencyTargetMinor)} (goal: ${f.emergencyGoalMonths} months of expenses)`,
    `- Emergency fund covers: ${f.emergencyMonthsCovered ?? 'unknown'} months`,
    `- Months to reach the emergency goal at the savings target: ${f.monthsToEmergency ?? 'unknown'}`,
    `- Has expensive debt: ${debt}`,
    '',
    'Steps:',
    ...f.steps.map((s) => `${s.n}. ${s.title} (${s.status})`),
  ].join('\n');
}

export function normalizeGuide(raw: unknown): { intro: string; tips: Record<number, string> } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.intro !== 'string') return null;
  const intro = r.intro.trim().slice(0, 800);
  if (!intro) return null;
  const tips: Record<number, string> = {};
  if (Array.isArray(r.tips)) {
    for (const t of r.tips) {
      if (!t || typeof t !== 'object') continue;
      const { step, text } = t as Record<string, unknown>;
      if (typeof step !== 'number' || !Number.isInteger(step) || step < 1 || step > 5 || typeof text !== 'string') continue;
      const clean = text.trim().slice(0, 400);
      if (clean) tips[step] = clean;
    }
  }
  return { intro, tips };
}

const bucket = (minor: number) => Math.round(minor / 5_000_000);

export function guideCacheKey(f: GuideFacts): string {
  return [currentStep(f.steps)?.n ?? 0, bucket(f.avgIncomeMinor), bucket(f.avgExpensesMinor), bucket(f.emergencySavedMinor ?? 0)].join('|');
}

export function fallbackFact(step: GuideStep, f: GuideFacts): string {
  switch (step.key) {
    case 'track':
      return f.trackedMonths > 0 ? `${f.trackedMonths} months tracked.` : 'Start by tracking a full month.';
    case 'emergency': {
      const base = `${f.emergencyMonthsCovered ?? '—'} of ${f.emergencyGoalMonths} months.`;
      return f.monthsToEmergency != null && f.monthsToEmergency > 0
        ? `${base} At ${huf(f.savingsTargetMinor)} a month you reach it in about ${f.monthsToEmergency} months.`
        : base;
    }
    case 'debt':
      return f.hasExpensiveDebt === null
        ? 'Do you have a credit card balance or personal loan?'
        : f.hasExpensiveDebt ? 'Pay off expensive debt before investing.' : 'No expensive debt. Nothing to do here.';
    case 'invest':
      return (f.investmentMinor ?? 0) > 0
        ? `Start small: ${huf(f.investmentMinor as number)} a month.`
        : 'Set a monthly amount once the emergency fund is on track.';
    case 'passive':
      return 'Once investments grow, dividends and interest start to matter.';
  }
}
