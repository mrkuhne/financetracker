import { useState, type FormEvent } from 'react';
import { base44 } from '@/data/client';

export function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await base44.auth.loginViaEmailPassword(email.trim(), password);
      // The SDK stores the token itself; setting it explicitly guarantees persistence across reloads.
      if (res?.access_token) base44.auth.setToken(res.access_token, true);
      onLoggedIn();
    } catch {
      setError('Wrong email or password. Try again.');
      setBusy(false);
    }
  }

  const field = 'h-12 w-full rounded-2xl bg-surf px-4 text-[15px] text-ink outline-none';
  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center gap-8 px-6" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <h1 className="hero-num" style={{ fontSize: 52 }}>Finance Tracker</h1>
      <form onSubmit={submit} className="grid gap-3">
        <label htmlFor="login-email" className="sr-only">Email</label>
        <input id="login-email" name="email" type="email" autoComplete="username" inputMode="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        <label htmlFor="login-password" className="sr-only">Password</label>
        <input id="login-password" name="password" type="password" autoComplete="current-password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
        {error && <p role="alert" className="text-[13px]" style={{ color: 'var(--bad)' }}>{error}</p>}
        <button type="submit" disabled={busy} className="flex h-[50px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold disabled:opacity-60" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <button type="button" onClick={() => base44.auth.loginWithProvider('google', window.location.href)} className="flex h-[50px] w-full items-center justify-center rounded-2xl bg-surf2 text-[15px] font-semibold text-ink">
          Continue with Google
        </button>
      </form>
    </main>
  );
}
