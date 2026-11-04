// Pure helpers for push.ts. No jsr:/npm: imports so vitest can load this file.

export type PushResult = { ok: true } | { ok: false; status: number | null; error: string };

/** 404/410 mean the subscription no longer exists; anything else that failed is retryable. */
export function classifyPushResult(r: PushResult): 'sent' | 'gone' | 'failed' {
  if (r.ok) return 'sent';
  return r.status === 404 || r.status === 410 ? 'gone' : 'failed';
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64urlEncode(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Turns the web-push style VAPID keys (raw base64url: 65-byte uncompressed public point,
 * 32-byte private scalar) into the JWK pair that WebCrypto / @negrel/webpush imports.
 */
export function vapidJwks(publicKey: string, privateKey: string): { publicKey: JsonWebKey; privateKey: JsonWebKey } {
  const pub = b64urlDecode(publicKey);
  const d = b64urlDecode(privateKey);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error('bad_vapid_public_key');
  if (d.length !== 32) throw new Error('bad_vapid_private_key');
  const x = b64urlEncode(pub.slice(1, 33));
  const y = b64urlEncode(pub.slice(33, 65));
  const base = { kty: 'EC', crv: 'P-256', x, y, ext: true };
  return { publicKey: { ...base }, privateKey: { ...base, d: b64urlEncode(d) } };
}

/**
 * Digest-level push outcome: nothing to send is skipped, any delivery is sent, otherwise failed —
 * 'subscription expired' when every subscription is gone, else `failedError` (or 'push failed').
 */
export function digestPushStatus(
  results: ('sent' | 'gone' | 'failed')[],
  failedError?: string,
): { status: 'sent' | 'failed' | 'skipped'; error: string | null } {
  if (results.length === 0) return { status: 'skipped', error: null };
  if (results.includes('sent')) return { status: 'sent', error: null };
  if (results.every((r) => r === 'gone')) return { status: 'failed', error: 'subscription expired' };
  return { status: 'failed', error: failedError || 'push failed' };
}
