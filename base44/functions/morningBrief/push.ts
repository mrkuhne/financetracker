import { ApplicationServer, importVapidKeys, PushMessageError, Urgency } from 'jsr:@negrel/webpush@0.5.0';
import { type PushResult, vapidJwks } from './pushResult.ts';

export { classifyPushResult, type PushResult } from './pushResult.ts';

export type PushSub = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string };
export type Vapid = { publicKey: string; privateKey: string; subject: string };

const TIMEOUT_MS = 10_000;

/** Sends one encrypted Web Push message. Never throws; the caller classifies the result. */
export async function sendPush(sub: PushSub, payload: PushPayload, vapid: Vapid): Promise<PushResult> {
  try {
    const vapidKeys = await importVapidKeys(vapidJwks(vapid.publicKey, vapid.privateKey));
    const server = await ApplicationServer.new({ contactInformation: vapid.subject, vapidKeys });
    const subscriber = server.subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } });
    // The library's fetch takes no AbortSignal, so bound it here.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('push_timeout')), TIMEOUT_MS);
    });
    try {
      await Promise.race([
        subscriber.pushTextMessage(JSON.stringify(payload), { urgency: Urgency.High, ttl: 24 * 3600 }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof PushMessageError) {
      return { ok: false, status: err.response.status, error: `push_${err.response.status}` };
    }
    return { ok: false, status: null, error: String((err as { message?: unknown } | null)?.message ?? 'push_error').slice(0, 200) };
  }
}
