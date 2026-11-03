import {
  ASSET_TYPES, checkinDue, holdingValue, monthCard, portfolioSummary, positionOf, splitInvestment, suggestInvestment,
  type PortfolioSummary, type Position, type Split, type Suggestion, type Valuation,
} from '@/domain/invest';
import type { MonthlyAllowance } from '@/domain/allowance';
import { monthOf } from '@/domain/dates';
import { allocateGoals, emergencyTargetMinor } from '@/domain/savings';
import type { AssetType, Holding, InvestCache, InvestmentTxn, ISODate, Platform, PriceQuote, RiskProfile, SavingsGoal, Settings, YearMonth } from '@/domain/types';
import { huf } from '@/features/home/fmt';
import { findProduct, productsFor } from './catalog';

export const PLATFORM_LABEL: Record<Platform, string> = { mbh: 'MBH', revolut: 'Revolut', other: 'Other' };

export const PROFILE_LABEL: Record<RiskProfile, string> = { cautious: 'Cautious', balanced: 'Balanced', bold: 'Bold' };

/** The profile one step bolder (bold stays bold). */
export function nextProfile(p: RiskProfile): RiskProfile {
  return p === 'cautious' ? 'balanced' : 'bold';
}

/** What this month could take before any investment buy: the month's free money plus what was already invested. */
export function freeBeforeInvestMinor(monthly: Pick<MonthlyAllowance, 'freeMinor' | 'investmentMinor'>): number {
  return monthly.freeMinor + monthly.investmentMinor;
}

/** HUF put in by buys dated in `month`. */
export function investedThisMonthMinor(txns: InvestmentTxn[], month: YearMonth): number {
  return txns.filter((t) => t.side === 'buy' && monthOf(t.date) === month).reduce((s, t) => s + t.amount_huf_minor, 0);
}

/** Guide step 2: an emergency goal exists, has a target above 0, and is fully saved. */
export function isEmergencyDone(
  goals: SavingsGoal[], balancesByAccount: Record<string, number>, emergencyMonths: number, avgExpensesMinor: number,
): boolean {
  const progress = allocateGoals(goals, balancesByAccount, emergencyTargetMinor(emergencyMonths, avgExpensesMinor));
  const e = progress.find((g) => g.goal.kind === 'emergency');
  return !!e && e.targetMinor > 0 && e.savedMinor >= e.targetMinor;
}

/** A position still held: units left, or (without units) cost left. */
export const isOpen = (p: Position): boolean => (p.quantity !== null ? p.quantity > 0 : p.costMinor > 0);

/** Catalog quote symbols of the held products, deduplicated. */
export function quoteSymbolsFor(holdings: Holding[]): string[] {
  const out = new Set<string>();
  for (const h of holdings) {
    const s = findProduct(h.product_id)?.quote_symbol;
    if (s) out.add(s);
  }
  return [...out];
}

/** Sum of the cost still held, per asset type. */
export function costByType(positions: Position[]): Record<AssetType, number> {
  const out: Record<AssetType, number> = { bond: 0, etf: 0, stock: 0, crypto: 0 };
  for (const p of positions) out[p.holding.asset_type] += p.costMinor;
  return out;
}

/** Share of each type in `byType` (0..1); all zero when nothing is held. */
export function sharesOf(byType: Record<AssetType, number>): Record<AssetType, number> {
  const total = ASSET_TYPES.reduce((s, t) => s + Math.max(0, byType[t]), 0);
  const out: Record<AssetType, number> = { bond: 0, etf: 0, stock: 0, crypto: 0 };
  if (total > 0) for (const t of ASSET_TYPES) out[t] = Math.max(0, byType[t]) / total;
  return out;
}

export interface InvestCore {
  holdings: Holding[]; txns: InvestmentTxn[]; positions: Position[];
  valuations: Map<string, Valuation>; summary: PortfolioSummary; suggestion: Suggestion; split: Split | null;
  card: ReturnType<typeof monthCard> | null; emergencyDone: boolean; checkinDue: boolean;
}

/**
 * Everything the Invest screens show, from loaded rows. `quotes` are keyed by catalog symbol;
 * `hufPerUnit` maps a quote currency to its HUF rate, or null when the lookup failed (unpriced).
 * `positions` holds only open positions, keyed in `valuations` by holding id.
 */
