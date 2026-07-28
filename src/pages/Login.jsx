import { useState } from 'react';
import { Activity, Mail, Lock, User } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { Button, Input, Field, Alert, Card } from '../components/ui';
import { useTheme } from '../context/ThemeContext';

const MODES = {
  signin: { title: 'Welcome back', cta: 'Sign in' },
  signup: { title: 'Create your account', cta: 'Create account' },
  reset: { title: 'Reset your password', cta: 'Send reset link' },
};

export default function Login() {
  const { signIn, signUp, resetPassword, sendMagicLink } = useAuthStore();
  const { isDark } = useTheme();

  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [status, setStatus] = useState({ tone: null, message: '' });
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setStatus({ tone: null, message: '' });

    let result;
    if (mode === 'signin') result = await signIn(form);
    else if (mode === 'signup') result = await signUp(form);
    else result = await resetPassword(form.email);

    setBusy(false);

    if (!result.ok) {
      setStatus({ tone: 'error', message: result.message });
    } else if (result.message) {
      setStatus({ tone: 'success', message: result.message });
      if (result.needsConfirmation) setMode('signin');
    }
    // On a successful sign-in the auth listener redirects; nothing else to do.
  };

  const magicLink = async () => {
    if (!form.email) {
      setStatus({ tone: 'error', message: 'Enter your email address first.' });
      return;
    }
    setBusy(true);
    const result = await sendMagicLink(form.email);
    setBusy(false);
    setStatus({ tone: result.ok ? 'success' : 'error', message: result.message });
  };

  return (
    <div className="safe-top safe-bottom flex min-h-screen flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, #38bdf8 0%, #22c55e 100%)',
              boxShadow: isDark ? '0 0 40px -8px rgba(56,189,248,.5)' : 'none',
            }}
          >
            <Activity size={30} className="text-ink-900" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">VitalSync</h1>
          <p className="muted mt-1 text-sm">Recovery, readiness and sleep — all in one place.</p>
        </div>

        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold">{MODES[mode].title}</h2>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' ? (
              <Field label="Name">
                <div className="relative">
                  <User
                    size={15}
                    className="muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <Input
                    className="pl-9"
                    value={form.name}
                    onChange={set('name')}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </div>
              </Field>
            ) : null}

            <Field label="Email" required>
              <div className="relative">
                <Mail
                  size={15}
                  className="muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  className="pl-9"
                  type="email"
                  required
                  value={form.email}
                  onChange={set('email')}
                  placeholder="you@example.com"
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
            </Field>

            {mode !== 'reset' ? (
              <Field
                label="Password"
                required
                hint={mode === 'signup' ? 'At least 6 characters' : undefined}
              >
                <div className="relative">
                  <Lock
                    size={15}
                    className="muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <Input
                    className="pl-9"
                    type="password"
                    required
                    minLength={6}
                    value={form.password}
                    onChange={set('password')}
                    placeholder="••••••••"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  />
                </div>
              </Field>
            ) : null}

            {status.message ? <Alert tone={status.tone}>{status.message}</Alert> : null}

            <Button type="submit" size="lg" loading={busy} className="w-full">
              {MODES[mode].cta}
            </Button>
          </form>

          {mode !== 'reset' ? (
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={magicLink} disabled={busy}>
              Email me a magic link instead
            </Button>
          ) : null}
        </Card>

        <div className="muted mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
          {mode === 'signin' ? (
            <>
              <button className="hover:text-accent" onClick={() => setMode('signup')}>
                Create an account
              </button>
              <span aria-hidden="true">·</span>
              <button className="hover:text-accent" onClick={() => setMode('reset')}>
                Forgot password?
              </button>
            </>
          ) : (
            <button className="hover:text-accent" onClick={() => setMode('signin')}>
              ← Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
