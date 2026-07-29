/**
 * Streaming parser for Apple Health's own `export.xml`.
 *
 * Why this exists: Health Auto Export is a paid app, and its free tier runs
 * out. But iOS has a built-in export nobody uses because the output is
 * awkward — Health app → profile → "Export All Health Data" → a .zip whose
 * `export.xml` holds every sample the phone has ever recorded. It is free,
 * needs no third-party app, and contains strictly more than the paid export.
 *
 * The awkward part is size: a couple of years of Apple Watch data is commonly
 * 200 MB to well over 1 GB, with millions of <Record> elements. Handing that
 * to DOMParser would exhaust memory instantly.
 *
 * So this reads the file in slices and scans each slice with a regex, keeping
 * only per-day aggregates. Memory stays flat regardless of file size, and only
 * the record types VitalSync actually scores are retained — everything else is
 * skipped without allocating.
 */

const CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB slices — small enough for phones

/** HealthKit type identifier → our column, plus how to combine same-day values. */
const RECORD_TYPES = {
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { column: 'hrv', agg: 'mean' },
  HKQuantityTypeIdentifierRestingHeartRate: { column: 'resting_hr', agg: 'mean' },
  HKQuantityTypeIdentifierOxygenSaturation: { column: 'spo2', agg: 'mean' },
  HKQuantityTypeIdentifierAppleSleepingWristTemperature: { column: 'body_temp', agg: 'mean' },
  HKQuantityTypeIdentifierBodyTemperature: { column: 'body_temp', agg: 'mean' },
  // Energy and steps arrive as hundreds of small samples per day; they sum.
  HKQuantityTypeIdentifierActiveEnergyBurned: { column: 'active_calories', agg: 'sum' },
  HKQuantityTypeIdentifierStepCount: { column: 'steps', agg: 'sum' },
};

/** Sleep states that count as actually asleep. "InBed" deliberately does not. */
const ASLEEP_VALUES = new Set([
  'HKCategoryValueSleepAnalysisAsleep',
  'HKCategoryValueSleepAnalysisAsleepUnspecified',
  'HKCategoryValueSleepAnalysisAsleepCore',
  'HKCategoryValueSleepAnalysisAsleepDeep',
  'HKCategoryValueSleepAnalysisAsleepREM',
]);

const RANGES = {
  hrv: [1, 400],
  resting_hr: [25, 150],
  spo2: [50, 100],
  body_temp: [30, 45],
  active_calories: [0, 20000],
  steps: [0, 200000],
};

/** Apple writes local wall-clock time, so the first 10 chars are the local day. */
const dayOf = (value) => (typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null);

/** Minimal attribute reader — faster and safer than a full XML parse here. */
function attr(tag, name) {
  const at = tag.indexOf(` ${name}="`);
  if (at === -1) return null;
  const start = at + name.length + 3;
  const end = tag.indexOf('"', start);
  return end === -1 ? null : tag.slice(start, end);
}

function parseTimestamp(value) {
  if (!value) return NaN;
  // "2026-07-28 23:14:05 +0530" → ISO the Date constructor accepts everywhere.
  return Date.parse(value.replace(' ', 'T').replace(/ ([+-]\d{2})(\d{2})$/, '$1:$2'));
}

/**
 * Some exports report oxygen saturation as a 0-1 fraction and some as a
 * percentage, with the unit string not always present.
 */
function normalise(column, value, unit) {
  if (column === 'spo2' && value > 0 && value <= 1) return value * 100;
  if (column === 'active_calories') {
    const u = String(unit ?? '').toLowerCase();
    if (u === 'kj') return value / 4.184;
  }
  if (column === 'body_temp') {
    const u = String(unit ?? '').toLowerCase();
    if (u.includes('f') || value > 45) return ((value - 32) * 5) / 9;
  }
  return value;
}

/**
 * @param {File|Blob} file      the export.xml
 * @param {(pct:number)=>void} onProgress 0-100
 * @returns the same shape as parseHealthExport()
 */
