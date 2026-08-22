import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Activity, Loader2, ArrowLeft } from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';
import { Button, Input, Field, Alert } from '../components/ui';

const LAST_EMAIL = 'vitalsync-last-email';

/**
 * Sign in, or make an account.
 *
 * Deliberately not a gate. The app is readable by anyone at a public URL and
 * this screen exists only to unlock *writing* — you reach it from a "Sign in to
 * edit" prompt, never by being bounced here on launch. Sessions persist, so for
 * the owner it is a once-per-device errand.
 *
 * Signing up is what makes the app more than one person's: a new account gets
 * its own private rows, since the public read policy is pinned to the owner's
 * id and reaches nobody else's data.
 */
export default function SignIn() {
  const { signIn, signUp, resetPassword } = useAuthStore();
  const navigate = useNavigate();

  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL) ?? '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const result =
      mode === 'signup'
        ? await signUp({ email, password, name })
        : await signIn({ email, password });

    if (!result.ok) {
      setError(result.message);
      setBusy(false);
      return;
    }

    localStorage.setItem(LAST_EMAIL, email.trim());

    // Sign-up with email confirmation on returns no session, so there is
    // nothing to navigate into yet.
    if (result.needsConfirmation) {
      setNotice(result.message);
      setBusy(false);
      setMode('signin');
      return;
    }
    navigate('/', { replace: true });
  };

  const forgot = async () => {
    if (!email.trim()) {
      setError('Enter your email first, then tap this again.');
      return;
    }
    const result = await resetPassword(email);
    setError(result.ok ? null : result.message);
    setNotice(result.ok ? result.message : null);
  };

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <form onSubmit={submit} className="w-full max-w-xs space-y-4">
        <Link to="/" className="muted flex items-center gap-1.5 text-xs hover:text-accent">
          <ArrowLeft size={14} aria-hidden="true" /> Back
        </Link>

        <div className="flex flex-col items-center gap-2 pb-1 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent/15">
            <Activity size={26} className="text-accent" aria-hidden="true" />
          </span>
          <h1 className="text-lg font-semibold tracking-tight">
            {mode === 'signup' ? 'Create your account' : 'Sign in to edit'}
          </h1>
          <p className="muted text-xs leading-relaxed">
            {mode === 'signup'
              ? 'Your own private data, in the same app. Nothing you log is visible to anyone else.'
              : 'Reading needs no account. This unlocks changing things, once per device.'}
          </p>
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}

        {mode === 'signup' ? (
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
        ) : null}

        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </Field>

        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
          />
        </Field>

        <Button type="submit" className="w-full" disabled={busy || !email || !password}>
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}
          {busy ? 'Just a moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </Button>

        <div className="flex items-center justify-between text-[11px]">
          <button
            type="button"
            className="muted hover:text-accent"
            onClick={() => {
              setMode(mode === 'signup' ? 'signin' : 'signup');
              setError(null);
              setNotice(null);
            }}
          >
            {mode === 'signup' ? 'I already have an account' : 'Create an account'}
          </button>
          {mode === 'signin' ? (
            <button type="button" className="muted hover:text-accent" onClick={forgot}>
              Forgot password
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
