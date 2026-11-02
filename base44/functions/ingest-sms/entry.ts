import { createClientFromRequest } from 'npm:@base44/sdk';
import {
  PARSE_SCHEMA,
  budapestDate,
  buildPrompt,
  dedupeHash,
  extractApiKey,
  looksLikeMoney,
  normalizeParsed,
  sha256Hex,
  validateBody,
} from './logic.ts';

// Log only safe fields: SDK (axios) errors carry request bodies containing the SMS text.
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

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    // 1. Key check, before the body is read or the LLM is called.
    const key = extractApiKey(req.headers);
    if (!key) return json({ error: 'invalid_key' }, 401);
    const keyRows = await db.ApiKey.filter({ key_hash: await sha256Hex(key) });
    const keyRow = (keyRows ?? []).find((r: { revoked?: boolean }) => r.revoked !== true);
    if (!keyRow) return json({ error: 'invalid_key' }, 401);
    // Owner = the server-set creator, never the client-set owner_id alone (else a key row
    // could claim another user's id). owner_id must agree with created_by_id.
    if (typeof keyRow.created_by_id !== 'string' || !keyRow.created_by_id) return json({ error: 'invalid_key' }, 401);
    if (keyRow.owner_id !== keyRow.created_by_id) return json({ error: 'invalid_key' }, 401);
    const ownerId: string = keyRow.created_by_id;

    // 2. Body.
    let rawBody: unknown = null;
    try {
      rawBody = await req.json();
    } catch {
      rawBody = null;
    }
    const nowIso = new Date().toISOString();
    const parsedBody = validateBody(rawBody, nowIso);
    if (!parsedBody.ok) return json({ error: parsedBody.error }, 400);
    const { text, sender, received_at } = parsedBody.value;

    // 3. Duplicate check.
    const text_hash = await dedupeHash(sender, text);
    const isDuplicate = async () => {
      const existing = await db.SmsMessage.filter({ owner_id: ownerId, text_hash });
      return !!existing && existing.length > 0;
    };
    if (await isDuplicate()) return json({ status: 'duplicate' });

    const touchKey = async () => {
      try {
        await db.ApiKey.update(keyRow.id, { last_used_at: new Date().toISOString() });
      } catch (err) {
        console.error('last_used_at update failed', safeErr(err));
      }
    };
    const base = { owner_id: ownerId, sender, text_hash, received_at: new Date(received_at).toISOString() };

    // 4. Cheap pre-filter: no money amount.
    if (!looksLikeMoney(text)) {
      await db.SmsMessage.create({ ...base, status: 'ignored', reason: 'no_amount', text: null });
      await touchKey();
      return json({ status: 'ignored' });
    }

    // 5. Owner's category names.
    type Cat = { name?: string; kind?: string; created_by_id?: string };
    let cats: Cat[];
    try {
      cats = ((await db.Category.filter({ created_by_id: ownerId })) ?? []).filter(
        (c: Cat) => c.created_by_id === ownerId,
      );
    } catch {
      const all: Cat[] = await db.Category.list();
      cats = (all ?? []).filter((c) => c.created_by_id === ownerId);
    }
    const names = (cats ?? [])
      .filter((c) => (c.kind === 'expense' || c.kind === 'income') && typeof c.name === 'string')
      .map((c) => c.name as string);

    // 6. LLM; any failure is a stored `failed`, never a failed request.
    let result: ReturnType<typeof normalizeParsed>;
    try {
      const raw = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: buildPrompt(text, sender, names),
        response_json_schema: PARSE_SCHEMA,
      });
      result = normalizeParsed(raw, budapestDate(received_at), names);
    } catch (err) {
      console.error('llm call failed', safeErr(err));
      result = { status: 'failed', reason: 'llm_error' };
    }

    // 7. Store. Re-check duplicates first: the LLM call is slow, so this narrows the race
    // with a concurrent identical request (the client dedupes whatever still slips through).
    if (await isDuplicate()) return json({ status: 'duplicate' });
    if (result.status === 'parsed') {
      await db.SmsMessage.create({
        ...base,
        status: 'parsed',
        text,
        kind: result.kind,
        amount_minor: result.amount_minor,
        currency: result.currency,
        merchant: result.merchant,
        date: result.date,
        category_name: result.category_name,
      });
      await touchKey();
      return json({
        status: 'parsed',
        kind: result.kind,
        amount_minor: result.amount_minor,
        currency: result.currency,
        merchant: result.merchant,
      });
    }

    await db.SmsMessage.create({
      ...base,
      status: result.status,
      reason: result.reason,
      text: result.status === 'ignored' ? null : text,
    });
    await touchKey();
    return json({ status: result.status });
  } catch (err) {
    console.error('ingest-sms error', safeErr(err));
    return json({ error: 'internal' }, 500);
  }
}
