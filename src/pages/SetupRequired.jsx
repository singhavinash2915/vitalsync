import { Activity, Terminal } from 'lucide-react';
import { Card, Alert } from '../components/ui';

/**
 * Shown when the Supabase env vars are missing. Without this the app would
 * just throw "Failed to fetch" on every screen with no hint as to why.
 */
export default function SetupRequired() {
  return (
    <div className="safe-top flex min-h-screen items-center justify-center px-5 py-10">
      <Card className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/15">
            <Activity size={20} className="text-accent" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-bold">VitalSync needs configuring</h1>
            <p className="muted text-xs">One step and you are done.</p>
          </div>
        </div>

        <Alert tone="warning" className="mb-4">
          <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> are not set.
        </Alert>

        <ol className="muted space-y-3 text-sm">
          <li>
            <span className="font-semibold text-[color:var(--text)]">1.</span> Create a project at{' '}
            <a
              className="text-accent underline"
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer noopener"
            >
              supabase.com/dashboard
            </a>
            .
          </li>
          <li>
            <span className="font-semibold text-[color:var(--text)]">2.</span> Run{' '}
            <code className="rounded bg-[color:var(--bg-sunken)] px-1 py-0.5 text-xs">
              supabase/migrations/0001_init.sql
            </code>{' '}
            in the SQL editor.
          </li>
          <li>
            <span className="font-semibold text-[color:var(--text)]">3.</span> Copy the project URL
            and anon key from Project Settings → API into <code>.env.local</code>:
          </li>
        </ol>

        <pre
          className="mt-3 overflow-x-auto rounded-xl border p-3 text-[11px] leading-relaxed"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
        >
          {`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...`}
        </pre>

        <p className="muted mt-3 flex items-center gap-2 text-xs">
          <Terminal size={13} aria-hidden="true" />
          Then restart the dev server — Vite only reads env files at startup.
        </p>
      </Card>
    </div>
  );
}
