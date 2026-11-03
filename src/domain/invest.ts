import type { AssetType, Holding, InvestmentTxn, ISODate, PriceQuote, RiskProfile } from './types';
import { addMonths, compareDates, daysBetweenInclusive, daysInMonth, monthOf } from './dates';

export const ASSET_TYPES: AssetType[] = ['bond', 'etf', 'stock', 'crypto'];

export const INVEST_RULES = {
  shareBeforeEmergency: 0.25, shareAfterEmergency: 0.6,
  profiles: {
    cautious: { bond: 0.5, etf: 0.35, stock: 0.08, crypto: 0.07 },
    balanced: { bond: 0.35, etf: 0.45, stock: 0.12, crypto: 0.08 },
    bold: { bond: 0.15, etf: 0.45, stock: 0.25, crypto: 0.15 },
  },
  minTicketMinor: { bond: 10_000_000, etf: 200_000, stock: 200_000, crypto: 200_000 },
  roundToMinor: 100_000, // suggestions round down to 1 000 Ft
  bigDropRatio: -0.15, // value at least 15% under cost
  checkinAfterMonths: 3,
} as const;

export type Suggestion =
  | { kind: 'no_data' }
  | { kind: 'nothing_spare' }
  | { kind: 'amount'; amountMinor: number; source: 'computed' | 'setting'; emergencyDone: boolean };

export function suggestInvestment(i: {
  trackedMonths: number; avgIncomeMinor: number; avgExpensesMinor: number; savingsTargetMinor: number;
  freeBeforeInvestMinor: number; emergencyDone: boolean; settingMinor: number | null;
}): Suggestion {
  if (i.settingMinor !== null && i.settingMinor > 0) {
    return { kind: 'amount', amountMinor: i.settingMinor, source: 'setting', emergencyDone: i.emergencyDone };
  }
  if (i.trackedMonths <= 0) return { kind: 'no_data' };
  const surplus = i.avgIncomeMinor - i.avgExpensesMinor - i.savingsTargetMinor;
  const available = Math.min(surplus, i.freeBeforeInvestMinor);
  if (available <= 0) return { kind: 'nothing_spare' };
  const share = i.emergencyDone ? INVEST_RULES.shareAfterEmergency : INVEST_RULES.shareBeforeEmergency;
  const step = INVEST_RULES.roundToMinor;
  const amountMinor = Math.floor((available * share) / step) * step;
  if (amountMinor <= 0) return { kind: 'nothing_spare' };
  return { kind: 'amount', amountMinor, source: 'computed', emergencyDone: i.emergencyDone };
}

export interface Split { parts: Record<AssetType, number>; tooSmall: AssetType[] }

export function splitInvestment(
  amountMinor: number, profile: RiskProfile, valueByType: Record<AssetType, number>,
): Split {
  const weights = INVEST_RULES.profiles[profile];
  const mins = INVEST_RULES.minTicketMinor;
  const parts: Record<AssetType, number> = { bond: 0, etf: 0, stock: 0, crypto: 0 };
  const tooSmall: AssetType[] = [];
  if (amountMinor <= 0) return { parts, tooSmall };

  // Proportional split by deficit against the target mix after the new money.
  const total = ASSET_TYPES.reduce((s, t) => s + Math.max(0, valueByType[t]), 0);
  const deficit = {} as Record<AssetType, number>;
  let deficitSum = 0;
  for (const t of ASSET_TYPES) {
    deficit[t] = Math.max(0, (total + amountMinor) * weights[t] - Math.max(0, valueByType[t]));
    deficitSum += deficit[t];
  }
  // Tie-break order: higher profile weight first.
  const byWeight = [...ASSET_TYPES].sort((a, b) => weights[b] - weights[a]);
  const top = byWeight[0];
  if (deficitSum <= 0) {
    parts[top] = amountMinor;
    return { parts, tooSmall };
  }
  let assigned = 0;
  for (const t of ASSET_TYPES) {
    parts[t] = Math.floor((amountMinor * deficit[t]) / deficitSum / 100) * 100;
    assigned += parts[t];
  }
  const biggestOf = (cands: AssetType[]) =>
    [...cands].sort((a, b) => parts[b] - parts[a] || weights[b] - weights[a])[0];
  parts[biggestOf(ASSET_TYPES)] += amountMinor - assigned;

  const note = (t: AssetType) => { if (!tooSmall.includes(t)) tooSmall.push(t); };
  const nonZero = () => ASSET_TYPES.filter((t) => parts[t] > 0);

  // 1. Fold the smallest too-small part into the biggest other part.
  for (;;) {
    const small = nonZero().filter((t) => parts[t] < mins[t]);
    const others = (t: AssetType) => nonZero().filter((o) => o !== t);
    if (small.length === 0 || nonZero().length < 2) break;
    const t = [...small].sort((a, b) => parts[a] - parts[b] || weights[a] - weights[b])[0];
    const into = biggestOf(others(t));
    parts[into] += parts[t];
    parts[t] = 0;
    note(t);
  }

  // 2/3. A single remaining part below its own minimum moves to the best type it satisfies.
  const [only] = nonZero();
  if (only && parts[only] < mins[only]) {
    note(only);
    const dest = byWeight.find((t) => parts[only] >= mins[t]) ?? top;
    parts[dest] = parts[only];
    if (dest !== only) parts[only] = 0;
    if (dest === only) return { parts, tooSmall };
  }
  // A holder that meets its own minimum is not "too small"; one below it still is.
  return { parts, tooSmall: tooSmall.filter((t) => parts[t] < mins[t]) };
}

