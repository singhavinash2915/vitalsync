/**
 * POST /functions/v1/health-sync
 *
 * Ingests Apple Watch / HealthKit data pushed from an iPhone.
 *
 * ── Authentication ──────────────────────────────────────────────────────────
 * Two options, in order of preference for automation:
 *
 *   1. Sync key (recommended, never expires):
 *        X-Sync-Key: vsk_xxxxxxxxxxxx
 *      Mint one in the app under Settings → Apple Watch sync. Stored hashed;
 *      revoke by deleting it in the app.
 *
 *   2. Supabase access token (expires in ~1 hour — fine for a manual test):
 *        Authorization: Bearer <access_token>
 *
 * Either way the row is written for whoever the credential belongs to. A
 * user_id in the body is ignored, so a leaked key cannot write to another
 * account.
 *
 * ── Body ────────────────────────────────────────────────────────────────────
 * Accepts Health Auto Export's native envelope:
 *   { "data": { "metrics": [...], "workouts": [...] } }
 * or a flat shape an iOS Shortcut can build by hand:
 *   { "date": "2026-07-28", "hrv": 62.4, "resting_hr": 51, ... }
 *
 * ── Admin ───────────────────────────────────────────────────────────────────
 *   POST ?action=create-key   (Bearer token required) → mints a new sync key
 *
 * Deploy:  supabase functions deploy health-sync
 * Logs:    supabase functions logs health-sync
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-sync-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

// ---------------------------------------------------------------------------
// Metric normalisation — mirrors src/lib/healthImport.js
// ---------------------------------------------------------------------------

const METRIC_ALIASES: Record<string, string> = {
  hrv: 'hrv',
  heart_rate_variability: 'hrv',
  heart_rate_variability_sdnn: 'hrv',
  hrv_sdnn: 'hrv',
  sdnn: 'hrv',

  resting_hr: 'resting_hr',
  resting_heart_rate: 'resting_hr',
  restingheartrate: 'resting_hr',
  rhr: 'resting_hr',

  spo2: 'spo2',
  blood_oxygen_saturation: 'spo2',
  oxygen_saturation: 'spo2',

  body_temp: 'body_temp',
  body_temperature: 'body_temp',
  apple_sleeping_wrist_temperature: 'body_temp',
  sleeping_wrist_temperature: 'body_temp',
  wrist_temperature: 'body_temp',

  active_calories: 'active_calories',
  active_energy: 'active_calories',
  active_energy_burned: 'active_calories',

  steps: 'steps',
  step_count: 'steps',

  sleep_hours: 'sleep_hours',
  sleep_analysis: 'sleep_hours',
  sleep_duration: 'sleep_hours',
  asleep: 'sleep_hours',
  total_sleep: 'sleep_hours',
  time_asleep: 'sleep_hours',
  sleep_quality: 'sleep_quality',
};

const RANGES: Record<string, [number, number]> = {
  hrv: [1, 400],
  resting_hr: [25, 150],
  spo2: [50, 100],
  body_temp: [30, 45],
  active_calories: [0, 20000],
  steps: [0, 200000],
  sleep_hours: [0, 24],
  sleep_quality: [1, 5],
};

const INTEGER_COLUMNS = new Set(['resting_hr', 'active_calories', 'steps', 'sleep_quality']);
const KJ_PER_KCAL = 4.184;

const normaliseKey = (key: string) =>
  key.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');

const toDateKey = (value: unknown): string | null => {
  if (typeof value === 'number') return new Date(value).toISOString().slice(0, 10);
  if (typeof value !== 'string' || !value) return null;
  const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

/**
 * Health Auto Export reports energy in kilojoules when the phone's locale uses
 * kJ. 2708 kJ and 2708 kcal both look plausible to a range check, but storing
 * the former as the latter overstates active calories by 4.2× and pegs the
 * exertion score at 100 every day. Convert from the declared units.
 */
function convertUnits(column: string, value: number, units?: string): number {
  if (!Number.isFinite(value)) return value;
  const unit = String(units ?? '').trim().toLowerCase();

  if (column === 'active_calories') {
    if (unit === 'kj' || unit === 'kilojoules') return value / KJ_PER_KCAL;
    if (unit === 'j' || unit === 'joules') return value / (KJ_PER_KCAL * 1000);
    if (unit === 'cal') return value / 1000;
    return value;
  }
  if (column === 'body_temp') {
    if (unit.includes('f') || value > 45) return ((value - 32) * 5) / 9;
    return value;
  }
  return value;
}

