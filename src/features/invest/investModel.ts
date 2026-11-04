import {
  ASSET_TYPES, checkinDue, holdingValue, monthCard, portfolioSummary, positionOf, splitInvestment, suggestInvestment,
  type PortfolioSummary, type Position, type Split, type Suggestion, type Valuation,
} from '@/domain/invest';
import type { MonthlyAllowance } from '@/domain/allowance';
import { addMonths, compareDates, firstDay, monthOf } from '@/domain/dates';
import { allocateGoals, emergencyTargetMinor } from '@/domain/savings';
import type { AssetType, Holding, InvestCache, InvestmentTxn, ISODate, Platform, PriceQuote, RiskProfile, SavingsGoal, Settings, Txn, YearMonth } from '@/domain/types';
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
  valuations: Map<string, Valuation>; summary: PortfolioSummary;
  /** Loaded quotes by catalog symbol. */
  quotes: Map<string, PriceQuote>; suggestion: Suggestion; split: Split | null;
  /** Open market-priced positions without a quantity (counted in `summary.unpriced` too). */
  noQuantity: number;
  card: ReturnType<typeof monthCard> | null; emergencyDone: boolean; checkinDue: boolean;
  /** The portfolio as it stood before this month (txns dated before the 1st, at today's prices): the split's basis. */
  basis: { summary: PortfolioSummary; costByType: Record<AssetType, number> };
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
  const value = (p: Position): Valuation => {
    const symbol = findProduct(p.holding.product_id)?.quote_symbol ?? null;
    const quote = symbol ? quoteBy.get(symbol) ?? null : null;
    const rate = quote ? (quote.currency === 'HUF' ? 1 : i.hufPerUnit[quote.currency] ?? null) : null;
    return holdingValue(p, quote, rate, i.today);
  };
  const positions = i.holdings.map((h) => positionOf(h, i.txns)).filter(isOpen);
  const valuations = new Map<string, Valuation>();
  for (const p of positions) valuations.set(p.holding.id, value(p));
  const summary = portfolioSummary(positions.map((p) => ({ type: p.holding.asset_type, v: valuations.get(p.holding.id)! })));

  const month = monthOf(i.today);
  // This month's split is planned from the holdings before the month, so a buy recorded now does not reshuffle it.
  const start = firstDay(month);
  const before = i.txns.filter((t) => compareDates(t.date, start) < 0);
  const prePositions = i.holdings.map((h) => positionOf(h, before)).filter(isOpen);
  const basis = {
    summary: portfolioSummary(prePositions.map((p) => ({ type: p.holding.asset_type, v: value(p) }))),
    costByType: costByType(prePositions),
  };
  const prevMonth = addMonths(month, -1);
  const prevSuggested = i.settings.invest_suggested_log?.[prevMonth];
  const prevExcessMinor = typeof prevSuggested === 'number'
    ? Math.max(0, investedThisMonthMinor(i.txns, prevMonth) - prevSuggested) : 0;
  const suggestion = suggestInvestment({
    trackedMonths: i.planning.trackedMonths,
    avgIncomeMinor: i.planning.avgIncomeMinor,
    avgExpensesMinor: i.planning.avgExpensesMinor,
    savingsTargetMinor: i.monthly.savingsTargetMinor,
    freeBeforeInvestMinor: freeBeforeInvestMinor(i.monthly),
    emergencyDone: i.emergencyDone,
    settingMinor: i.settings.monthly_investment_amount_minor,
    prevExcessMinor,
  });
  const amount = suggestion.kind === 'amount' ? suggestion.amountMinor : null;
  const split = amount !== null ? splitInvestment(amount, i.settings.risk_profile, basis.summary.byType) : null;
  const card = amount !== null ? monthCard(amount, investedThisMonthMinor(i.txns, month)) : null;

  const firstBuys = positions.map((p) => p.firstBuy).filter((d): d is ISODate => d !== null).sort();
  return {
    holdings: i.holdings, txns: i.txns, positions, valuations, summary, quotes: quoteBy, suggestion, split, card, basis,
    noQuantity: positions.filter((p) => needsQuantity(p.holding, p.quantity)).length,
    emergencyDone: i.emergencyDone,
    checkinDue: checkinDue({
      profile: i.settings.risk_profile, firstBuy: firstBuys[0] ?? null, lastCheckin: i.settings.risk_checkin_at, today: i.today,
    }),
  };
}

