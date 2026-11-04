import { createClientFromRequest } from 'npm:@base44/sdk';
import { secrets } from 'base44:runtime';
import { classifyPushResult, sendPush, type PushPayload } from './push.ts';

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

type SubRow = {
  id: string;
  owner_id?: string;
  created_by_id?: string;
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  active?: boolean;
};

const TEST_PAYLOAD: PushPayload = { title: 'Morning brief', body: 'Test notification from Finance Tracker.', url: '/news' };

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const body = (await req.json().catch(() => ({}))) as { action?: string } | null;
    const action = body?.action;

    const base44 = createClientFromRequest(req);

    if (action !== 'test') return json({ error: 'unknown_action' }, 400);

    let userId: string;
    try {
      const me = await base44.auth.me();
      if (!me?.id) return json({ error: 'unauthorized' }, 401);
      userId = me.id;
    } catch {
      return json({ error: 'unauthorized' }, 401);
    }

    const publicKey = await secrets.get('VAPID_PUBLIC_KEY');
    const privateKey = await secrets.get('VAPID_PRIVATE_KEY');
    const subject = await secrets.get('VAPID_SUBJECT');
    if (!publicKey || !privateKey || !subject) return json({ error: 'vapid_not_configured' }, 500);
    const vapid = { publicKey, privateKey, subject };

    const db = base44.asServiceRole.entities;
    // Only trust rows the user created for themselves: owner_id must agree with created_by_id.
    const rows = ((await db.PushSubscription.filter({ owner_id: userId, active: true })) ?? []) as SubRow[];
    const subs = rows.filter(
      (r) => r.active === true && r.owner_id === userId && r.created_by_id === userId && r.endpoint && r.p256dh && r.auth,
    );

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const s of subs) {
      const r = await sendPush({ endpoint: s.endpoint!, p256dh: s.p256dh!, auth: s.auth! }, TEST_PAYLOAD, vapid);
      const kind = classifyPushResult(r);
      if (kind === 'sent') {
        sent++;
        continue;
      }
      failed++;
      const error = r.ok ? 'unknown' : r.error;
      errors.push(error);
      try {
        await db.PushSubscription.update(s.id, kind === 'gone' ? { active: false, last_error: error } : { last_error: error });
      } catch (err) {
        console.error('push row update failed', safeErr(err));
      }
    }
    return json({ sent, failed, errors });
  } catch (err) {
    console.error('morningBrief error', safeErr(err));
    return json({ error: 'internal' }, 500);
  }
}
