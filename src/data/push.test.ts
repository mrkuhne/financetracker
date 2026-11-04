import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/data/client', () => ({ base44: { auth: {}, entities: {}, functions: {} } }));

import { deviceName, pushSupport } from '@/data/push';

function stub({ pushManager = true, standalone = true, iosStandalone = false, permission = 'default' as string, ua = 'test', touch = 0 } = {}) {
  const win: Record<string, unknown> = {
    matchMedia: (q: string) => ({ matches: q === '(display-mode: standalone)' && standalone }),
  };
  if (pushManager) win.PushManager = function PushManager() {};
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', { serviceWorker: {}, standalone: iosStandalone, userAgent: ua, maxTouchPoints: touch });
  vi.stubGlobal('Notification', { permission });
}

afterEach(() => vi.unstubAllGlobals());

describe('pushSupport', () => {
  it('unsupported without PushManager', () => {
    stub({ pushManager: false });
    expect(pushSupport()).toBe('unsupported');
  });
  it('not_installed when not standalone', () => {
    stub({ standalone: false, iosStandalone: false });
    expect(pushSupport()).toBe('not_installed');
  });
  it('not_installed on iOS Safari, where PushManager is hidden until installed', () => {
    stub({ pushManager: false, standalone: false, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)' });
    expect(pushSupport()).toBe('not_installed');
  });
  it('not_installed on iPadOS Safari (Mac UA with touch)', () => {
    stub({ pushManager: false, standalone: false, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', touch: 5 });
    expect(pushSupport()).toBe('not_installed');
  });
  it('unsupported on desktop without PushManager even when not installed', () => {
    stub({ pushManager: false, standalone: false, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
    expect(pushSupport()).toBe('unsupported');
  });
  it('ok via iOS navigator.standalone', () => {
    stub({ standalone: false, iosStandalone: true });
    expect(pushSupport()).toBe('ok');
  });
  it('denied when permission is denied', () => {
    stub({ permission: 'denied' });
    expect(pushSupport()).toBe('denied');
  });
  it('ok when installed and not denied', () => {
    stub();
    expect(pushSupport()).toBe('ok');
  });
});

describe('deviceName', () => {
  it('names common devices', () => {
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone');
    expect(deviceName('Mozilla/5.0 (Linux; Android 14)')).toBe('Android');
    expect(deviceName('curl/8')).toBe('This device');
  });
});

describe('currentSubscription', () => {
  it('resolves null without hanging when no service worker is registered', async () => {
    const { currentSubscription } = await import('@/data/push');
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => undefined, ready: new Promise(() => {}) } });
    expect(await currentSubscription()).toBeNull();
  });
  it('returns the registration subscription', async () => {
    const { currentSubscription } = await import('@/data/push');
    const sub = { endpoint: 'e' };
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }) } });
    expect(await currentSubscription()).toBe(sub);
  });
});
