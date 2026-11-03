import { createClientFromRequest } from 'npm:@base44/sdk';
import { chartUrl, parseChart, validateSymbols } from './logic.ts';

// Log only safe fields, never payloads.
const safeErr = (err: unknown) => {
  const e = err as { name?: string; status?: number; response?: { status?: number }; message?: unknown } | null;
  return {
    name: e?.name,
    status: e?.status ?? e?.response?.status,
    message: String(e?.message ?? '').slice(0, 200),
  };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    // Signed-in users only.
    const base44 = createClientFromRequest(req);
    try {
      const me = await base44.auth.me();
      if (!me) return json({ error: 'unauthorized' }, 401);
    } catch {
      return json({ error: 'unauthorized' }, 401);
    }

    let rawBody: unknown = null;
    try {
      rawBody = await req.json();
    } catch {
      rawBody = null;
    }
    const symbols = validateSymbols(rawBody);
    if (!symbols) return json({ error: 'invalid_symbols' }, 400);

    const quotes: { symbol: string; price: number; currency: string; as_of: string }[] = [];
    const failed: string[] = [];
    for (const symbol of symbols) {
      try {
        const res = await fetch(chartUrl(symbol), { headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } });
        if (!res.ok) {
          console.error('quote fetch failed', { symbol, status: res.status });
          failed.push(symbol);
          continue;
        }
        const parsed = parseChart(symbol, await res.json());
        if (!parsed) {
          console.error('quote parse failed', { symbol, status: res.status });
          failed.push(symbol);
          continue;
        }
        quotes.push({ symbol, ...parsed });
      } catch (err) {
        console.error('quote fetch error', { symbol, ...safeErr(err) });
        failed.push(symbol);
      }
    }
    return json({ quotes, failed });
  } catch (err) {
    console.error('quotes error', safeErr(err));
    return json({ error: 'internal' }, 500);
  }
}
