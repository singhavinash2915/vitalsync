/**
 * Parser for Apple Health exports.
 *
 * Accepts every JSON shape people actually end up with, because "export my
 * Health data" produces something different in every app:
 *
 *  1. Health Auto Export — the metrics envelope
 *     { "data": { "metrics": [ { "name": "heart_rate_variability",
 *                                "units": "ms",
 *                                "data": [ { "date": "...", "qty": 62.4 } ] } ] } }
 *
 *  2. A single flat day (what an iOS Shortcut is easiest to build)
 *     { "date": "2026-07-28", "hrv": 62.4, "resting_hr": 51, ... }
 *
 *  3. An array of flat days — the usual result of looping a Shortcut over a
 *     date range, or of hand-assembling a backfill
 *     [ { "date": "2026-07-27", ... }, { "date": "2026-07-28", ... } ]
 *
 *  4. Anything wrapping one of the above in a `data` / `metrics` / `samples`
 *     key, which several exporters do.
 *
 * Deliberately permissive about field names and strict about values: a metric
 * it cannot place is reported rather than guessed at, and a physiologically
 * impossible number is dropped rather than stored, because a single bad row
 * poisons a 7-day rolling baseline for a week.
 */

/** Every accepted spelling → our column name. */
export const METRIC_ALIASES = {
  // --- HRV ---
  hrv: 'hrv',
  heart_rate_variability: 'hrv',
  heart_rate_variability_sdnn: 'hrv',
  hrv_sdnn: 'hrv',
  sdnn: 'hrv',

  // --- Resting heart rate ---
  resting_hr: 'resting_hr',
  resting_heart_rate: 'resting_hr',
  restingheartrate: 'resting_hr',
  rhr: 'resting_hr',

  // --- Blood oxygen ---
  spo2: 'spo2',
  blood_oxygen_saturation: 'spo2',
  oxygen_saturation: 'spo2',

  // --- Temperature ---
  body_temp: 'body_temp',
  body_temperature: 'body_temp',
  apple_sleeping_wrist_temperature: 'body_temp',
  sleeping_wrist_temperature: 'body_temp',
  wrist_temperature: 'body_temp',

  // --- Energy ---
  active_calories: 'active_calories',
  active_energy: 'active_calories',
  active_energy_burned: 'active_calories',

  // --- Steps ---
  steps: 'steps',
  step_count: 'steps',

  // --- Sleep ---
  sleep_hours: 'sleep_hours',
  sleep_analysis: 'sleep_hours',
  sleep_duration: 'sleep_hours',
  asleep: 'sleep_hours',
  total_sleep: 'sleep_hours',
  time_asleep: 'sleep_hours',
  sleep_quality: 'sleep_quality',
};

