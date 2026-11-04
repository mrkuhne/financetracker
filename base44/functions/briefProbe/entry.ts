import { createClientFromRequest } from 'npm:@base44/sdk';

// Log only safe fields, never payloads.
const safeErr = (err: unknown) => {
  const e = err as { name?: string; status?: number; response?: { status?: number }; message?: unknown } | null;
  return {
    name: e?.name,
    status: e?.status ?? e?.response?.status,
    message: String(e?.message ?? '').slice(0, 200),
  };
};

const errTag = (err: unknown) => {
  const s = safeErr(err);
  return `err:${s.status ?? s.name ?? 'unknown'}`;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default async function (req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { source?: string };
  const source = body?.source ?? null;
  const base44 = createClientFromRequest(req);

  let me: string = 'ok';
  try {
    const u = await base44.auth.me();
    me = u ? 'ok' : 'null';
  } catch (err) {
    me = errTag(err);
  }

  let users: number | string = 0;
  try {
    const list = await base44.asServiceRole.entities.User.list();
    users = Array.isArray(list) ? list.length : 0;
  } catch (err) {
    users = errTag(err);
  }

  let llm: string = '';
  try {
    const res = (await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: 'Reply with the word ok',
      response_json_schema: { type: 'object', properties: { w: { type: 'string' } } },
    })) as { w?: string } | null;
    llm = String(res?.w ?? 'empty');
  } catch (err) {
    llm = errTag(err);
  }

  const result = { source, me, users, llm };
  console.log('briefProbe', JSON.stringify(result));
  return json(result);
}
