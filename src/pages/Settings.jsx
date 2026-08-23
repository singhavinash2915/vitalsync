import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Moon,
  RefreshCw,
  Save,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  User,
  Watch,
} from 'lucide-react';

import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { functionsBaseUrl, supabase, describeError, anonKey } from '../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { DEFAULT_CALORIE_TARGET, suggestCalorieTarget, SCORING_VERSION } from '../lib/scores';
import { todayKey, relativeDay } from '../lib/dates';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Field,
  Select,
  Alert,
  Segmented,
  Badge,
} from '../components/ui';
import EditGate, { useCanEdit } from '../components/EditGate';
import ImportHealthModal from '../components/ImportHealthModal';
import { SyncPanel } from '../components/SyncStatus';

const GOALS = [
  { value: 'performance', label: 'Athletic performance' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'strength', label: 'Strength & muscle' },
  { value: 'weight_loss', label: 'Body composition' },
  { value: 'longevity', label: 'Health & longevity' },
];

function CopyRow({ label, value, secret = false }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(!secret);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked outside a secure context — select it instead.
      window.prompt('Copy this value', value);
    }
  };

  const display = revealed ? value : '•'.repeat(Math.min(value.length, 44));

  return (
    <div>
      <p className="muted mb-1 text-[10px] uppercase tracking-wide">{label}</p>
      <div
        className="flex items-center gap-2 rounded-xl border p-2"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
      >
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[11px]">
          {display}
        </code>
        {secret ? (
          <button
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide' : 'Reveal'}
            className="muted shrink-0 rounded-lg p-1.5 hover:text-accent"
          >
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        ) : null}
        <button
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="muted shrink-0 rounded-lg p-1.5 hover:text-accent"
        >
          {copied ? <Check size={14} className="text-score-excellent" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}

/**
 * Whether the stored scores are actually current.
 *
 * Rebuilds happen quietly, on a version bump, in the background, and until now
 * there was no way to tell whether one had run — which made "check the scores
 * rebuilt" a question only the database could answer. This says it on the
 * screen: the formula the code is on, the formula your saved history was built
 * with, and when it last changed.
 */
function ScoringStatus() {
  const profile = useAuthStore((s) => s.profile);
  const scores = useDataStore((s) => s.scores);
  const canEdit = useCanEdit();

  const stored = profile?.scoring_version ?? null;
  const current = stored === SCORING_VERSION;
  const lastWrite = scores.reduce(
    (latest, r) => (r.updated_at && (!latest || r.updated_at > latest) ? r.updated_at : latest),
    null
  );

  return (
    <div
      className="rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Scoring formula</span>
        <span
          className="flex items-center gap-1 font-semibold"
          style={{ color: current ? '#22c55e' : '#f97316' }}
        >
          {current ? <Check size={12} aria-hidden="true" /> : <AlertTriangle size={12} aria-hidden="true" />}
          v{stored ?? '—'} {current ? 'up to date' : `— code is on v${SCORING_VERSION}`}
        </span>
      </div>
      <p className="muted mt-1">
        {current
          ? 'Your saved history was rebuilt with the formula this build uses.'
          : canEdit
            ? 'Your saved scores were built with an older formula. Open the dashboard and it will rebuild itself, or use the button below.'
            : 'Sign in to rebuild — a signed-out session cannot write.'}
        {lastWrite ? ` Last written ${relativeDay(lastWrite.slice(0, 10))}.` : ''}
      </p>
    </div>
  );
}

export default function Settings() {
  const { profile, user, updateProfile, signOut } = useAuthStore();
  const canEdit = useCanEdit();
  const { health, sleep, workouts, journal, scores, recomputeAll, saving, loadAll } = useDataStore();
  const { theme, setTheme } = useTheme();

  const [form, setForm] = useState({
    name: profile?.name ?? '',
    age: profile?.age ?? '',
    weight: profile?.weight ?? '',
    height: profile?.height ?? '',
    fitness_goal: profile?.fitness_goal ?? 'performance',
    sex: profile?.sex ?? '',
    calorie_target: profile?.calorie_target ?? DEFAULT_CALORIE_TARGET,
  });
  const [status, setStatus] = useState({ tone: null, message: '' });
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [syncKeys, setSyncKeys] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);

  const loadSyncKeys = useCallback(async () => {
    const { data, error } = await supabase
      .from('sync_keys')
      .select('id, key_prefix, label, last_used_at, created_at')
      .order('created_at', { ascending: false });
    if (!error) setSyncKeys(data ?? []);
  }, []);

  useEffect(() => {
    if (user?.id) loadSyncKeys();
  }, [user?.id, loadSyncKeys]);

  /**
   * Keys are minted by the Edge Function, not the browser: it holds the
   * service-role secret needed to write a hash the client never sees, and it
   * returns the plaintext exactly once.
   */
  const createSyncKey = async () => {
    setKeyBusy(true);
    setStatus({ tone: null, message: '' });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sign in first — a sync key is minted for your account.');

      const response = await fetch(`${functionsBaseUrl}/health-sync?action=create-key`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.error || 'Could not create key.');

      setNewKey(payload.key);
      await loadSyncKeys();
    } catch (error) {
      setStatus({ tone: 'error', message: describeError(error, 'Could not create a sync key.') });
    } finally {
      setKeyBusy(false);
    }
  };

  const revokeKey = async (id) => {
    const { error } = await supabase.from('sync_keys').delete().eq('id', id);
    if (error) {
      setStatus({ tone: 'error', message: describeError(error) });
      return;
    }
    setNewKey('');
    await loadSyncKeys();
  };

  // Tuned from your own logged days, not a guess. Only offered when it would
  // actually change something.
  const suggestedTarget = suggestCalorieTarget(health.map((h) => h.active_calories));
  const targetIsOff =
    suggestedTarget !== null && Math.abs(suggestedTarget - Number(form.calorie_target)) >= 100;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy(true);
    setStatus({ tone: null, message: '' });

    const targetChanged = Number(form.calorie_target) !== Number(profile?.calorie_target);
    const result = await updateProfile({
      name: form.name.trim() || null,
      age: form.age ? Number(form.age) : null,
      weight: form.weight ? Number(form.weight) : null,
      height: form.height ? Number(form.height) : null,
      fitness_goal: form.fitness_goal,
      sex: form.sex || null,
      calorie_target: Number(form.calorie_target) || DEFAULT_CALORIE_TARGET,
    });

    if (!result.ok) {
      setBusy(false);
      setStatus({ tone: 'error', message: result.message });
      return;
    }

    // The calorie target feeds exertion, which feeds readiness — every stored
    // score is now stale, so rebuild them.
    if (targetChanged) {
      await recomputeAll(user.id, result.data);
      setStatus({ tone: 'success', message: 'Profile saved and all scores rebuilt.' });
    } else {
      setStatus({ tone: 'success', message: 'Profile saved.' });
    }
    setBusy(false);
  };

  /**
   * Clears the service worker and every cache, then reloads. The installed PWA
   * updates on its own, but only on its own schedule — this is the escape
   * hatch when a device is provably stuck on an old build.
   */
  const forceUpdate = async () => {
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((registrations ?? []).map((r) => r.unregister()));
      const keys = await caches?.keys?.();
      await Promise.all((keys ?? []).map((k) => caches.delete(k)));
    } catch {
      // Nothing to clear, or the browser blocked it — reloading is still right.
    }
    window.location.reload(true);
  };

  const exportJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      profile,
      health_logs: health,
      sleep_logs: sleep,
      workout_logs: workouts,
      journal_logs: journal,
      scores,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vitalsync-export-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const header = [
      'date',
      'hrv',
      'resting_hr',
      'spo2',
      'body_temp',
      'active_calories',
      'steps',
      'sleep_hours',
      'sleep_quality',
      'recovery_score',
      'sleep_score',
      'exertion_score',
      'readiness_score',
    ];
    const dates = [...new Set([...health, ...sleep, ...scores].map((r) => r.date))].sort();
    const rows = dates.map((date) => {
      const h = health.find((r) => r.date === date) ?? {};
      const s = sleep.find((r) => r.date === date) ?? {};
      const sc = scores.find((r) => r.date === date) ?? {};
      return [
        date,
        h.hrv ?? '',
        h.resting_hr ?? '',
        h.spo2 ?? '',
        h.body_temp ?? '',
        h.active_calories ?? '',
        h.steps ?? '',
        s.duration_hours ?? '',
        s.quality_rating ?? '',
        sc.recovery_score ?? '',
        sc.sleep_score ?? '',
        sc.exertion_score ?? '',
        sc.readiness_score ?? '',
      ].join(',');
    });

    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vitalsync-export-${todayKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rebuild = async () => {
    const result = await recomputeAll(user.id, profile);
    setStatus(
      result.ok
        ? { tone: 'success', message: `Rebuilt ${result.count} days of scores.` }
        : { tone: 'error', message: result.message }
    );
  };

  const syncUrl = functionsBaseUrl ? `${functionsBaseUrl}/health-sync` : '';

  return (
    <div className="space-y-4">
      {/* -------- Profile -------- */}
      <Card>
        <CardHeader title="Profile" subtitle={user?.email} icon={User} />
        <CardBody>
          <EditGate className="mb-3" />
          <form onSubmit={saveProfile} className="space-y-3">
            <Field label="Name">
              <Input value={form.name} onChange={set('name')} placeholder="Your name" />
            </Field>

            <div className="grid grid-cols-3 gap-2">
              <Field label="Age">
                <Input type="number" min="10" max="120" value={form.age} onChange={set('age')} />
              </Field>
              <Field label="Weight">
                <Input
                  type="number"
                  step="0.1"
                  min="20"
                  max="400"
                  value={form.weight}
                  onChange={set('weight')}
                  unit="kg"
                />
              </Field>
              <Field label="Height">
                <Input
                  type="number"
                  min="80"
                  max="250"
                  value={form.height}
                  onChange={set('height')}
                  unit="cm"
                />
              </Field>
            </div>

            <Field label="Sex" hint="only used for VO₂ max reference ranges">
              <Select value={form.sex} onChange={set('sex')}>
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </Select>
            </Field>

            <Field label="Primary goal">
              <Select value={form.fitness_goal} onChange={set('fitness_goal')}>
                {GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Daily active calorie target"
              hint="changing this rebuilds every score"
            >
              <Input
                type="number"
                min="100"
                max="3000"
                step="25"
                value={form.calorie_target}
                onChange={set('calorie_target')}
                unit="kcal"
              />
            </Field>

            {targetIsOff ? (
              <Alert tone="warning">
                Based on your {health.length} logged days, <strong>{suggestedTarget} kcal</strong>{' '}
                suits you better. A target near your average burn pegs exertion at 100 on half your
                days, which costs you readiness for no reason.
                <button
                  type="button"
                  className="mt-1 block font-semibold underline"
                  onClick={() => setForm((f) => ({ ...f, calorie_target: suggestedTarget }))}
                >
                  Use {suggestedTarget} kcal
                </button>
              </Alert>
            ) : null}

            {status.message ? <Alert tone={status.tone}>{status.message}</Alert> : null}

            <Button type="submit" loading={busy || saving} icon={Save} className="w-full" disabled={!canEdit}>
              Save profile
            </Button>
          </form>
        </CardBody>
      </Card>

      {/* -------- Appearance -------- */}
      <Card delay={40}>
        <CardHeader title="Appearance" icon={theme === 'dark' ? Moon : Sun} />
        <CardBody>
          <Segmented
            className="w-full"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </CardBody>
      </Card>

      {/* -------- Sync status -------- */}
      <Card delay={60}>
        <CardHeader
          title="Sync status"
          subtitle="Whether your data is actually arriving"
          icon={RefreshCw}
        />
        <CardBody>
          <SyncPanel />
        </CardBody>
      </Card>

      {/* -------- Apple Watch sync -------- */}
      <Card delay={80}>
        <CardHeader
          title="Apple Watch sync"
          subtitle="Push HealthKit data into VitalSync"
          icon={Watch}
        />
        <CardBody className="space-y-3">
          <Alert tone="info">
            iOS does not let a web app read Apple Health directly. Either import an export by hand,
            or have the <strong>Health Auto Export</strong> app or a free <strong>iOS Shortcut</strong>{' '}
            POST to the endpoint below on a schedule.
          </Alert>

          <div
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
          >
            <p className="text-xs font-semibold">Already have a JSON export?</p>
            <p className="muted mt-0.5 text-[11px] leading-relaxed">
              Import it directly — no token or endpoint needed. Best for backfilling history in one
              go.
            </p>
            <Button
              size="sm"
              icon={Upload}
              className="mt-2 w-full"
              onClick={() => setImportOpen(true)}
            >
              Import health JSON
            </Button>
          </div>

          <p className="muted pt-1 text-[11px] font-semibold uppercase tracking-wide">
            Automatic sync
          </p>

          {syncUrl ? <CopyRow label="Endpoint URL" value={syncUrl} /> : null}

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="muted text-[10px] uppercase tracking-wide">Sync key</p>
              {syncKeys.length ? <Badge color="#22c55e">{syncKeys.length} active</Badge> : null}
            </div>

            {newKey ? (
              <>
                <CopyRow label="Copy it now — shown once" value={newKey} />
                <Alert tone="warning" className="mt-2">
                  This is the only time the key is shown. It&apos;s stored hashed, so it cannot be
                  retrieved later — copy it into Health Auto Export now.
                </Alert>
              </>
            ) : (
              <p className="muted text-[11px] leading-relaxed">
                A permanent key for unattended sync. Unlike a session token it never expires, so
                your 7am automation keeps working.
              </p>
            )}

            {syncKeys.length ? (
              <ul className="mt-2 space-y-1">
                {syncKeys.map((k) => (
                  <li
                    key={k.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span className="min-w-0">
                      <code className="text-[11px]">{k.key_prefix}…</code>
                      <span className="muted ml-2 text-[10px]">
                        {k.last_used_at ? `used ${relativeDay(k.last_used_at.slice(0, 10))}` : 'never used'}
                      </span>
                    </span>
                    <button
                      onClick={() => revokeKey(k.id)}
                      className="muted shrink-0 rounded p-1 hover:text-score-poor"
                      aria-label="Revoke key"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <Button
              size="sm"
              variant="secondary"
              icon={KeyRound}
              className="mt-2 w-full"
              loading={keyBusy}
              onClick={createSyncKey}
            >
              {syncKeys.length ? 'Create another key' : 'Create sync key'}
            </Button>
          </div>

          <details className="text-[11px]">
            <summary className="muted cursor-pointer">Use the anon key instead</summary>
            <div className="mt-2">
              <CopyRow label="Anon key" value={anonKey} secret />
              <p className="muted mt-1.5">
                Sent as <code>Authorization: Bearer &lt;key&gt;</code>. It never expires, but it is
                also the key compiled into this page, so a sync key you can revoke on its own is
                still the better choice for an automation.
              </p>
            </div>
          </details>

          <div
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
          >
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
              <Smartphone size={13} className="text-accent" aria-hidden="true" />
              Expected JSON body
            </p>
            <pre className="overflow-x-auto text-[10px] leading-relaxed">
              {`{
  "date": "${todayKey()}",
  "hrv": 62.4,
  "resting_hr": 51,
  "spo2": 97,
  "body_temp": 36.6,
  "active_calories": 540,
  "steps": 9231,
  "sleep_hours": 7.4,
  "sleep_quality": 4
}`}
            </pre>
          </div>
        </CardBody>
      </Card>

      {/* -------- Data -------- */}
      <Card delay={120}>
        <CardHeader
          title="Your data"
          subtitle={`${health.length} health · ${sleep.length} sleep · ${workouts.length} workouts · ${journal.length} journal`}
          icon={Download}
        />
        <CardBody className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={Download} onClick={exportJson}>
              Export JSON
            </Button>
            <Button variant="secondary" icon={Download} onClick={exportCsv}>
              Export CSV
            </Button>
          </div>
          <ScoringStatus />
          <Button variant="secondary" icon={RefreshCw} className="w-full" onClick={rebuild} loading={saving}>
            Rebuild all scores
          </Button>
          <Button
            variant="ghost"
            icon={RefreshCw}
            className="w-full"
            onClick={() => loadAll(user.id)}
          >
            Refresh from Supabase
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Who can see this" subtitle="Public to read, yours to change" icon={Globe} />
        <CardBody className="space-y-3">
          <p className="muted text-xs leading-relaxed">
            Anyone who opens this address can read your health history — that is deliberate, and why
            there is no login screen. Nobody can change or delete any of it without signing in as
            you. Keep an export somewhere safe anyway: the free Supabase plan has no backups.
          </p>
          {canEdit ? (
            <>
              <p className="muted text-[11px]">
                Signed in as <span className="font-semibold">{user?.email}</span>.
              </p>
              <Button variant="secondary" className="w-full" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <Link to="/signin" className="block">
              <Button className="w-full">Sign in to edit</Button>
            </Link>
          )}
        </CardBody>
      </Card>

      <div className="pb-4 text-center">
        <p className="muted text-[10px]">
          VitalSync · build {typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'}
        </p>
        <button
          onClick={forceUpdate}
          className="muted mt-1 text-[10px] underline hover:text-accent"
        >
          Force update
        </button>
        <p className="muted mt-2 text-[10px]">
          Scores are informational and not medical advice.
        </p>
      </div>

      <ImportHealthModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