export function buildInvestCore(i: {
  today: ISODate; settings: Settings; monthly: MonthlyAllowance;
  planning: { trackedMonths: number; avgIncomeMinor: number; avgExpensesMinor: number };
  emergencyDone: boolean; holdings: Holding[]; txns: InvestmentTxn[];
  quotes: PriceQuote[]; hufPerUnit: Record<string, number | null>;
}): InvestCore {
  const quoteBy = new Map(i.quotes.map((q) => [q.ticker, q]));
  const positions = i.holdings.map((h) => positionOf(h, i.txns)).filter(isOpen);
  const valuations = new Map<string, Valuation>();
  for (const p of positions) {
    const symbol = findProduct(p.holding.product_id)?.quote_symbol ?? null;
    const quote = symbol ? quoteBy.get(symbol) ?? null : null;
    const rate = quote ? (quote.currency === 'HUF' ? 1 : i.hufPerUnit[quote.currency] ?? null) : null;
    valuations.set(p.holding.id, holdingValue(p, quote, rate, i.today));
  }
  const summary = portfolioSummary(positions.map((p) => ({ type: p.holding.asset_type, v: valuations.get(p.holding.id)! })));

  const month = monthOf(i.today);
  const suggestion = suggestInvestment({
    trackedMonths: i.planning.trackedMonths,
    avgIncomeMinor: i.planning.avgIncomeMinor,
    avgExpensesMinor: i.planning.avgExpensesMinor,
    savingsTargetMinor: i.monthly.savingsTargetMinor,
    freeBeforeInvestMinor: freeBeforeInvestMinor(i.monthly),
    emergencyDone: i.emergencyDone,
    settingMinor: i.settings.monthly_investment_amount_minor,
  });
  const amount = suggestion.kind === 'amount' ? suggestion.amountMinor : null;
  const split = amount !== null ? splitInvestment(amount, i.settings.risk_profile, summary.byType) : null;
  const card = amount !== null ? monthCard(amount, investedThisMonthMinor(i.txns, month)) : null;

  const firstBuys = positions.map((p) => p.firstBuy).filter((d): d is ISODate => d !== null).sort();
  return {
    holdings: i.holdings, txns: i.txns, positions, valuations, summary, suggestion, split, card,
    emergencyDone: i.emergencyDone,
    checkinDue: checkinDue({
      profile: i.settings.risk_profile, firstBuy: firstBuys[0] ?? null, lastCheckin: i.settings.risk_checkin_at, today: i.today,
    }),
  };
}

/** AI explanation as cached; a stored entry may lack some types. */
export type InvestAdvice = Pick<InvestCache, 'intro'> & { per_type: Partial<Record<AssetType, { text: string; product_id: string }>> };

/** One type's entry, usable only when its product belongs to that type; null means "use the template". */
export function adviceFor(advice: InvestAdvice | null, type: AssetType): { text: string; product_id: string } | null {
  const e = advice?.per_type?.[type];
  if (!e || typeof e.product_id !== 'string' || !productsFor(type).some((p) => p.id === e.product_id)) return null;
  return { text: typeof e.text === 'string' ? e.text : '', product_id: e.product_id };
}

export const DISCLAIMER = 'Educational, not personal financial advice. You decide.';

export const TYPE_COLOR: Record<AssetType, string> = {
  bond: 'var(--c-transport)', etf: 'var(--c-groceries)', stock: 'var(--c-dining)', crypto: 'var(--c-subs)',
};

/** "+4.6%" / "−1.2%" / "0.0%". */
export function pctSigned(ratio: number): string {
  const v = Math.abs(ratio * 100).toFixed(1);
  return v === '0.0' ? '0.0%' : `${ratio > 0 ? '+' : '−'}${v}%`;
}

/** Where a holding sits: its platform, or the name typed for "Other". */
export function platformOf(h: Pick<Holding, 'platform' | 'platform_name'>): string {
  return h.platform === 'other' && h.platform_name ? h.platform_name : PLATFORM_LABEL[h.platform];
}

/** Intro shown while the AI explanation loads or when it is unavailable. */
export function introTemplate(amountMinor: number, profile: RiskProfile): string {
  return `One way to split ${huf(amountMinor)} this month for a ${PROFILE_LABEL[profile].toLowerCase()} mix. Tap a type to see what it is and where to buy it.`;
}
