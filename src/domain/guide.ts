export type GuideKey = 'track' | 'emergency' | 'debt' | 'invest' | 'passive';

export interface GuideStep { n: 1 | 2 | 3 | 4 | 5; key: GuideKey; title: string; status: 'done' | 'now' | 'todo' }

export interface GuideInput {
  trackedMonths: number;
  emergency: { savedMinor: number; targetMinor: number } | null;
  emergencyMonths: number;
  hasExpensiveDebt: boolean | null;
  monthlyInvestmentMinor: number | null;
}

/** The five-step guide with each step's status derived from the user's data. */
export function guideSteps(i: GuideInput): GuideStep[] {
  const defs: { n: GuideStep['n']; key: GuideKey; title: string; done: boolean }[] = [
    { n: 1, key: 'track', title: 'Know where the money goes', done: i.trackedMonths >= 1 },
    {
      n: 2, key: 'emergency', title: `Emergency fund: ${i.emergencyMonths} months`,
      done: !!i.emergency && i.emergency.targetMinor > 0 && i.emergency.savedMinor >= i.emergency.targetMinor,
    },
    { n: 3, key: 'debt', title: 'No expensive debt', done: i.hasExpensiveDebt === false },
    { n: 4, key: 'invest', title: 'Invest every month', done: (i.monthlyInvestmentMinor ?? 0) > 0 },
    { n: 5, key: 'passive', title: 'Build passive income', done: false },
  ];
  const firstOpen = defs.findIndex((d) => !d.done);
  return defs.map((d, idx) => ({
    n: d.n,
    key: d.key,
    title: d.title,
    status: d.done ? 'done' : idx === firstOpen ? 'now' : 'todo',
  }));
}

/** The step to work on now; null when every step is done. */
export function currentStep(steps: GuideStep[]): GuideStep | null {
  return steps.find((s) => s.status === 'now') ?? null;
}
