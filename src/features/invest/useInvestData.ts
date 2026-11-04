import { useCallback, useEffect, useRef, useState } from 'react';
import { invokeLlm } from '@/data/ai';
import { getHufPerUnit } from '@/data/fx';
import { listHoldings, listInvestmentTxns } from '@/data/investments';
import { refreshQuotes } from '@/data/quotes';
import { listGoals } from '@/data/savingsGoals';
import { getInvestCache, saveInvestCache } from '@/data/settings';
import { buildPlanningModel } from '@/domain/planning';
import { useHomeData, type HomeData } from '@/features/home/useHomeData';
import { INVEST_SCHEMA, buildInvestPrompt, investCacheKey, normalizeInvestAdvice, type InvestFacts } from './investAi';
import { buildInvestCore, isEmergencyDone, quoteSymbolsFor, sharedCall, type InvestAdvice, type InvestCore } from './investModel';

export interface InvestModel extends InvestCore { home: HomeData }

/** Holdings, investment txns, quotes and the month's suggestion for loaded Home data. Throws when a load fails. */
export async function loadInvestCore(home: HomeData): Promise<InvestCore> {
  const [goals, holdings, txns] = await Promise.all([listGoals(), listHoldings(), listInvestmentTxns()]);
  // A quote failure leaves holdings unpriced rather than failing the screen.
  const quotes = await refreshQuotes(quoteSymbolsFor(holdings), home.today).catch(() => []);
  const hufPerUnit: Record<string, number | null> = {};
  for (const c of new Set(quotes.map((q) => q.currency).filter((c) => c !== 'HUF'))) {
    try { hufPerUnit[c] = await getHufPerUnit(c, home.today); } catch { hufPerUnit[c] = null; }
  }
  const planning = buildPlanningModel({ today: home.today, rules: home.rules, txns: home.txns, settings: home.settings, closes: home.closes });
  const balances: Record<string, number> = {};
  for (const a of home.model.accounts) balances[a.account.id] = a.balanceHufMinor;
  const emergencyDone = isEmergencyDone(goals, balances, home.settings.emergency_fund_months, planning.avgExpensesMinor);
  return buildInvestCore({
    today: home.today, settings: home.settings, monthly: home.model.monthly, planning, emergencyDone,
    holdings, txns, quotes, hufPerUnit,
  });
}

/** Home data plus holdings, investment txns, quotes and the month's suggestion; reloads whenever Home data reloads. */
export function useInvestData() {
  const { data: home, failed: homeFailed, reload: reloadHome } = useHomeData();
  const [data, setData] = useState<InvestModel | null>(null);
  const [failed, setFailed] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (!home) return;
    const id = ++reqId.current;
    void (async () => {
      try {
        const core = await loadInvestCore(home);
        if (id !== reqId.current) return;
        setData({ home, ...core });
        setFailed(false);
      } catch {
        if (id === reqId.current) setFailed(true);
      }
    })();
  }, [home]);

  const reload = useCallback(() => reloadHome(), [reloadHome]);
  return { data, failed: failed || (homeFailed && !data), reload };
}

/** Facts for the AI explanation; null without a suggestion amount. */
export function investFacts(m: InvestModel): InvestFacts | null {
  if (m.suggestion.kind !== 'amount' || !m.split) return null;
  return {
    month: m.home.model.month, amountMinor: m.suggestion.amountMinor, split: m.split, profile: m.home.settings.risk_profile,
    emergencyDone: m.emergencyDone, summary: m.basis.summary, costByType: m.basis.costByType,
  };
}

/** AI calls of this session by cache key, so a remounted screen joins a running call instead of making another. */
const adviceCalls = new Map<string, Promise<InvestAdvice | null>>();

/** One AI call for `f`: normalized, cached, null on any failure. */
async function fetchAdvice(f: InvestFacts, key: string): Promise<InvestAdvice | null> {
  try {
    const result = normalizeInvestAdvice(await invokeLlm(buildInvestPrompt(f), INVEST_SCHEMA));
    if (!result) return null;
    await saveInvestCache({ key, ...result, generated_at: new Date().toISOString() }).catch(() => undefined);
    return result;
  } catch {
    return null;
  }
}

/**
 * The AI explanation for `facts`. A matching cache is used as is. Otherwise, when `generate` is set,
 * one call is made per facts key for the whole session (`sharedCall`): StrictMode's double mount, a
 * re-render or a remount join the same call. A screen without `generate` still joins a running call.
 * A failure leaves `advice` null; `refresh()` is the only retry.
 */
export function useInvestAdvice(facts: InvestFacts | null, generate: boolean) {
  const key = facts ? investCacheKey(facts) : null;
  const [advice, setAdvice] = useState<InvestAdvice | null>(null);
  const [loading, setLoading] = useState(key !== null);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ facts, key });
  latest.current = { facts, key };

  const show = useCallback(async (k: string, pending: Promise<InvestAdvice | null>) => {
    setLoading(true);
    setFailed(false);
    const result = await pending;
    if (latest.current.key !== k) return;
    setAdvice(result);
    setFailed(result === null);
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const { facts: f, key: k } = latest.current;
    if (!f || !k) return;
    await show(k, sharedCall(adviceCalls, k, () => fetchAdvice(f, k), true));
  }, [show]);

  useEffect(() => {
    if (key === null || !facts) { setAdvice(null); setLoading(false); return; }
    setAdvice(null);
    setFailed(false);
    setLoading(true);
    void (async () => {
      const cache = await getInvestCache().catch(() => null);
      if (latest.current.key !== key) return;
      if (cache && cache.key === key) {
        setAdvice({ intro: cache.intro, per_type: cache.per_type ?? {} });
        setLoading(false);
        return;
      }
      if (generate || adviceCalls.has(key)) await show(key, sharedCall(adviceCalls, key, () => fetchAdvice(facts, key)));
      else setLoading(false);
    })();
    // `facts` changes on every reload; the key is what matters.
  }, [key, generate, show]);

  return { advice, loading, failed, refresh };
}
