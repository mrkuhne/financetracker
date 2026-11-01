import { useEffect, useState, type ReactNode } from 'react';
import { base44 } from '@/data/client';
import { runStartup } from '@/app/startup';

type State = 'checking' | 'ready' | 'error';

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(await base44.auth.isAuthenticated())) {
          base44.auth.redirectToLogin(window.location.href);
          return;
        }
        await runStartup();
        if (!cancelled) setState('ready');
      } catch (e) {
        console.error(e);
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'ready') return <>{children}</>;
  return (
    <div className="grid min-h-dvh place-items-center">
      {state === 'error' ? (
        <div className="grid gap-3 text-center">
          <p className="sub">Could not start the app.</p>
          <button className="ib soft" style={{ width: 'auto', padding: '0 16px' }} onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="spinner" role="status" aria-label="Loading" />
      )}
    </div>
  );
}
