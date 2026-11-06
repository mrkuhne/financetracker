import { handleAnalyze, validAnalysis, type AnalyzeDeps } from './analyze.ts';
import { ANALYZE_DAILY_CAP } from './analysis.ts';
import type { BriefSnapshot } from './brief.ts';

const NOW = '2026-11-06T10:00:00Z';
const snapshot: BriefSnapshot = {
  month: '2026-11',
  computed_at: '2026-11-03T08:00:00Z',
  suggestion: { kind: 'amount', amountMinor: 4_000_000, source: 'computed' },
  split: { bond: 0, etf: 3_000_000, stock: 1_000_000, crypto: 0 },
  emergencyDone: true,
  remainingMinor: 20_000_000,
  dailySpendMinor: 300_000,
  holdings: [{ holding_id: 'h1', name: 'Global ETF', asset_type: 'etf', quote_symbol: 'VWCE.DE', currency: 'EUR', costMinor: 5_000_000, valueMinor: 6_000_000 }],
};
const stored = { month: '2026-11', verdict: 'wait', amount_minor: null, product: null, about: 'a', impact: 'i', reason: 'r', from_summary: true, made_at: NOW };
const llmOk = { about: 'Cikk.', impact: 'Hatás.', reason: 'Várj.', verdict: 'wait', amount_huf: null, product: null };

function setup(opts: { row?: Record<string, unknown> | null; usage?: Record<string, unknown>[]; body?: unknown } = {}) {
  const calls = { llm: 0, usageCreate: 0, usageUpdate: [] as unknown[], newsUpdate: [] as unknown[], fetch: 0 };
  const row = opts.row === undefined ? { id: 'n1', owner_id: 'u1', source_id: 's1', title: 'T', summary: 'S', link: 'https://a.test/x' } : opts.row;
  let usage = opts.usage ?? [];
  const deps: AnalyzeDeps = {
    body: opts.body ?? { action: 'analyze', id: 'n1' },
    ownerId: 'u1',
    snapshot,
    nowIso: NOW,
    db: {
      NewsItem: { filter: async () => (row ? [row] : []), update: async (id, data) => void calls.newsUpdate.push({ id, data }) },
      NewsSource: { filter: async () => [{ id: 's1', owner_id: 'u1', url: 'https://feeds.a.test/rss' }] },
      AiUsage: {
        filter: async () => usage,
        create: async (d) => {
          calls.usageCreate++;
          usage = [{ id: 'g1', owner_id: 'u1', created_date: NOW, ...d }];
        },
        update: async (id, d) => void calls.usageUpdate.push({ id, d }),
      },
    },
    investedThisMonthMinor: async () => 0,
    invokeLLM: async () => {
      calls.llm++;
      return llmOk;
    },
    fetchImpl: (async () => {
      calls.fetch++;
      return new Response('x', { status: 404 });
    }) as typeof fetch,
  };
  return { deps, calls };
}

