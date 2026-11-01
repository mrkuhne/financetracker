import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { base44 } from '@/data/client';
import { runStartup } from '@/app/startup';
import { LoginScreen } from './LoginScreen';
import { resolveGateSafe, type GateState } from './gateState';

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking');

  const check = useCallback(async (isCancelled: () => boolean = () => false) => {
    setState('checking');
    const next = await resolveGateSafe({ isAuthenticated: () => base44.auth.isAuthenticated(), runStartup });
    if (!isCancelled()) setState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void check(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [check]);

  if (state === 'ready') return <>{children}</>;
  if (state === 'login') return <LoginScreen onLoggedIn={() => void check()} />;
  return (
    <div className="grid min-h-dvh place-items-center">
      {state === 'error' ? (
        <div className="grid gap-3 text-center">
          <p className="sub">Could not start the app.</p>
          <button className="ib soft" style={{ width: 'auto', padding: '0 16px' }} onClick={() => void check()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="spinner" role="status" aria-label="Loading" />
      )}
    </div>
  );
}