export async function parseAppleHealthXml(file, { onProgress } = {}) {
  const totals = new Map(); // date -> { column: { sum, count } }
  const sleepByDate = new Map(); // date -> hours asleep
  let recordsSeen = 0;

  const add = (date, column, value) => {
    const clean = Number(value);
    if (!Number.isFinite(clean)) return;
    const range = RANGES[column];
    // Range-check per-sample only for averaged metrics; a single step sample is
    // legitimately tiny while the daily total is large.
    const cfg = Object.values(RECORD_TYPES).find((c) => c.column === column);
    if (cfg?.agg === 'mean' && range && (clean < range[0] || clean > range[1])) return;

    const day = totals.get(date) ?? {};
    const cell = day[column] ?? { sum: 0, count: 0 };
    cell.sum += clean;
    cell.count += 1;
    day[column] = cell;
    totals.set(date, day);
  };

  const decoder = new TextDecoder('utf-8');
  let carry = '';

  for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
    const slice = file.slice(offset, Math.min(offset + CHUNK_BYTES, file.size));
    const buffer = await slice.arrayBuffer();
    const isLast = offset + CHUNK_BYTES >= file.size;
    const text = carry + decoder.decode(buffer, { stream: !isLast });

    // A record may straddle a slice boundary. Keep everything after the last
    // complete tag and prepend it to the next chunk.
    const lastClose = text.lastIndexOf('>');
    const usable = lastClose === -1 ? '' : text.slice(0, lastClose + 1);
    carry = lastClose === -1 ? text : text.slice(lastClose + 1);

    const re = /<Record\s[^>]*>/g;
    let match;
    while ((match = re.exec(usable)) !== null) {
      const tag = match[0];
      recordsSeen += 1;

      const type = attr(tag, 'type');
      if (!type) continue;

      if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
        const state = attr(tag, 'value');
        if (!ASLEEP_VALUES.has(state)) continue;
        const start = parseTimestamp(attr(tag, 'startDate'));
        const end = parseTimestamp(attr(tag, 'endDate'));
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

        // Attribute a night to the morning it ended, matching how VitalSync
        // dates sleep everywhere else.
        const date = dayOf(attr(tag, 'endDate'));
        if (!date) continue;
        const hours = (end - start) / 3_600_000;
        sleepByDate.set(date, (sleepByDate.get(date) ?? 0) + hours);
        continue;
      }

      const config = RECORD_TYPES[type];
      if (!config) continue;

      const date = dayOf(attr(tag, 'startDate'));
      const raw = Number(attr(tag, 'value'));
      if (!date || !Number.isFinite(raw)) continue;

      add(date, config.column, normalise(config.column, raw, attr(tag, 'unit')));
    }

    onProgress?.(Math.min(100, Math.round(((offset + CHUNK_BYTES) / file.size) * 100)));
  }

  // --- collapse to one row per day -----------------------------------------
  const days = [];
  const allDates = new Set([...totals.keys(), ...sleepByDate.keys()]);

  for (const date of [...allDates].sort()) {
    const cells = totals.get(date) ?? {};
    const health = {};

    for (const [column, cell] of Object.entries(cells)) {
      const config = Object.values(RECORD_TYPES).find((c) => c.column === column);
      let value = config?.agg === 'sum' ? cell.sum : cell.sum / cell.count;

      const range = RANGES[column];
      if (range && (value < range[0] || value > range[1])) continue;
      health[column] = Math.round(value * 100) / 100;
    }

    const hours = sleepByDate.get(date);
    // Under 45 minutes is a nap or a mis-detection, not a night.
    const sleep = hours && hours >= 0.75 ? { duration_hours: Math.round(hours * 100) / 100 } : null;

    if (Object.keys(health).length || sleep) {
      days.push({ date, health: Object.keys(health).length ? health : null, sleep });
    }
  }

  const metrics = [
    ...new Set(days.flatMap((d) => [...Object.keys(d.health ?? {}), ...Object.keys(d.sleep ?? {})])),
  ];

  if (!days.length) {
    return {
      ok: false,
      format: 'Apple Health export.xml',
      days: [],
      workouts: [],
      metrics: [],
      dateRange: null,
      dropped: 0,
      unrecognised: [],
      error: `Scanned ${recordsSeen.toLocaleString()} records but found none of the metrics VitalSync tracks. Make sure this is export.xml from Health → Export All Health Data.`,
    };
  }

  return {
    ok: true,
    format: 'Apple Health export.xml',
    days,
    // Workouts live in <Workout> elements with a different shape; the JSON
    // route already covers them, so they are out of scope here.
    workouts: [],
    metrics,
    dateRange: [days[0].date, days[days.length - 1].date],
    dropped: 0,
    unrecognised: [],
    recordsSeen,
  };
}

/** Cheap sniff so the UI can pick a parser without reading the whole file. */
export async function looksLikeAppleHealthXml(file) {
  if (/\.xml$/i.test(file.name)) return true;
  const head = await file.slice(0, 2048).text();
  return /<HealthData|<!DOCTYPE HealthData/i.test(head);
}
