import { ASSET_TYPES, type PortfolioSummary, type Split } from '@/domain/invest';
import type { AssetType, RiskProfile, YearMonth } from '@/domain/types';
import { huf } from '@/features/home/fmt';
import { CATALOG, TYPE_INFO, defaultProduct, productsFor } from './catalog';

export interface InvestFacts {
  month: YearMonth; amountMinor: number; split: Split; profile: RiskProfile; emergencyDone: boolean;
  summary: PortfolioSummary; costByType: Record<AssetType, number>;
}

const typeProps = {
  type: 'object',
  properties: { text: { type: 'string' }, product_id: { type: 'string' } },
  required: ['text', 'product_id'],
};

export const INVEST_SCHEMA = {
  type: 'object',
  properties: { intro: { type: 'string' }, bond: typeProps, etf: typeProps, stock: typeProps, crypto: typeProps },
  required: ['intro', ...ASSET_TYPES],
};

const MAX_TEXT = 600;
const MAX_INTRO = 800;

export function buildInvestPrompt(f: InvestFacts): string {
  return [
    'Explain, in plain, warm English, how this month\'s investment amount is split across four kinds of investment, and pick one catalog product per kind.',
    'This is educational: never certain, never promise returns, never suggest selling. Use only the numbers and products given below; never invent a number, rate or product.',
    'Only name platforms listed for a product. Crypto cannot be bought on Revolut in Hungary: never tell the user to buy crypto there.',
    'Do not repeat exact forint amounts in your text: the screen shows them, and they can move a little during the month.',
    'Return "intro" (at most 3 sentences) and, for each of bond, etf, stock and crypto, "text" (at most 3 sentences about why this part and what to know) and "product_id" (an id from the catalog below, of the same type).',
    '',
    `Month: ${f.month}`,
    `Risk profile: ${f.profile}`,
    `Emergency fund done: ${f.emergencyDone ? 'yes' : 'no'}`,
    `Amount to invest this month: ${huf(f.amountMinor)}`,
    '',
    'Suggested split, with what the user already holds (value now / cost paid):',
    ...ASSET_TYPES.map((t) =>
      `- ${t}: ${huf(f.split.parts[t])}${f.split.tooSmall.includes(t) ? ' (too small to buy on its own)' : ''}; holds ${huf(f.summary.byType[t])} / ${huf(f.costByType[t])}`),
    `Portfolio total: ${huf(f.summary.valueMinor)} value, ${huf(f.summary.costMinor)} cost`,
    '',
    'Catalog (id (type): name; where; risk):',
    ...CATALOG.map((c) => `- ${c.id} (${c.type}): ${c.name}; where: ${c.where.join(', ')}; risk: ${c.risk}`),
  ].join('\n');
}

function capText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  const t = raw.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (end >= 0) return head.slice(0, end + 1);
  return head;
}

export function normalizeInvestAdvice(raw: unknown):
  { intro: string; per_type: Record<AssetType, { text: string; product_id: string }> } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.intro !== 'string') return null;
  const intro = r.intro.trim().slice(0, MAX_INTRO);
  if (!intro) return null;
  const per_type = {} as Record<AssetType, { text: string; product_id: string }>;
  for (const t of ASSET_TYPES) {
    const e = r[t] && typeof r[t] === 'object' ? (r[t] as Record<string, unknown>) : {};
    const id = typeof e.product_id === 'string' ? e.product_id : '';
    const ok = productsFor(t).some((p) => p.id === id);
    per_type[t] = { text: capText(e.text, MAX_TEXT), product_id: ok ? id : defaultProduct(t).id };
  }
  return { intro, per_type };
}

export function investCacheKey(f: InvestFacts): string {
  return [
    f.month, f.amountMinor, f.profile, f.emergencyDone ? 1 : 0,
    ...ASSET_TYPES.map((t) => f.costByType[t]),
  ].join('|');
}

export function templateText(type: AssetType, f: InvestFacts): string {
  const part = f.split.parts[type];
  const what = TYPE_INFO[type].what;
  return part > 0 ? `${what} This month's suggestion for this part: ${huf(part)}.` : what;
}
