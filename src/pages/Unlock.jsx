import { useEffect, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';
import { Button, Input, Field, Alert } from '../components/ui';

const LAST_EMAIL = 'vitalsync-last-email';

/**
 * The only thing left of signing in.
 *
 * This is a single-user app, so there is no account to choose, nothing to sign
 * up for and nobody to switch to — the email is remembered from last time and
 * all that is asked for is the password. It is shown once per device: the
 * session persists in storage that the app asks the browser not to evict, so
 * every launch after this one opens straight onto the dashboard.
 *
 * The alternative — no password at all — would mean dropping row-level
 * security, and since the anon key is compiled into a bundle served from a
 * public URL, that is the same thing as publishing seven years of health
 * records to anyone who guesses the address.
 */
export default function Unlock() {
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL) ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const known = Boolean(localStorage.getItem(LAST_EMAIL));

  useEffect(() => {
    document.title = 'VitalSync';
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn({ email, password });
    if (result.ok) {
      localStorage.setItem(LAST_EMAIL, email.trim());
    } else {
      setError(result.message);
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <form onSubmit={submit} className="w-full max-w-xs space-y-4">
        <div className="flex flex-col items-center gap-2 pb-2 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/15">
            <Activity size={26} className="text-accent" aria-hidden="true" />
          </span>
          <h1 className="text-lg font-semibold tracking-tight">VitalSync</h1>
          <p className="muted text-xs leading-relaxed">
            {known
              ? 'Unlock once on this device and it will stay unlocked.'
              : 'Sign in once on this device and it will stay signed in.'}
          </p>
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        {!known ? (
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </Field>
        ) : null}

        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            autoFocus={known}
          />
        </Field>

        <Button type="submit" className="w-full" disabled={busy || !password}>
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
          {busy ? 'Unlocking…' : 'Unlock'}
        </Button>

        {known ? (
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(LAST_EMAIL);
              setEmail('');
            }}
            className="muted w-full text-center text-[11px] hover:text-accent"
          >
            Use a different account
          </button>
        ) : null}
      </form>
    </div>
  );
}