/**
 * Hours slept from a `sleep_analysis` sample. Mirrors extractSleepHours in
 * src/lib/healthImport.js.
 *
 * `asleep` is a legacy bucket for unclassified sleep and reads 0 on exactly
 * the nights the watch DID stage properly (core/deep/rem carry the time
 * instead), so it must never be consulted before `totalSleep`. Zero counts as
 * absent, not as "slept nothing".
 */
function extractSleepHours(point: any): number | null {
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const stageTotal = ['core', 'deep', 'rem']
    .map((k) => Number(point?.[k]))
    .filter((n) => Number.isFinite(n) && n > 0)
    .reduce((sum, n) => sum + n, 0);

  return (
    num(point?.totalSleep) ??
    num(point?.total_sleep) ??
    num(stageTotal) ??
    num(point?.asleep) ??
    num(point?.qty) ??
    num(point?.value) ??
    num(point?.inBed) ??
    null
  );
}

function normaliseSleep(value: number, units?: string): number | null {
  if (!Number.isFinite(value)) return null;
  const unit = String(units ?? '').toLowerCase();
  if (unit.startsWith('min')) return value / 60;
  if (unit.startsWith('s') && !unit.startsWith('sl')) return value / 3600;
  if (unit.startsWith('h')) return value;
  if (value > 1000) return value / 3600;
  if (value > 24) return value / 60;
  return value;
}

function coerce(column: string, raw: unknown): number | null {
  const value = typeof raw === 'string' ? Number(raw) : (raw as number);
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const range = RANGES[column];
  if (range && (value < range[0] || value > range[1])) return null;
  return INTEGER_COLUMNS.has(column) ? Math.round(value) : Math.round(value * 100) / 100;
}

// --- workouts ---------------------------------------------------------------

const WORKOUT_TYPES: Array<[RegExp, string]> = [
  [/hiit|high intensity|interval/, 'hiit'],
  [/strength|weight|functional training/, 'strength'],
  [/swim/, 'swim'],
  [/cycl|bik/, 'cycle'],
  [/run|jog/, 'run'],
  [/walk|hik/, 'walk'],
  [/yoga|pilates|flexib|mind|cooldown|barre|stretch/, 'yoga'],
  [/cricket|soccer|football|basketball|tennis|badminton|squash|golf|volleyball|hockey/, 'sport'],
];

const mapWorkoutType = (name: unknown) => {
  const lower = String(name ?? '').toLowerCase();
  for (const [pattern, type] of WORKOUT_TYPES) if (pattern.test(lower)) return type;
  return 'other';
};

const qty = (node: any) => (node && typeof node === 'object' ? Number(node.qty) : Number(node));
const unitsOf = (node: any) => (node && typeof node === 'object' ? node.units : undefined);

/** Apple's `intensity` is kcal/hr·kg, numerically a MET value. */
const metsToIntensity = (mets: number) =>
  !Number.isFinite(mets) || mets <= 0 ? 5 : Math.min(10, Math.max(1, Math.round(mets)));

