import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/data/client', () => ({ base44: { auth: {}, entities: {}, functions: {} } }));

import { deviceName, pushSupport } from '@/data/push';

function stub({ pushManager = true, standalone = true, iosStandalone = false, permission = 'default' as string } = {}) {
  const win: Record<string, unknown> = {
    matchMedia: (q: string) => ({ matches: q === '(display-mode: standalone)' && standalone }),
  };
  if (pushManager) win.PushManager = function PushManager() {};
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', { serviceWorker: {}, standalone: iosStandalone, userAgent: 'test' });
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
