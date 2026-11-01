import { describe, expect, it, vi } from 'vitest';
import { resolveGate, resolveGateSafe } from './gateState';

describe('resolveGate', () => {
  it('authenticated: runs startup then ready', async () => {
    const runStartup = vi.fn(async () => {});
    expect(await resolveGate({ isAuthenticated: async () => true, runStartup })).toBe('ready');
    expect(runStartup).toHaveBeenCalledTimes(1);
  });
  it('unauthenticated: login, no startup', async () => {
    const runStartup = vi.fn(async () => {});
    expect(await resolveGate({ isAuthenticated: async () => false, runStartup })).toBe('login');
    expect(runStartup).not.toHaveBeenCalled();
  });
  it('throw: error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await resolveGateSafe({ isAuthenticated: async () => { throw new Error('x'); }, runStartup: async () => {} });
    expect(r).toBe('error');
  });
  it('startup failure: error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await resolveGateSafe({ isAuthenticated: async () => true, runStartup: async () => { throw new Error('x'); } });
    expect(r).toBe('error');
  });
});
