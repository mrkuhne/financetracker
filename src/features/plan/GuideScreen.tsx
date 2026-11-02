import { useEffect, useRef, useState } from 'react';
import { invokeLlm } from '@/data/ai';
import { getGuideCache, saveGuideCache, updateSettings } from '@/data/settings';
import { savingsTargetFor } from '@/domain/allowance';
import { guideSteps } from '@/domain/guide';
import { monthsCovered, monthsToReach } from '@/domain/savings';
import { Icon } from '@/features/shell/Icons';
import { Screen } from '@/features/shell/Screen';
import { GUIDE_SCHEMA, buildGuidePrompt, fallbackFact, guideCacheKey, normalizeGuide, type GuideFacts } from './guideAi';
import { usePlanData, type PlanData } from './usePlanData';

export function GuideScreen() {
  const { data, failed, reload } = usePlanData();
  if (!data) {
    return (
      <Screen title="Smart money guide" back="/plan">
        {failed
          ? <div className="card sub">Could not load your numbers. <button className="link" onClick={() => void reload()}>Retry</button></div>
          : <div className="spinner" role="status" aria-label="Loading" style={{ justifySelf: 'center' }} />}
      </Screen>
    );
  }
  return <GuideBody data={data} reload={reload} />;
}

function buildFacts(data: PlanData): GuideFacts {
  const { planning, emergency } = data;
  const settings = data.home.settings;
  const savingsTargetMinor = savingsTargetFor(settings, planning.month);
  const steps = guideSteps({
    trackedMonths: planning.trackedMonths,
    emergency: emergency ? { savedMinor: emergency.savedMinor, targetMinor: emergency.targetMinor } : null,
    emergencyMonths: settings.emergency_fund_months,
    hasExpensiveDebt: settings.has_expensive_debt,
    monthlyInvestmentMinor: settings.monthly_investment_amount_minor,
  });
  return {
    avgIncomeMinor: planning.avgIncomeMinor, avgExpensesMinor: planning.avgExpensesMinor, trackedMonths: planning.trackedMonths,
    savingsTargetMinor, investmentMinor: settings.monthly_investment_amount_minor,
    emergencySavedMinor: emergency?.savedMinor ?? null, emergencyTargetMinor: emergency?.targetMinor ?? null,
    emergencyMonthsCovered: emergency ? monthsCovered(emergency.savedMinor, planning.avgExpensesMinor) : null,
    emergencyGoalMonths: settings.emergency_fund_months,
    monthsToEmergency: emergency ? monthsToReach(emergency.targetMinor - emergency.savedMinor, savingsTargetMinor) : null,
    hasExpensiveDebt: settings.has_expensive_debt, steps,
  };
}

function GuideBody({ data, reload }: { data: PlanData; reload: () => Promise<unknown> | void }) {
  const facts = buildFacts(data);
  const debtAnswer = data.home.settings.has_expensive_debt;
  const [notes, setNotes] = useState<{ intro: string; tips: Record<number, string> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failedCall, setFailedCall] = useState(false);
  const [saving, setSaving] = useState<boolean | null>(null);
  const started = useRef(false);
  const latest = useRef(facts);
  latest.current = facts;

  async function generate() {
    setLoading(true);
    setFailedCall(false);
    try {
      const f = latest.current;
      const result = normalizeGuide(await invokeLlm(buildGuidePrompt(f), GUIDE_SCHEMA));
      if (!result) { setFailedCall(true); return; }
      setNotes(result);
      await saveGuideCache({ key: guideCacheKey(f), ...result, generated_at: new Date().toISOString() }).catch(() => undefined);
    } catch {
      setFailedCall(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // One call per visit; the ref also stops React StrictMode's double mount from calling twice.
    if (started.current) return;
    started.current = true;
    void (async () => {
      const cache = await getGuideCache().catch(() => null);
      if (cache && cache.key === guideCacheKey(latest.current)) {
        setNotes({ intro: cache.intro, tips: cache.tips });
        setLoading(false);
        return;
      }
      await generate();
    })();
  }, []);

  useEffect(() => {
    if (saving === null) return;
    if (debtAnswer === saving) { setSaving(null); return; }
    // If the reload never shows the change, stop blocking the chips.
    const t = setTimeout(() => setSaving(null), 8000);
    return () => clearTimeout(t);
  }, [saving, debtAnswer]);

  async function answerDebt(value: boolean) {
    setSaving(value);
    try {
      await updateSettings({ has_expensive_debt: value });
      await reload();
    } catch {
      setSaving(null);
    }
  }

  return (
    <Screen title="Smart money guide" back="/plan">
      <div className="aibox">
        <span className="who"><Icon name="spark" />Based on your numbers</span>
        {loading
          ? <div className="spinner" role="status" aria-label="Loading" />
          : notes
            ? <p>{notes.intro}</p>
            : <p className="sub" style={{ margin: 0 }}>Personal notes are unavailable right now.{' '}
                <button className="link" onClick={() => void generate()}>Try again</button></p>}
      </div>
      <div className="ladder">
        {facts.steps.map((s) => (
          <div key={s.n} className={`rung ${s.status === 'todo' ? '' : s.status}`}>
            <span className="n">{s.status === 'done' ? <Icon name="check" /> : s.n}</span>
            <div>
              <strong>{s.title}</strong>
              <p>{notes?.tips[s.n] ?? fallbackFact(s, facts)}</p>
              {s.key === 'debt' && debtAnswer === null && (
                <div className="chips" style={{ marginTop: 8 }}>
                  <button className="chip" disabled={saving !== null} onClick={() => void answerDebt(true)}>I have some</button>
                  <button className="chip" disabled={saving !== null} onClick={() => void answerDebt(false)}>No debt</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <button className="btn ghost" disabled={loading} onClick={() => void generate()}>Refresh</button>
      <p className="note"><Icon name="info" />General education, not personal financial advice. You decide what to do.</p>
    </Screen>
  );
}
