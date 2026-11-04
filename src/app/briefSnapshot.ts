import { saveBriefSnapshot } from '@/data/settings';
import { monthOf } from '@/domain/dates';
import { dailySpendMinor } from '@/domain/planning';
import type { BriefSnapshot } from '@/domain/types';
import { findProduct } from '@/features/invest/catalog';
import type { InvestCore } from '@/features/invest/investModel';
import { loadInvestCore } from '@/features/invest/useInvestData';
import { loadHomeData, type HomeData } from '@/features/home/useHomeData';

/** The numbers the server's morning brief reads, equal to what the Invest tab shows. Pure. */
export function buildBriefSnapshot(core: InvestCore, home: HomeData, nowIso: string): BriefSnapshot {
  const s = core.suggestion;
  return {
    month: monthOf(home.today),
    computed_at: nowIso,
    suggestion: s.kind === 'amount'
      ? { kind: 'amount', amountMinor: s.amountMinor, source: s.source }
      : { kind: s.kind, amountMinor: null, source: null },
    split: core.split?.parts ?? null,
    emergencyDone: core.emergencyDone,
    remainingMinor: home.model.monthly.remainingMinor,
    dailySpendMinor: dailySpendMinor(home.txns, home.today),
    holdings: core.positions.map((p) => {
      const h = p.holding;
      const v = core.valuations.get(h.id);
      return {
        holding_id: h.id, name: h.name, asset_type: h.asset_type,
        quote_symbol: findProduct(h.product_id)?.quote_symbol ?? null, currency: h.currency,
        costMinor: p.costMinor, valueMinor: v && v.priced ? v.valueMinor : null,
      };
    }),
  };
}

let inFlight: Promise<void> | null = null;

/** Computes and stores the brief snapshot (and this month's computed suggestion). Single-flight; never throws. */
export function refreshBriefSnapshot(): Promise<void> {
  inFlight ??= (async () => {
    try {
      const home = await loadHomeData();
      const core = await loadInvestCore(home);
      const snap = buildBriefSnapshot(core, home, new Date().toISOString());
      const log = home.settings.invest_suggested_log ?? {};
      const amount = snap.suggestion.source === 'computed' ? snap.suggestion.amountMinor : null;
      const merged = amount !== null && log[snap.month] !== amount ? { ...log, [snap.month]: amount } : undefined;
      await saveBriefSnapshot(snap, merged);
    } catch (e) {
      console.error('Brief snapshot failed', e);
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