export interface HoldingDetail {
  holding: Holding; position: Position;
  /** Null once the holding is fully sold. */
  valuation: Valuation | null;
  quote: PriceQuote | null;
  /** This holding's buys and sells, newest first. */
  history: InvestmentTxn[];
}

/** One holding for its page, sold-out ones included; null when unknown or it has no txns left. */
export function holdingDetail(core: Pick<InvestCore, 'holdings' | 'txns' | 'valuations' | 'quotes'>, id: string): HoldingDetail | null {
  const holding = core.holdings.find((h) => h.id === id);
  if (!holding) return null;
  const history = core.txns
    .filter((t) => t.holding_id === id)
    // Newest first; on one day a sell comes after its buys (as in positionOf), so it is listed first.
    .sort((a, b) => compareDates(b.date, a.date) || (a.side === b.side ? 0 : a.side === 'sell' ? -1 : 1));
  if (history.length === 0) return null;
  const position = positionOf(holding, core.txns);
  const symbol = findProduct(holding.product_id)?.quote_symbol ?? null;
  return {
    holding, position, history,
    valuation: isOpen(position) ? core.valuations.get(id) ?? null : null,
    quote: symbol ? core.quotes.get(symbol) ?? null : null,
  };
}

export const ADD_QUANTITY = 'Add the quantity to track its price';

/** A market-priced holding (ETF, stock, crypto) without a quantity: it can never be priced (older buys). */
export function needsQuantity(h: Holding, quantity: number | null): boolean {
  return h.asset_type !== 'bond' && !!findProduct(h.product_id)?.quote_symbol && quantity === null;
}

/** The portfolio card's notes on holdings shown at what was paid: stale prices and missing quantities. */
export function portfolioPriceNotes(summary: Pick<PortfolioSummary, 'unpriced'>, noQuantity: number): string[] {
  // A holding without a quantity is always unpriced; it is not a stale price.
  const stale = summary.unpriced - noQuantity;
  const n = (k: number) => `${k} holding${k > 1 ? 's' : ''}`;
  const out: string[] = [];
  if (stale > 0) out.push(`Price not updated for ${n(stale)}: shown at what you paid.`);
  if (noQuantity > 0) out.push(`${ADD_QUANTITY} (${n(noQuantity)}): shown at what you paid.`);
  return out;
}

/** Where the value comes from; null without a valuation (sold out). `quantity` is the position's. */
export function priceLine(h: Holding, v: Valuation | null, quote: PriceQuote | null, quantity: number | null): string | null {
  if (!v) return null;
  if (!v.priced) return needsQuantity(h, quantity) ? ADD_QUANTITY : 'Price not updated';
  if (h.asset_type === 'bond') {
    // holdingValue leaves a bond without a rate unpriced (above); this guards a priced one anyway.
    return h.bond_rate_pct !== null ? `Estimated from the ${h.bond_rate_pct}% yearly rate` : 'Estimated value';
  }
  return quote ? `Price from ${quote.as_of}` : 'Price not updated';
}

/** In-page confirmation for deleting a buy/sell; an SMS-linked money movement goes back to Review instead. */
export function deleteConfirmCopy(t: InvestmentTxn, moneyTxns: Txn[]): string {
  const linked = moneyTxns.find((x) => x.id === t.transaction_id);
  // Same rule as deleteInvestmentTxn: a movement carrying a bank message is reverted, not deleted.
  const tail = linked?.sms_message_id ? 'The bank message goes back to Review.' : 'Its money movement is removed too.';
  return `Delete this ${t.side}? ${tail}`;
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

/**
 * Runs `run` once per `key` for the whole session: later callers (a remounted screen) get the same
 * promise instead of a second call. `force` (the Refresh button) replaces the entry with a new run.
 */
export function sharedCall<T>(calls: Map<string, Promise<T>>, key: string, run: () => Promise<T>, force = false): Promise<T> {
  const existing = calls.get(key);
  if (existing && !force) return existing;
  const p = run();
  calls.set(key, p);
  return p;
}
