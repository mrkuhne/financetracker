export type GateState = 'checking' | 'login' | 'ready' | 'error';

export interface GateDeps {
  isAuthenticated: () => Promise<boolean>;
  runStartup: () => Promise<unknown>;
}

/** Decides what the gate shows once the initial auth check resolves. Throws propagate to the caller. */
export async function resolveGate(deps: GateDeps): Promise<'login' | 'ready'> {
  if (!(await deps.isAuthenticated())) return 'login';
  await deps.runStartup();
  return 'ready';
}

export async function resolveGateSafe(deps: GateDeps): Promise<'login' | 'ready' | 'error'> {
  try {
    return await resolveGate(deps);
  } catch (e) {
    console.error(e);
    return 'error';
  }
}