/** column → [min, max]. Outside this, the value is dropped. */
export const RANGES = {
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
const SLEEP_COLUMNS = new Set(['sleep_hours', 'sleep_quality']);

/**
 * Unit normalisation — the single most important step in this file.
 *
 * Health Auto Export reports energy in **kilojoules** when the phone's locale
 * uses kJ, and the numbers look plausible either way: 2708 kJ and 2708 kcal
 * both pass a range check. Storing kJ as kcal would overstate active calories
 * by 4.2×, which pegs the exertion score at 100 every single day and quietly
 * ruins readiness. So conversion is driven by the declared `units` string, and
 * only falls back to magnitude when there isn't one.
 */
const KJ_PER_KCAL = 4.184;

export function convertUnits(column, value, units) {
  if (!Number.isFinite(value)) return value;
  const unit = String(units ?? '').trim().toLowerCase();

  if (column === 'active_calories') {
    if (unit === 'kj' || unit === 'kilojoules') return value / KJ_PER_KCAL;
    if (unit === 'j' || unit === 'joules') return value / (KJ_PER_KCAL * 1000);
    if (unit === 'cal') return value / 1000; // small calories
    return value; // kcal, Cal, or unlabelled
  }

  if (column === 'body_temp') {
    // Anything above 45 can't be Celsius; treat as Fahrenheit.
    if (unit.includes('f') || value > 45) return ((value - 32) * 5) / 9;
    return value;
  }

  return value;
}

export const HEALTH_COLUMNS = ['hrv', 'resting_hr', 'spo2', 'body_temp', 'active_calories', 'steps'];

const normaliseKey = (key) =>
  String(key)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

/** Accepts "2026-07-28", "2026-07-28 07:00:00 +0530" and full ISO strings. */
export function toDateKey(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : localKey(value);
  if (typeof value === 'number') return localKey(new Date(value));
  if (typeof value !== 'string' || !value) return null;

  const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : localKey(parsed);
}

const localKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Clamps into range; returns null when unusable. */
export function coerce(column, raw) {
  const value = typeof raw === 'string' ? Number(raw.replace(/,/g, '')) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  const range = RANGES[column];
  if (range && (value < range[0] || value > range[1])) return null;

  return INTEGER_COLUMNS.has(column) ? Math.round(value) : Math.round(value * 100) / 100;
}

/**
 * Sleep is the one metric whose units vary wildly between exporters: hours,
 * minutes, or seconds, all under the same key. Disambiguate by magnitude —
 * nobody sleeps 480 hours, and nobody sleeps 0.3 hours in a night worth
 * recording.
 */
function normaliseSleep(value, units) {
  if (!Number.isFinite(value)) return null;
  const unit = String(units ?? '').toLowerCase();

  if (unit.startsWith('min')) return value / 60;
  if (unit.startsWith('s') && !unit.startsWith('sl')) return value / 3600;
  if (unit.startsWith('h')) return value;

  // No usable unit string — infer from magnitude.
  if (value > 1000) return value / 3600; // seconds
  if (value > 24) return value / 60; // minutes
  return value; // already hours
}

// ---------------------------------------------------------------------------
// Shape detection
// ---------------------------------------------------------------------------

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Digs through common wrapper keys to find the meaningful payload. */
function unwrap(input) {
  let node = input;
  for (let depth = 0; depth < 4; depth++) {
    if (!isPlainObject(node)) break;
    if (Array.isArray(node.metrics) || Array.isArray(node.workouts)) return node;

    const next = node.data ?? node.samples ?? node.results ?? node.healthData;
    if (next === undefined) break;
    node = next;
  }
  return node;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/** Health Auto Export's `metrics[]` envelope. */
function parseMetricsEnvelope(node, acc) {
  for (const metric of node.metrics ?? []) {
    const rawName = String(metric?.name ?? '');
    const column = METRIC_ALIASES[normaliseKey(rawName)];

    if (!column) {
      if (rawName) acc.unrecognised.add(rawName);
      continue;
    }

    const units = metric?.units;

    for (const point of metric?.data ?? []) {
      const date = toDateKey(point?.date ?? point?.startDate ?? point?.dateTime);
      if (!date) continue;

      let raw =
        point?.qty ??
        point?.Avg ??
        point?.avg ??
        point?.average ??
        point?.value ??
        point?.total;

      if (column === 'sleep_hours' && raw === undefined) {
        raw = point?.asleep ?? point?.totalSleep ?? point?.total_sleep ?? point?.inBed;
      }

      let value = typeof raw === 'string' ? Number(raw) : raw;
      value = column === 'sleep_hours' ? normaliseSleep(value, units) : convertUnits(column, value, units);

      const clean = coerce(column, value);
      if (clean === null) {
        if (raw !== undefined && raw !== null) acc.dropped++;
        continue;
      }

      addValue(acc, date, column, clean);
    }
  }
}

/** A flat `{ date, hrv, resting_hr, ... }` object. */
function parseFlatDay(row, acc) {
  const date = toDateKey(row?.date ?? row?.day ?? row?.startDate) ?? toDateKey(new Date());
  let matched = 0;

  for (const [key, raw] of Object.entries(row ?? {})) {
    const normalised = normaliseKey(key);
    if (normalised === 'date' || normalised === 'day') continue;

    const column = METRIC_ALIASES[normalised];
    if (!column) {
      if (raw !== null && raw !== undefined && typeof raw !== 'object') acc.unrecognised.add(key);
      continue;
    }

    let value = raw;
    if (column === 'sleep_hours') value = normaliseSleep(Number(raw), row.sleep_units ?? row.units);

    const clean = coerce(column, value);
    if (clean === null) {
      if (raw !== null && raw !== undefined) acc.dropped++;
      continue;
    }

    addValue(acc, date, column, clean);
    matched++;
  }

  return matched;
}

/**
 * Apple's workout names → our workout types. Matched by substring against the
 * lowercased name, most specific first, so "Indoor Cycling" beats "Cycling"
 * only where it matters and everything else still lands somewhere sensible.
 */
const WORKOUT_TYPES = [
  [/hiit|high intensity|interval/, 'hiit'],
  [/strength|weight|functional training/, 'strength'],
  [/swim/, 'swim'],
  [/cycl|bik/, 'cycle'],
  [/run|jog/, 'run'],
  [/walk|hik/, 'walk'],
  [/yoga|pilates|flexib|mind|cooldown|barre|stretch/, 'yoga'],
  [/cricket|soccer|football|basketball|tennis|badminton|squash|golf|volleyball|hockey/, 'sport'],
];

export function mapWorkoutType(name) {
  const lower = String(name ?? '').toLowerCase();
  for (const [pattern, type] of WORKOUT_TYPES) {
    if (pattern.test(lower)) return type;
  }
  return 'other';
}

/**
 * Apple reports workout `intensity` in kcal/hr·kg, which is numerically a MET
 * value — 1 MET is resting metabolism. Mapping METs straight onto our 1-10
 * intensity scale lines up well: a 4 MET walk reads 4/10, a 7 MET jog 7/10,
 * and anything above 10 METs is genuinely maximal.
 */
function metsToIntensity(mets) {
  if (!Number.isFinite(mets) || mets <= 0) return 5;
  return Math.min(10, Math.max(1, Math.round(mets)));
}

/** Extracts `{ qty, units }` pairs, tolerating a bare number. */
const qty = (node) =>
  node && typeof node === 'object' ? Number(node.qty) : Number(node);
const unitsOf = (node) => (node && typeof node === 'object' ? node.units : undefined);

/**
 * Parses Health Auto Export's `data.workouts[]`.
 *
 * Duration arrives in seconds, energy usually in kJ. Each entry also carries
 * minute-by-minute arrays (heart rate, step count, GPS) that we deliberately
 * ignore — VitalSync scores whole days, so a per-second series is noise.
 */
function parseWorkouts(list, acc) {
  const workouts = [];

  for (const w of list ?? []) {
    const date = toDateKey(w?.start ?? w?.date ?? w?.end);
    if (!date) continue;

    const seconds = Number(w?.duration);
    const minutes = Number.isFinite(seconds) ? Math.round(seconds / 60) : null;
    // Apple logs stray 10-second "workouts" when a session is started by
    // accident; they are noise rather than training.
    if (!minutes || minutes < 1 || minutes > 1440) continue;

    const energyNode = w?.activeEnergyBurned ?? w?.totalEnergy;
    const kcal = convertUnits('active_calories', qty(energyNode), unitsOf(energyNode));

    workouts.push({
      date,
      type: mapWorkoutType(w?.name),
      duration_mins: minutes,
      intensity: metsToIntensity(qty(w?.intensity)),
      calories_burned: Number.isFinite(kcal) ? Math.round(kcal) : null,
      notes: [
        w?.name,
        Number.isFinite(qty(w?.avgHeartRate)) ? `avg HR ${Math.round(qty(w.avgHeartRate))}` : null,
        Number.isFinite(qty(w?.distance)) && qty(w.distance) > 0
          ? `${qty(w.distance).toFixed(2)} ${unitsOf(w.distance) ?? 'km'}`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
      // Apple's own UUID, so re-importing the same file updates rather than
      // duplicating the session.
      external_id: w?.id ?? null,
    });
  }

  acc.workouts = workouts;
}

/** Several samples can land on one day — average rather than last-wins. */
function addValue(acc, date, column, value) {
  const bucket = acc.byDate.get(date) ?? {};
  const counts = acc.counts.get(date) ?? {};

  if (bucket[column] === undefined) {
    bucket[column] = value;
    counts[column] = 1;
  } else {
    const n = counts[column] + 1;
    bucket[column] = Math.round(((bucket[column] * counts[column] + value) / n) * 100) / 100;
    counts[column] = n;
  }

  acc.byDate.set(date, bucket);
  acc.counts.set(date, counts);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @param {string|object} input  raw JSON text, or an already-parsed object
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   format: string,
 *   days: Array<{date: string, health: object|null, sleep: object|null}>,
 *   metrics: string[],
 *   dateRange: [string, string]|null,
 *   dropped: number,
 *   unrecognised: string[],
 * }}
 */
export function parseHealthExport(input) {
  const empty = {
    ok: false,
    format: 'unknown',
    days: [],
    workouts: [],
    metrics: [],
    dateRange: null,
    dropped: 0,
    unrecognised: [],
  };

  let parsed = input;
  if (typeof input === 'string') {
    const text = input.trim();
    if (!text) return { ...empty, error: 'Nothing pasted yet.' };

    // Apple's own "Export All Health Data" produces XML, not JSON, and it is
    // usually hundreds of megabytes — worth saying so explicitly rather than
    // failing with a JSON syntax error.
    if (text.startsWith('<?xml') || text.startsWith('<HealthData')) {
      return {
        ...empty,
        error:
          'This is Apple Health’s XML export, not JSON. VitalSync reads JSON — use the Health Auto Export app or an iOS Shortcut, which both produce JSON directly.',
      };
    }

    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ...empty, error: `That isn’t valid JSON — ${e.message}` };
    }
  }

  if (!isPlainObject(parsed) && !Array.isArray(parsed)) {
    return { ...empty, error: 'Expected a JSON object or array.' };
  }

  const acc = {
    byDate: new Map(),
    counts: new Map(),
    dropped: 0,
    unrecognised: new Set(),
    workouts: [],
  };
  const node = unwrap(parsed);
  let format = 'unknown';

  if (isPlainObject(node) && (Array.isArray(node.metrics) || Array.isArray(node.workouts))) {
    format = 'Health Auto Export';
    if (Array.isArray(node.metrics)) parseMetricsEnvelope(node, acc);
    if (Array.isArray(node.workouts)) parseWorkouts(node.workouts, acc);
  } else if (Array.isArray(node)) {
    format = 'array of daily records';
    node.forEach((row) => isPlainObject(row) && parseFlatDay(row, acc));
  } else if (isPlainObject(node)) {
    format = 'single day';
    parseFlatDay(node, acc);
  }

  const days = [...acc.byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, values]) => {
      const health = {};
      const sleep = {};

      for (const [column, value] of Object.entries(values)) {
        if (SLEEP_COLUMNS.has(column)) {
          sleep[column === 'sleep_hours' ? 'duration_hours' : 'quality_rating'] = value;
        } else {
          health[column] = value;
        }
      }

      return {
        date,
        health: Object.keys(health).length ? health : null,
        sleep: Object.keys(sleep).length ? sleep : null,
      };
    });

  const metrics = [
    ...new Set(days.flatMap((d) => [...Object.keys(d.health ?? {}), ...Object.keys(d.sleep ?? {})])),
  ];

  if (!days.length && !acc.workouts.length) {
    return {
      ...empty,
      format,
      dropped: acc.dropped,
      unrecognised: [...acc.unrecognised].slice(0, 25),
      error:
        acc.unrecognised.size > 0
          ? 'None of the fields in that file matched a metric VitalSync tracks.'
          : 'No dated measurements found in that file.',
    };
  }

  // A file can carry workouts on days with no daily metrics; the date range
  // should still cover them.
  const allDates = [...days.map((d) => d.date), ...acc.workouts.map((w) => w.date)].sort();

  return {
    ok: true,
    format,
    days,
    workouts: acc.workouts,
    metrics,
    dateRange: allDates.length ? [allDates[0], allDates[allDates.length - 1]] : null,
    dropped: acc.dropped,
    unrecognised: [...acc.unrecognised].slice(0, 25),
  };
}

/** Human-readable column names for the preview table. */
export const COLUMN_LABELS = {
  hrv: 'HRV',
  resting_hr: 'Resting HR',
  spo2: 'SpO₂',
  body_temp: 'Body temp',
  active_calories: 'Active calories',
  steps: 'Steps',
  duration_hours: 'Sleep duration',
  quality_rating: 'Sleep quality',
};
