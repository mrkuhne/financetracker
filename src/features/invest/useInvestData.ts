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
import { buildInvestCore, costByType, isEmergencyDone, quoteSymbolsFor, type InvestAdvice, type InvestCore } from './investModel';

export interface InvestModel extends InvestCore { home: HomeData }

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
        const [goals, holdings, txns] = await Promise.all([listGoals(), listHoldings(), listInvestmentTxns()]);
        // A quote failure leaves holdings unpriced rather than failing the screen.
        const quotes = await refreshQuotes(quoteSymbolsFor(holdings), home.today).catch(() => []);
        const hufPerUnit: Record<string, number | null> = {};
        for (const c of new Set(quotes.map((q) => q.currency))) {
          try { hufPerUnit[c] = await getHufPerUnit(c, home.today); } catch { hufPerUnit[c] = null; }
        }
        if (id !== reqId.current) return;
        const planning = buildPlanningModel({ today: home.today, rules: home.rules, txns: home.txns, settings: home.settings, closes: home.closes });
        const balances: Record<string, number> = {};
        for (const a of home.model.accounts) balances[a.account.id] = a.balanceHufMinor;
        const emergencyDone = isEmergencyDone(goals, balances, home.settings.emergency_fund_months, planning.avgExpensesMinor);
        setData({
          home,
          ...buildInvestCore({
            today: home.today, settings: home.settings, monthly: home.model.monthly, planning, emergencyDone,
            holdings, txns, quotes, hufPerUnit,
          }),
        });
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
    emergencyDone: m.emergencyDone, summary: m.summary, costByType: costByType(m.positions),
  };
}

/**
 * The AI explanation for `facts`. A matching cache is used as is; otherwise, when `generate` is set,
 * one call is made per facts key per mount (the ref also stops StrictMode's double mount from calling
 * twice), normalized and cached. A failure leaves `advice` null; `refresh()` is the only retry.
 */
export function useInvestAdvice(facts: InvestFacts | null, generate: boolean) {
  const key = facts ? investCacheKey(facts) : null;
  const [advice, setAdvice] = useState<InvestAdvice | null>(null);
  const [loading, setLoading] = useState(key !== null);
  const [failed, setFailed] = useState(false);
  const attempted = useRef<string | null>(null);
  const latest = useRef({ facts, key });
  latest.current = { facts, key };

  const call = useCallback(async () => {
    const { facts: f, key: k } = latest.current;
    if (!f || !k) return;
    setLoading(true);
    setFailed(false);
    try {
      const result = normalizeInvestAdvice(await invokeLlm(buildInvestPrompt(f), INVEST_SCHEMA));
      if (latest.current.key !== k) return;
      if (!result) { setFailed(true); return; }
      setAdvice(result);
      await saveInvestCache({ key: k, ...result, generated_at: new Date().toISOString() }).catch(() => undefined);
    } catch {
      if (latest.current.key === k) setFailed(true);
    } finally {
      if (latest.current.key === k) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (key === null) { setAdvice(null); setLoading(false); return; }
    if (attempted.current === key) return;
    attempted.current = key;
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
      if (generate) await call();
      else setLoading(false);
    })();
  }, [key, generate, call]);

  return { advice, loading, failed, refresh: call };
}
