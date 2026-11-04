import { base44 } from '@/data/client';

/** VAPID application server key (public half; the private key lives in the function secrets). */
export const VAPID_PUBLIC_KEY = 'BMuuatsbgzDmCofugKAKGNx0wSEXTjjqelwACzHDC-MNUOY-7XK8xuaFGQ5_R4LPZFyxZjV5mNvCO9hV-v3TWpg';

export type PushSupport = 'ok' | 'not_installed' | 'unsupported' | 'denied';

/** iOS only allows Web Push from a Home Screen web app, so "not installed" is its own state. */
export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // iOS Safari (before 18.4) hides PushManager outside a Home Screen app, so check iOS first.
  if (isIos() && !standalone) return 'not_installed';
  if (!('PushManager' in window) || !('serviceWorker' in navigator) || typeof Notification === 'undefined') return 'unsupported';
  if (!standalone) return 'not_installed';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

/** iPhone/iPad, including iPadOS which reports a Mac UA but has touch. */
function isIos(): boolean {
  const ua = navigator.userAgent ?? '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

/** A short device label like "iPhone" for the subscription row. */
export function deviceName(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): string {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'This device';
}

function keyToBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** `serviceWorker.ready` never resolves when no worker is registered, so give up after a while. */
async function readyRegistration(ms = 3000): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('no_service_worker')), ms);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** This device's push subscription, or null (also when there is no service worker; never hangs). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? await reg.pushManager.getSubscription() : null;
}

/** Asks permission, subscribes this device and stores the subscription for the signed-in user. */
export async function subscribePush(deviceName: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission_denied');
  const reg = await readyRegistration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error('subscription_incomplete');
  const me = (await base44.auth.me()) as { id: string };
  // Rows cannot be updated (RLS), so replace any older row for this endpoint.
  const old = (await base44.entities.PushSubscription.filter({ owner_id: me.id, endpoint: json.endpoint })) as { id: string }[];
  for (const r of old ?? []) await base44.entities.PushSubscription.delete(r.id);
  await base44.entities.PushSubscription.create({
    owner_id: me.id,
    endpoint: json.endpoint,
    p256dh,
    auth,
    device_name: deviceName,
    active: true,
    last_error: null,
  });
}

/** Unsubscribes this device and deletes its stored row. */
export async function unsubscribePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  const me = (await base44.auth.me()) as { id: string };
  const rows = (await base44.entities.PushSubscription.filter({ owner_id: me.id, endpoint })) as { id: string }[];
  for (const r of rows ?? []) await base44.entities.PushSubscription.delete(r.id);
}

/** Asks the morningBrief function to send a test notification to all of this user's devices. */
export async function sendTestPush(): Promise<{ sent: number; failed: number; errors: string[] }> {
  const res = (await base44.functions.invoke('morningBrief', { action: 'test' })) as unknown;
  const body = ((res as { data?: unknown } | null)?.data ?? res) as { sent?: unknown; failed?: unknown; errors?: unknown } | null;
  return {
    sent: typeof body?.sent === 'number' ? body.sent : 0,
    failed: typeof body?.failed === 'number' ? body.failed : 0,
    errors: Array.isArray(body?.errors) ? body.errors.map(String) : [],
  };
}
