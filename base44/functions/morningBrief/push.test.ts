import { describe, expect, it } from 'vitest';
import { classifyPushResult, digestPushStatus, vapidJwks } from './pushResult.ts';

describe('classifyPushResult', () => {
  it('ok is sent', () => expect(classifyPushResult({ ok: true })).toBe('sent'));
  it('410 is gone', () => expect(classifyPushResult({ ok: false, status: 410, error: 'x' })).toBe('gone'));
  it('404 is gone', () => expect(classifyPushResult({ ok: false, status: 404, error: 'x' })).toBe('gone'));
  it('500 is failed', () => expect(classifyPushResult({ ok: false, status: 500, error: 'x' })).toBe('failed'));
  it('no status is failed', () => expect(classifyPushResult({ ok: false, status: null, error: 'x' })).toBe('failed'));
});

describe('vapidJwks', () => {
  const pub = 'BMuuatsbgzDmCofugKAKGNx0wSEXTjjqelwACzHDC-MNUOY-7XK8xuaFGQ5_R4LPZFyxZjV5mNvCO9hV-v3TWpg';
  const priv = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'; // 32 bytes 0..31, not a real key

  it('splits the raw public key into x/y and keeps d', () => {
    const j = vapidJwks(pub, priv);
    expect(j.publicKey).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(j.publicKey.x).toHaveLength(43);
    expect(j.publicKey.y).toHaveLength(43);
    expect(j.privateKey).toMatchObject({ x: j.publicKey.x, y: j.publicKey.y, d: priv });
  });

  it('rejects malformed keys', () => {
    expect(() => vapidJwks('abc', priv)).toThrow();
    expect(() => vapidJwks(pub, 'abc')).toThrow();
  });
});

describe('digestPushStatus', () => {
  it('no subscriptions is skipped', () => expect(digestPushStatus([])).toEqual({ status: 'skipped', error: null }));
  it('any sent is sent', () => expect(digestPushStatus(['failed', 'sent', 'gone'])).toEqual({ status: 'sent', error: null }));
  it('all gone is failed with subscription expired', () =>
    expect(digestPushStatus(['gone', 'gone'])).toEqual({ status: 'failed', error: 'subscription expired' }));
  it('failed or mixed failed/gone is failed', () => {
    expect(digestPushStatus(['failed'])).toEqual({ status: 'failed', error: 'push failed' });
    expect(digestPushStatus(['gone', 'failed'], 'push_500')).toEqual({ status: 'failed', error: 'push_500' });
  });
});
