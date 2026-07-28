/**
 * POST /functions/v1/health-sync
 *
 * Ingests Apple Watch / HealthKit data pushed from an iPhone.
 *
 * Two body shapes are accepted:
 *
 *  1. Flat — what an iOS Shortcut is easiest to build against:
 *     { "date": "2026-07-28", "hrv": 62.4, "resting_hr": 51, "steps": 9231,
 *       "active_calories": 540, "spo2": 97, "body_temp": 36.6,
 *       "sleep_hours": 7.4, "sleep_quality": 4 }
 *
 *  2. Health Auto Export — its native "metrics" envelope:
 *     { "data": { "metrics": [ { "name": "heart_rate_variability",
 *                                "units": "ms",
 *                                "data": [ { "date": "...", "qty": 62.4 } ] } ] } }
 *
 * Authentication: send the user's Supabase access token as
 *   Authorization: Bearer <token>
 * The row is written for whoever that token belongs to — the function never
 * accepts a user_id from the body, so a leaked token cannot write to another
 * account.
 *
 * Deploy:  supabase functions deploy health-sync
 * Logs:    supabase functions logs health-sync
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

/** Maps the many names Apple/HAE use for a metric onto our columns. */
const METRIC_ALIASES: Record<string, string> = {
  // HRV
  hrv: 'hrv',
  heart_rate_variability: 'hrv',
  heart_rate_variability_sdnn: 'hrv',
  hrv_sdnn: 'hrv',
  // Resting heart rate
  resting_hr: 'resting_hr',
  resting_heart_rate: 'resting_hr',
  restingheartrate: 'resting_hr',
  // Blood oxygen
  spo2: 'spo2',
  blood_oxygen_saturation: 'spo2',
  oxygen_saturation: 'spo2',
  // Temperature
  body_temp: 'body_temp',
  body_temperature: 'body_temp',
  apple_sleeping_wrist_temperature: 'body_temp',
  wrist_temperature: 'body_temp',
  // Energy
  active_calories: 'active_calories',
  active_energy: 'active_calories',
  active_energy_burned: 'active_calories',
  // Steps
  steps: 'steps',
  step_count: 'steps',
  // Sleep
  sleep_hours: 'sleep_hours',
  sleep_analysis: 'sleep_hours',
  asleep: 'sleep_hours',
  total_sleep: 'sleep_hours',
  sleep_quality: 'sleep_quality',
};

/** Column → [min, max]. Anything outside is dropped rather than stored. */
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

const normaliseKey = (key: string) =>
  key.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');

const toDateKey = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value) return null;
  // Accepts "2026-07-28", "2026-07-28 07:00:00 +0530" and full ISO strings.
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

/** Clamps a value into its allowed range, returning null when unusable. */
function coerce(column: string, raw: unknown): number | null {
  const value = typeof raw === 'string' ? Number(raw) : (raw as number);
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  const range = RANGES[column];
  if (range && (value < range[0] || value > range[1])) return null;

  return INTEGER_COLUMNS.has(column) ? Math.round(value) : Math.round(value * 100) / 100;
}

/** Flattens the Health Auto Export envelope into { column: value } per date. */
function parseHealthAutoExport(body: any): Map<string, Record<string, number>> {
  const byDate = new Map<string, Record<string, number>>();
  const metrics = body?.data?.metrics;
  if (!Array.isArray(metrics)) return byDate;

  for (const metric of metrics) {
    const column = METRIC_ALIASES[normaliseKey(String(metric?.name ?? ''))];
    if (!column) continue;

    for (const point of metric?.data ?? []) {
      const dateKey = toDateKey(point?.date);
      if (!dateKey) continue;

      // HAE reports sleep in hours under different keys depending on version.
      let raw = point?.qty ?? point?.Avg ?? point?.avg ?? point?.value;
      if (column === 'sleep_hours' && raw === undefined) {
        raw = point?.asleep ?? point?.totalSleep ?? point?.inBed;
      }

      const value = coerce(column, raw);
      if (value === null) continue;

      const bucket = byDate.get(dateKey) ?? {};
      // Several samples can land on one day — average them rather than
      // letting the last one win.
      bucket[column] =
        bucket[column] === undefined ? value : Math.round(((bucket[column] + value) / 2) * 100) / 100;
      byDate.set(dateKey, bucket);
    }
  }

  return byDate;
}

/** Reads the flat Shortcut-friendly shape. */
function parseFlat(body: any): Map<string, Record<string, number>> {
  const byDate = new Map<string, Record<string, number>>();
  const dateKey = toDateKey(body?.date) ?? new Date().toISOString().slice(0, 10);
  const bucket: Record<string, number> = {};

  for (const [key, raw] of Object.entries(body ?? {})) {
    const column = METRIC_ALIASES[normaliseKey(key)];
    if (!column) continue;
    const value = coerce(column, raw);
    if (value !== null) bucket[column] = value;
  }

  if (Object.keys(bucket).length) byDate.set(dateKey, bucket);
  return byDate;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed. Use POST.' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization: Bearer <access_token> header.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return json({ error: 'Function is missing SUPABASE_URL / SUPABASE_ANON_KEY.' }, 500);
  }

  // Forwarding the caller's JWT means every write runs as that user and RLS
  // still applies — the function has no elevated privileges.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return json({ error: 'Invalid or expired token.', detail: authError?.message }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be valid JSON.' }, 400);
  }

  const parsed = (body as any)?.data?.metrics ? parseHealthAutoExport(body) : parseFlat(body);

  if (!parsed.size) {
    return json(
      {
        error: 'No recognised metrics found.',
        hint: 'Send { "date": "YYYY-MM-DD", "hrv": 60, "resting_hr": 52, ... } or a Health Auto Export payload.',
        recognised: [...new Set(Object.values(METRIC_ALIASES))],
      },
      422
    );
  }

  const healthRows: Record<string, unknown>[] = [];
  const sleepRows: Record<string, unknown>[] = [];

  for (const [date, values] of parsed) {
    const { sleep_hours, sleep_quality, ...health } = values;

    if (Object.keys(health).length) {
      healthRows.push({ user_id: user.id, date, source: 'health-sync', ...health });
    }
    if (sleep_hours !== undefined || sleep_quality !== undefined) {
      sleepRows.push({
        user_id: user.id,
        date,
        source: 'health-sync',
        ...(sleep_hours !== undefined ? { duration_hours: sleep_hours } : {}),
        ...(sleep_quality !== undefined ? { quality_rating: sleep_quality } : {}),
      });
    }
  }

  const results: Record<string, unknown> = { dates: [...parsed.keys()] };

  if (healthRows.length) {
    const { error } = await supabase
      .from('health_logs')
      .upsert(healthRows, { onConflict: 'user_id,date' });
    if (error) return json({ error: 'Failed to write health_logs.', detail: error.message }, 500);
    results.health_logs = healthRows.length;
  }

  if (sleepRows.length) {
    const { error } = await supabase
      .from('sleep_logs')
      .upsert(sleepRows, { onConflict: 'user_id,date' });
    if (error) return json({ error: 'Failed to write sleep_logs.', detail: error.message }, 500);
    results.sleep_logs = sleepRows.length;
  }

  // Scores are intentionally NOT computed here. Recovery depends on a 7-day
  // rolling baseline that the app already has in memory, and it recalculates
  // on next open — keeping one implementation of the algorithm, in JS.
  return json({ ok: true, user: user.id, ...results });
});