export interface Lot { date: ISODate; costMinor: number }
export interface Position { holding: Holding; quantity: number | null; costMinor: number; firstBuy: ISODate | null; lots: Lot[] }

export function positionOf(holding: Holding, txns: InvestmentTxn[]): Position {
  const mine = txns
    .filter((t) => t.holding_id === holding.id)
    .sort((a, b) => compareDates(a.date, b.date) || (a.side === b.side ? 0 : a.side === 'buy' ? -1 : 1));
  const buys = mine.filter((t) => t.side === 'buy');
  const quantityKnown = buys.length > 0 && buys.every((t) => t.quantity !== null);
  let quantity = 0;
  const lots: Lot[] = [];
  const total = () => lots.reduce((s, l) => s + l.costMinor, 0);
  const shrink = (keep: number) => { for (const l of lots) l.costMinor *= keep; };
  for (const t of mine) {
    if (t.side === 'buy') {
      quantity += t.quantity ?? 0;
      lots.push({ date: t.date, costMinor: t.amount_huf_minor });
    } else if (quantityKnown && t.quantity !== null && quantity > 0) {
      const sold = Math.min(t.quantity, quantity);
      shrink(1 - sold / quantity);
      quantity -= sold;
    } else if (!quantityKnown && t.quantity === null) {
      // No quantity to go by: a sell closes the whole position (bonds redeem above cost).
      shrink(0);
    } else {
      const cost = total();
      if (cost > 0) shrink(Math.max(0, 1 - t.amount_huf_minor / cost));
      if (quantityKnown && t.quantity !== null) quantity = Math.max(0, quantity - t.quantity);
    }
  }
  return {
    holding,
    quantity: quantityKnown ? quantity : null,
    costMinor: Math.max(0, Math.round(total())),
    firstBuy: buys.length ? buys[0].date : null,
    lots,
  };
}

export interface Valuation { valueMinor: number; costMinor: number; gainMinor: number; gainRatio: number | null; priced: boolean }

function valuation(valueMinor: number, costMinor: number, priced: boolean): Valuation {
  const gainMinor = valueMinor - costMinor;
  return { valueMinor, costMinor, gainMinor, gainRatio: costMinor > 0 ? gainMinor / costMinor : null, priced };
}

export function holdingValue(p: Position, quote: PriceQuote | null, hufPerUnit: number | null, today: ISODate): Valuation {
  const cost = p.costMinor;
  const h = p.holding;
  if (h.asset_type === 'bond') {
    if (h.bond_rate_pct === null || p.firstBuy === null) return valuation(cost, cost, false);
    const rate = h.bond_rate_pct / 100;
    const value = p.lots.reduce((sum, l) => {
      const days = Math.max(0, daysBetweenInclusive(l.date, today) - 1);
      return sum + l.costMinor * (1 + rate * (days / 365));
    }, 0);
    return valuation(Math.round(value), cost, true);
  }
  if (quote && p.quantity !== null && hufPerUnit !== null) {
    return valuation(Math.round(quote.price * p.quantity * hufPerUnit * 100), cost, true);
  }
  return valuation(cost, cost, false);
}

export interface PortfolioSummary {
  valueMinor: number; costMinor: number; gainMinor: number; gainRatio: number | null;
  byType: Record<AssetType, number>; unpriced: number;
}

export function portfolioSummary(vals: { type: AssetType; v: Valuation }[]): PortfolioSummary {
  const byType: Record<AssetType, number> = { bond: 0, etf: 0, stock: 0, crypto: 0 };
  let valueMinor = 0, costMinor = 0, unpriced = 0;
  for (const { type, v } of vals) {
    byType[type] += v.valueMinor;
    valueMinor += v.valueMinor;
    costMinor += v.costMinor;
    if (!v.priced) unpriced += 1;
  }
  const gainMinor = valueMinor - costMinor;
  return { valueMinor, costMinor, gainMinor, gainRatio: costMinor > 0 ? gainMinor / costMinor : null, byType, unpriced };
}

export function isBigDrop(v: Valuation): boolean {
  return v.gainRatio !== null && v.gainRatio <= INVEST_RULES.bigDropRatio + 1e-9;
}

export function checkinDue(i: { profile: RiskProfile; firstBuy: ISODate | null; lastCheckin: ISODate | null; today: ISODate }): boolean {
  if (i.profile === 'bold' || i.firstBuy === null) return false;
  const anchor = i.lastCheckin !== null && compareDates(i.lastCheckin, i.firstBuy) > 0 ? i.lastCheckin : i.firstBuy;
  const m = addMonths(monthOf(anchor), INVEST_RULES.checkinAfterMonths);
  const day = Math.min(Number(anchor.slice(8, 10)), daysInMonth(m));
  const due: ISODate = `${m}-${String(day).padStart(2, '0')}`;
  return compareDates(i.today, due) >= 0;
}

export function monthCard(suggestedMinor: number, investedThisMonthMinor: number) {
  return {
    suggestedMinor,
    investedMinor: investedThisMonthMinor,
    leftMinor: Math.max(0, suggestedMinor - investedThisMonthMinor),
  };
}