describe('handleAnalyze', () => {
  test("another owner's row: not_found, no LLM, no usage write", async () => {
    const { deps, calls } = setup({ row: { id: 'n1', owner_id: 'u2', source_id: 's1', title: 'T', link: 'https://a.test/x' } });
    expect(await handleAnalyze(deps)).toEqual({ status: 'not_found' });
    expect(calls.llm + calls.usageCreate + calls.usageUpdate.length + calls.newsUpdate.length).toBe(0);
  });

  test('missing row and bad body', async () => {
    expect(await handleAnalyze(setup({ row: null }).deps)).toEqual({ status: 'not_found' });
    expect(await handleAnalyze(setup({ body: { action: 'analyze' } }).deps)).toEqual({ status: 'not_found' });
  });

  test('cached analysis returned without an LLM call', async () => {
    const { deps, calls } = setup({ row: { id: 'n1', owner_id: 'u1', source_id: 's1', title: 'T', link: 'l', analysis: stored } });
    const r = await handleAnalyze(deps);
    expect(r).toMatchObject({ status: 'ok', stale: false, money_known: true, left_minor: 4_000_000 });
    expect(calls.llm).toBe(0);
    expect(calls.usageCreate + calls.usageUpdate.length).toBe(0);
  });

  test('stored analysis from another month is shown stale', async () => {
    const { deps } = setup({ row: { id: 'n1', owner_id: 'u1', source_id: 's1', title: 'T', link: 'l', analysis: { ...stored, month: '2026-10' } } });
    expect(await handleAnalyze(deps)).toMatchObject({ status: 'ok', stale: true });
  });

  test('cap reached: cap, no LLM call', async () => {
    const { deps, calls } = setup({ usage: [{ id: 'g1', owner_id: 'u1', created_date: NOW, analyze: ANALYZE_DAILY_CAP }] });
    expect(await handleAnalyze(deps)).toEqual({ status: 'cap' });
    expect(calls.llm).toBe(0);
  });

  test('builds, counts the usage and stores the analysis', async () => {
    const { deps, calls } = setup();
    const r = await handleAnalyze(deps);
    expect(r).toMatchObject({ status: 'ok', stale: false, analysis: { verdict: 'wait', from_summary: true, month: '2026-11' } });
    expect(calls.llm).toBe(1);
    expect(calls.usageCreate).toBe(1);
    expect(calls.usageUpdate).toEqual([{ id: 'g1', d: { analyze: 1 } }]);
    expect(calls.newsUpdate).toHaveLength(1);
  });

  test('invalid stored analysis is treated as absent; refresh bypasses the cache', async () => {
    const bad = setup({ row: { id: 'n1', owner_id: 'u1', source_id: 's1', title: 'T', link: 'l', analysis: { ...stored, verdict: 'sell' } } });
    await handleAnalyze(bad.deps);
    expect(bad.calls.llm).toBe(1);
    const fresh = setup({ body: { action: 'analyze', id: 'n1', refresh: true }, row: { id: 'n1', owner_id: 'u1', source_id: 's1', title: 'T', link: 'l', analysis: stored } });
    await handleAnalyze(fresh.deps);
    expect(fresh.calls.llm).toBe(1);
  });

  test('LLM output that fails the guard: error, usage still counted, nothing stored', async () => {
    const { deps, calls } = setup();
    deps.invokeLLM = async () => {
      calls.llm++;
      return { nonsense: true };
    };
    expect(await handleAnalyze(deps)).toEqual({ status: 'error' });
    expect(calls.usageUpdate).toHaveLength(1);
    expect(calls.newsUpdate).toHaveLength(0);
  });

  test('LLM throwing: usage counted, error', async () => {
    const { deps, calls } = setup();
    deps.invokeLLM = async () => {
      throw new Error('boom');
    };
    expect(await handleAnalyze(deps)).toEqual({ status: 'error' });
    expect(calls.usageUpdate).toHaveLength(1);
  });

  test('malformed id (Base44 400 on the NewsItem read): not_found, no LLM, no usage write', async () => {
    const { deps, calls } = setup();
    deps.db.NewsItem.filter = async () => {
      throw Object.assign(new Error('Invalid query: id is not a valid record ID'), { status: 400 });
    };
    expect(await handleAnalyze(deps)).toEqual({ status: 'not_found' });
    expect(calls.llm).toBe(0);
    expect(calls.usageCreate + calls.usageUpdate.length + calls.newsUpdate.length).toBe(0);
  });

  test('NewsItem read failing with a 500 still propagates', async () => {
    const { deps } = setup();
    deps.db.NewsItem.filter = async () => {
      throw Object.assign(new Error('server down'), { status: 500 });
    };
    await expect(handleAnalyze(deps)).rejects.toThrow('server down');
  });

  test('NewsSource read with a 400: source missing, summary used, LLM still called', async () => {
    const { deps, calls } = setup();
    deps.db.NewsSource.filter = async () => {
      throw Object.assign(new Error('Invalid query: id is not a valid record ID'), { status: 400 });
    };
    expect(await handleAnalyze(deps)).toMatchObject({ status: 'ok', analysis: { from_summary: true } });
    expect(calls.fetch).toBe(0);
    expect(calls.llm).toBe(1);
  });
});

test('validAnalysis rejects bad shapes', () => {
  expect(validAnalysis(stored)).not.toBeNull();
  expect(validAnalysis(null)).toBeNull();
  expect(validAnalysis({ ...stored, about: 5 })).toBeNull();
  expect(validAnalysis({ ...stored, month: undefined })).toBeNull();
});