function parseWorkouts(list: any[], userId: string) {
  const rows: Record<string, unknown>[] = [];
  for (const w of list ?? []) {
    const date = toDateKey(w?.start ?? w?.date ?? w?.end);
    if (!date) continue;

    const seconds = Number(w?.duration);
    const minutes = Number.isFinite(seconds) ? Math.round(seconds / 60) : null;
    if (!minutes || minutes < 1 || minutes > 1440) continue;

    const energyNode = w?.activeEnergyBurned ?? w?.totalEnergy;
    const kcal = convertUnits('active_calories', qty(energyNode), unitsOf(energyNode));

    rows.push({
      user_id: userId,
      date,
      type: mapWorkoutType(w?.name),
      duration_mins: minutes,
      intensity: metsToIntensity(qty(w?.intensity)),
      calories_burned: Number.isFinite(kcal) ? Math.round(kcal) : null,
      notes: [
        w?.name,
        Number.isFinite(qty(w?.avgHeartRate)) ? `avg HR ${Math.round(qty(w.avgHeartRate))}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      external_id: w?.id ?? null,
      source: 'health-sync',
    });
  }
  return rows.filter((r) => r.external_id); // dedupe needs a stable id
}

// --- daily metrics ----------------------------------------------------------

type Bucket = Record<string, number>;

function addValue(byDate: Map<string, Bucket>, counts: Map<string, Bucket>, date: string, column: string, value: number) {
  const bucket = byDate.get(date) ?? {};
  const count = counts.get(date) ?? {};
  if (bucket[column] === undefined) {
    bucket[column] = value;
    count[column] = 1;
  } else {
    const n = count[column] + 1;
    bucket[column] = Math.round(((bucket[column] * count[column] + value) / n) * 100) / 100;
    count[column] = n;
  }
  byDate.set(date, bucket);
  counts.set(date, count);
}

function parseMetrics(metrics: any[]) {
  const byDate = new Map<string, Bucket>();
  const counts = new Map<string, Bucket>();

  for (const metric of metrics ?? []) {
    const column = METRIC_ALIASES[normaliseKey(String(metric?.name ?? ''))];
    if (!column) continue;
    const units = metric?.units;

    for (const point of metric?.data ?? []) {
      const date = toDateKey(point?.date ?? point?.startDate);
      if (!date) continue;

      let raw = point?.qty ?? point?.Avg ?? point?.avg ?? point?.value ?? point?.total;
      // Sleep samples have no `qty` and need their own extraction — see above.
      if (column === 'sleep_hours') {
        raw = extractSleepHours(point);
        // Stages ride along on the same sample rather than arriving as their
        // own metrics, and they are what makes an objective quality score
        // possible for anyone who never rates a night by hand.
        const stages: Record<string, unknown> = {
          deep_hours: point?.deep,
          rem_hours: point?.rem,
          core_hours: point?.core ?? point?.light,
          awake_hours: point?.awake,
          in_bed_hours: point?.inBed,
        };
        for (const [key, v] of Object.entries(stages)) {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0 && n <= 24) {
            addValue(byDate, counts, date, key, Math.round(n * 100) / 100);
          }
        }
      }

      let value = typeof raw === 'string' ? Number(raw) : raw;
      value = column === 'sleep_hours' ? normaliseSleep(value, units) : convertUnits(column, value, units);

      const clean = coerce(column, value);
      if (clean !== null) addValue(byDate, counts, date, column, clean);
    }
  }
  return byDate;
}

function parseFlat(body: any) {
  const byDate = new Map<string, Bucket>();
  const date = toDateKey(body?.date) ?? new Date().toISOString().slice(0, 10);
  const bucket: Bucket = {};

  for (const [key, raw] of Object.entries(body ?? {})) {
    const column = METRIC_ALIASES[normaliseKey(key)];
    if (!column) continue;
    let value = typeof raw === 'string' ? Number(raw) : (raw as number);
    value = column === 'sleep_hours' ? (normaliseSleep(value, body?.units) as number) : convertUnits(column, value, body?.units);
    const clean = coerce(column, value);
    if (clean !== null) bucket[column] = clean;
  }

  if (Object.keys(bucket).length) byDate.set(date, bucket);
  return byDate;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const sha256 = async (text: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey) {
    return json({ error: 'Function is missing SUPABASE_URL / SUPABASE_ANON_KEY.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const syncKey = req.headers.get('X-Sync-Key') ?? '';
  const url = new URL(req.url);

  let userId: string | null = null;
  let db;

  if (syncKey) {
    // Sync-key path: look the key up with the service role, then act as that
    // user. Requires the service-role secret, which Supabase injects by default.
    if (!serviceKey) {
      return json({ error: 'Sync keys need SUPABASE_SERVICE_ROLE_KEY to be available.' }, 500);
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: keyRow, error } = await admin
      .from('sync_keys')
      .select('id, user_id')
      .eq('key_hash', await sha256(syncKey))
      .maybeSingle();

    if (error) return json({ error: 'Could not verify sync key.', detail: error.message }, 500);
    if (!keyRow) return json({ error: 'Unknown or revoked sync key.' }, 401);

    userId = keyRow.user_id;
    db = admin;

    // Fire-and-forget usage stamp; a failure here must not fail the sync.
    admin
      .from('sync_keys')
      .update({ last_used_at: new Date().toISOString(), use_count: (keyRow as any).use_count ?? 0 })
      .eq('id', keyRow.id)
      .then(() => {});
  } else if (authHeader.startsWith('Bearer ')) {
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error,
    } = await client.auth.getUser();

    if (error || !user) return json({ error: 'Invalid or expired token.', detail: error?.message }, 401);
    userId = user.id;
    db = client;
  } else {
    return json(
      {
        error: 'Missing credentials.',
        hint: 'Send X-Sync-Key: <key> (recommended) or Authorization: Bearer <access_token>.',
      },
      401
    );
  }

  // --- mint a new sync key -------------------------------------------------
  if (url.searchParams.get('action') === 'create-key') {
    if (syncKey) return json({ error: 'Create a key while signed in, not with another key.' }, 403);
    if (!serviceKey) return json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY.' }, 500);

    const raw = `vsk_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await admin.from('sync_keys').insert({
      user_id: userId,
      key_hash: await sha256(raw),
      key_prefix: raw.slice(0, 12),
      label: 'Apple Health sync',
    });

    if (error) return json({ error: 'Could not create sync key.', detail: error.message }, 500);
    // The only time the plaintext ever leaves this function.
    return json({ ok: true, key: raw });
  }

  // --- ingest --------------------------------------------------------------
  //
  // Three body shapes are accepted, because the easiest client to build is
  // rarely the one that speaks JSON. An iOS Shortcut can fill in a form body
  // through its own key/value UI without the user ever typing a brace, and a
  // bare query string works from anything that can hit a URL.
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
  let body: any = {};

  try {
    if (contentType.includes('application/json')) {
      body = await req.json();
    } else if (contentType.includes('form')) {
      // Covers both x-www-form-urlencoded and multipart/form-data.
      const form = await req.formData();
      for (const [key, value] of form.entries()) body[key] = value;
    } else {
      // No usable content type: try JSON, fall back to treating it as a form.
      const raw = (await req.text()).trim();
      if (raw.startsWith('{') || raw.startsWith('[')) {
        body = JSON.parse(raw);
      } else if (raw) {
        for (const [key, value] of new URLSearchParams(raw).entries()) body[key] = value;
      }
    }
  } catch (error) {
    return json(
      { error: 'Could not read the request body.', detail: String((error as Error)?.message ?? error) },
      400
    );
  }

  // Query parameters merge in too, so ?hrv=48&resting_hr=53 works on its own.
  for (const [key, value] of url.searchParams.entries()) {
    if (key !== 'action' && body[key] === undefined) body[key] = value;
  }

  const envelope = body?.data ?? body;
  const hasEnvelope = Array.isArray(envelope?.metrics) || Array.isArray(envelope?.workouts);

  const byDate = hasEnvelope ? parseMetrics(envelope.metrics ?? []) : parseFlat(body);
  const workoutRows = hasEnvelope ? parseWorkouts(envelope.workouts ?? [], userId!) : [];

  if (!byDate.size && !workoutRows.length) {
    return json(
      {
        error: 'No recognised metrics found.',
        hint: 'Send { "date": "YYYY-MM-DD", "hrv": 60, ... } or a Health Auto Export payload.',
        recognised: [...new Set(Object.values(METRIC_ALIASES))],
      },
      422
    );
  }

  const healthRows: Record<string, unknown>[] = [];
  const sleepRows: Record<string, unknown>[] = [];

  const SLEEP_STAGE_KEYS = ['deep_hours', 'rem_hours', 'core_hours', 'awake_hours', 'in_bed_hours'];

  for (const [date, values] of byDate) {
    const { sleep_hours, sleep_quality, ...rest } = values;
    const health: Record<string, number> = {};
    const stageValues: Record<string, number> = {};
    for (const [key, v] of Object.entries(rest)) {
      if (SLEEP_STAGE_KEYS.includes(key)) stageValues[key] = v;
      else health[key] = v;
    }
    if (Object.keys(health).length) {
      healthRows.push({ user_id: userId, date, source: 'health-sync', ...health });
    }
    if (sleep_hours !== undefined || sleep_quality !== undefined || Object.keys(stageValues).length) {
      sleepRows.push({
        user_id: userId,
        date,
        source: 'health-sync',
        ...(sleep_hours !== undefined ? { duration_hours: sleep_hours } : {}),
        ...(sleep_quality !== undefined ? { quality_rating: sleep_quality } : {}),
        ...stageValues,
      });
    }
  }

  const results: Record<string, unknown> = { dates: [...byDate.keys()].sort() };

  if (healthRows.length) {
    const { error } = await db.from('health_logs').upsert(healthRows, { onConflict: 'user_id,date' });
    if (error) return json({ error: 'Failed to write health_logs.', detail: error.message }, 500);
    results.health_logs = healthRows.length;
  }

  if (sleepRows.length) {
    const { error } = await db.from('sleep_logs').upsert(sleepRows, { onConflict: 'user_id,date' });
    if (error) return json({ error: 'Failed to write sleep_logs.', detail: error.message }, 500);
    results.sleep_logs = sleepRows.length;
  }

  if (workoutRows.length) {
    const { error } = await db
      .from('workout_logs')
      .upsert(workoutRows, { onConflict: 'user_id,external_id' });
    if (error) return json({ error: 'Failed to write workout_logs.', detail: error.message }, 500);
    results.workout_logs = workoutRows.length;
  }

  // Scores are not computed here: recovery depends on a 7-day rolling baseline
  // the app already holds in memory, and it recalculates on next open — so the
  // algorithm lives in exactly one place.
  return json({ ok: true, user: userId, ...results });
});
