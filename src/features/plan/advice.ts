import type { Category } from '@/data/categories';
import { monthsBetween } from '@/domain/dates';
import type { OptionImpact, PlanningModel } from '@/domain/planning';
import type { Advice, AdviceChange, ISODate, PurchaseOption, YearMonth } from '@/domain/types';

export interface AdviceInput {
  planTitle: string; neededBy: ISODate | null; currentMonth: YearMonth;
  options: { letter: string; name: string; payment: 'one_time' | 'installments'; priceMinor: number; installmentMinor: number | null; count: number | null; impact: OptionImpact }[];
  remainingMinor: number; setAsideMinor: number; savingsTargetMinor: number; emergencyMonthsCovered: number | null; emergencyGoalMonths: number;
  categories: { name: string; budgetMinor: number | null; spentThisMonthMinor: number }[];
}

/** Raw LLM answer shape; amounts are whole forints because the model reasons better in Ft. */
export const ADVICE_SCHEMA = {
  type: 'object',
  properties: {
    recommended_option: { type: 'integer' }, best_month: { type: 'string' },
    summary: { type: 'string' }, others: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['category_budget', 'savings_target', 'postpone'] },
          category_name: { type: 'string' }, new_amount_huf: { type: 'integer' }, month: { type: 'string' },
        },
        required: ['type'],
      },
    },
  },
  required: ['recommended_option', 'best_month', 'summary', 'changes'],
};

const ft = (minor: number) => `${Math.round(minor / 100).toLocaleString('en-US').replace(/,/g, ' ')} Ft`;

export function buildAdvicePrompt(i: AdviceInput): string {
  const opts = i.options.map((o) => {
    const pay = o.payment === 'installments' ? `${ft(o.installmentMinor ?? 0)} x ${o.count ?? 0} months` : 'paid at once';
    const safe = o.impact.safeMonth ?? 'not within 2 years';
    return `${o.letter}. ${o.name}: price ${ft(o.priceMinor)}, ${pay}. Monthly cost ${ft(o.impact.monthlyCostMinor)}. If bought now: left this month ${ft(o.impact.leftThisMonthMinor)}, needs ${ft(o.impact.touchesSavingsMinor)} from savings, safe to buy from ${safe}.`;
  });
  const cats = i.categories.map((c) => `- ${c.name}: budget ${c.budgetMinor === null ? 'none' : ft(c.budgetMinor)}, spent this month ${ft(c.spentThisMonthMinor)}`);
  return [
    'You help someone choose between purchase options in a personal budgeting app.',
    'The options are lettered A, B, C and so on. recommended_option is 1-based: A = 1, B = 2.',
    'All numbers below are computed by the app. Do not recalculate them and do not invent any.',
    `Current month: ${i.currentMonth}.`,
    '',
    `Purchase: ${i.planTitle}${i.neededBy ? `, needed by ${i.neededBy}` : ''}.`,
    ...opts,
    '',
    `Left to spend this month: ${ft(i.remainingMinor)}. Set aside per month for purchases: ${ft(i.setAsideMinor)}.`,
    `Monthly savings target: ${ft(i.savingsTargetMinor)}.`,
    `Emergency fund: ${i.emergencyMonthsCovered === null ? 'unknown' : `${i.emergencyMonthsCovered} months of expenses`} covered, goal ${i.emergencyGoalMonths} months.`,
    'Expense categories:',
    ...(cats.length ? cats : ['- none']),
    '',
    'Rules:',
    '- Suggest at most 3 changes, only of these types: category_budget (lower one category budget), savings_target (lower the monthly savings target), postpone (buy in a later month).',
    '- Every cut must be lower than the current value. Give amounts in whole forints (new_amount_huf).',
    '- Months are YYYY-MM, from the current month up to 24 months ahead.',
    '- best_month is the month to buy. For postpone, month is that later month.',
    '- summary: at most 3 sentences, name the recommended option and the month.',
    '- others: at most 2 sentences on why not the other options.',
    '- Write in plain English. This is educational, with no guarantees.',
  ].join('\n');
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 1000) : '');

export function normalizeAdvice(raw: unknown, ctx: {
  optionCount: number; currentMonth: YearMonth; savingsTargetMinor: number; categories: Category[]; effectiveBudget: (categoryId: string) => number | null;
}): Advice | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isInt(r.recommended_option) || r.recommended_option < 1 || r.recommended_option > ctx.optionCount) return null;
  const summary = text(r.summary);
  if (!summary) return null;

  const offset = (m: unknown) => (typeof m === 'string' && MONTH_RE.test(m) ? monthsBetween(ctx.currentMonth, m) : null);
  const bestOffset = offset(r.best_month);
  const bestMonth = typeof r.best_month === 'string' && bestOffset !== null && bestOffset >= 0 && bestOffset <= 24 ? r.best_month : ctx.currentMonth;

  const changes: AdviceChange[] = [];
  const seenCats = new Set<string>();
  let hasSavings = false, hasPostpone = false;
  let postponeMonth: YearMonth | null = null;
  for (const c of Array.isArray(r.changes) ? r.changes : []) {
    if (changes.length >= 3) break;
    if (!c || typeof c !== 'object') continue;
    const ch = c as Record<string, unknown>;
    if (ch.type === 'category_budget') {
      const name = typeof ch.category_name === 'string' ? ch.category_name.trim().toLowerCase() : '';
      const cat = ctx.categories.find((x) => x.kind === 'expense' && x.name.trim().toLowerCase() === name);
      if (!cat || seenCats.has(cat.id) || !isInt(ch.new_amount_huf) || ch.new_amount_huf < 0 || ch.new_amount_huf > 10_000_000) continue;
      const to = ch.new_amount_huf * 100;
      const from = ctx.effectiveBudget(cat.id);
      if (from !== null && to >= from) continue;
      seenCats.add(cat.id);
      changes.push({ type: 'category_budget', category_id: cat.id, category_name: cat.name, from_minor: from, to_minor: to });
    } else if (ch.type === 'savings_target') {
      if (hasSavings || !isInt(ch.new_amount_huf)) continue;
      const to = ch.new_amount_huf * 100;
      if (to < 0 || to >= ctx.savingsTargetMinor) continue;
      hasSavings = true;
      changes.push({ type: 'savings_target', from_minor: ctx.savingsTargetMinor, to_minor: to });
    } else if (ch.type === 'postpone') {
      const o = offset(ch.month);
      if (hasPostpone || o === null || o < 1 || o > 24) continue;
      hasPostpone = true;
      postponeMonth = ch.month as YearMonth;
      changes.push({ type: 'postpone', month: postponeMonth });
    }
  }
  return { option_index: r.recommended_option - 1, month: postponeMonth ?? bestMonth, summary, others: text(r.others), changes };
}

export function adviceCutsMinor(changes: AdviceChange[]): number {
  let sum = 0;
  for (const c of changes) {
    if (c.type === 'savings_target') sum += c.from_minor - c.to_minor;
    else if (c.type === 'category_budget' && c.from_minor !== null) sum += c.from_minor - c.to_minor;
  }
  return sum;
}

/** Changes whenever the inputs the advice was based on change, so stale advice is regenerated. */
export function adviceFingerprint(options: PurchaseOption[], planning: Pick<PlanningModel, 'month' | 'remainingMinor' | 'setAsideMinor'>): string {
  return JSON.stringify([
    planning.month, planning.remainingMinor, planning.setAsideMinor,
    options.map((o) => [o.id, o.name, o.price_minor, o.payment, o.installment_minor, o.installment_count]),
  ]);
}

