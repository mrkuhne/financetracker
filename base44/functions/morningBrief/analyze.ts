// The on-demand news analysis flow. Deps are injected so it is unit-testable; no npm:/jsr: imports.
import { budapestDate } from '../../shared/chart.ts';
import { fetchArticle } from '../../shared/article.ts';
import { articleHostsFor } from '../../shared/news.ts';
import { usageTotals, type UsageRow } from '../../shared/rows.ts';
import {
  ANALYSIS_SCHEMA, analysisLimits, ANALYZE_DAILY_CAP, analysisStale, buildAnalysisPrompt, forDisplay, normalizeAnalysis, productNames,
  type Analysis,
} from './analysis.ts';
import { briefNumbers, type BriefSnapshot } from './brief.ts';
import { canAnalyze, parseAnalyzeBody } from './logic.ts';

export type AnalyzeResponse =
  | { status: 'ok'; analysis: Analysis; stale: boolean; left_minor: number | null; money_known: boolean }
  | { status: 'cap' }
  | { status: 'not_found' }
  | { status: 'error' };

type Row = Record<string, unknown>;
type Table = {
  filter(query: Record<string, unknown>, sort?: string, limit?: number): Promise<unknown[] | null | undefined>;
};

export interface AnalyzeDeps {
  body: unknown;
  ownerId: string;
  snapshot: BriefSnapshot | null;
  nowIso: string;
  db: {
    NewsItem: Table & { update(id: string, data: Row): Promise<unknown> };
    NewsSource: Table;
    AiUsage: Table & { create(data: Row): Promise<unknown>; update(id: string, data: Row): Promise<unknown> };
  };
  /** This month's buys total, as the digest path reads it. */
  investedThisMonthMinor: () => Promise<number>;
  invokeLLM: (prompt: string, schema: unknown) => Promise<unknown>;
  fetchImpl: typeof fetch;
}

const isStr = (v: unknown): v is string => typeof v === 'string';

/** A stored analysis is untrusted shape: the strict fields must be right, the optional ones are coerced. */
export function validAnalysis(raw: unknown): Analysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.verdict !== 'buy' && r.verdict !== 'wait' && r.verdict !== 'none') return null;
  if (!isStr(r.about) || !isStr(r.impact) || !isStr(r.reason) || !isStr(r.month)) return null;
  return {
    month: r.month,
    verdict: r.verdict,
    amount_minor: typeof r.amount_minor === 'number' && Number.isFinite(r.amount_minor) ? r.amount_minor : null,
    product: isStr(r.product) ? r.product : null,
    about: r.about,
    impact: r.impact,
    reason: r.reason,
    from_summary: r.from_summary === true,
    made_at: isStr(r.made_at) ? r.made_at : '',
  };
}

const safeErr = (err: unknown) => {
  const e = err as { name?: string; status?: number; response?: { status?: number }; message?: unknown } | null;
  return { name: e?.name, status: e?.status ?? e?.response?.status, message: String(e?.message ?? '').slice(0, 200) };
};

export async function handleAnalyze(d: AnalyzeDeps): Promise<AnalyzeResponse> {
  const body = parseAnalyzeBody(d.body);
  if (!body) return { status: 'not_found' };

  const rows = ((await d.db.NewsItem.filter({ owner_id: d.ownerId, id: body.id }, undefined, 5)) ?? []) as Row[];
  const row = rows.find((r) => r.id === body.id) as (Row & { id: string; owner_id?: string }) | undefined;
  if (!row || !canAnalyze(row, d.ownerId)) return { status: 'not_found' };

  const today = budapestDate(d.nowIso);
  const month = today.slice(0, 7);
  const snapshot = d.snapshot;
  const numbers = briefNumbers({
    snapshot,
    today,
    investedThisMonthMinor: await d.investedThisMonthMinor(),
    moves: {},
    eurHuf: null,
  });
  const limits = analysisLimits(numbers);
  const products = productNames(snapshot?.split ?? null, (snapshot?.holdings ?? []).map((h) => h.name));
  const live = { left_minor: numbers.month.leftMinor, money_known: numbers.holdingsKnown && !numbers.stale };

  const stored = validAnalysis(row.analysis);
  if (stored && !body.refresh) {
    const stale = analysisStale(stored, month, limits);
    return { status: 'ok', analysis: forDisplay(stored, stale), stale, ...live };
  }

  const readUsage = async () =>
    (((await d.db.AiUsage.filter({ owner_id: d.ownerId, date: today }, 'created_date', 50)) ?? []) as (UsageRow & { owner_id?: string })[]).filter(
      (r) => r.owner_id === d.ownerId,
    );
  if (usageTotals(await readUsage()).analyze >= ANALYZE_DAILY_CAP) return { status: 'cap' };

  // The source row gives the allowed article hosts; without it the fetch is refused and the summary is used.
  let hosts: string[] = [];
  if (isStr(row.source_id)) {
    const sources = ((await d.db.NewsSource.filter({ owner_id: d.ownerId, id: row.source_id }, undefined, 5)) ?? []) as Row[];
    const source = sources.find((s) => s.id === row.source_id && s.owner_id === d.ownerId);
    if (source && isStr(source.url)) hosts = articleHostsFor(source.url);
  }
  const article = isStr(row.link) ? await fetchArticle(row.link, hosts, d.fetchImpl) : ({ ok: false, reason: 'host' } as const);

  const prompt = buildAnalysisPrompt({
    title: isStr(row.title) ? row.title : '',
    source: isStr(row.source_name) ? row.source_name : '',
    summary: isStr(row.summary) ? row.summary : null,
    article: article.ok ? article.text : null,
    numbers,
    products,
  });

  if ((await readUsage()).length === 0) await d.db.AiUsage.create({ owner_id: d.ownerId, date: today, collect: 0, brief: 0, analyze: 0 });
  let raw: unknown;
  try {
    raw = await d.invokeLLM(prompt, ANALYSIS_SCHEMA);
  } catch (err) {
    console.error('analyze llm failed', safeErr(err));
    raw = null;
  } finally {
    // A call was made: count it even if it failed. Re-read to narrow the lost-update window.
    try {
      const primary = usageTotals(await readUsage()).primary;
      if (primary) await d.db.AiUsage.update(primary.id, { analyze: (primary.analyze ?? 0) + 1 });
    } catch (err) {
      console.error('usage update failed', safeErr(err));
    }
  }

  const analysis = normalizeAnalysis(raw, { limits, products, month, fromSummary: !article.ok, nowIso: d.nowIso });
  if (!analysis) return { status: 'error' };
  try {
    await d.db.NewsItem.update(row.id, { analysis });
  } catch (err) {
    console.error('analysis store failed', safeErr(err));
  }
  return { status: 'ok', analysis, stale: false, ...live };
}
