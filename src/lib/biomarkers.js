import { mean, BASELINE_DAYS, MIN_BASELINE_DAYS } from './scores';

/**
 * Biomarkers describe the state of the body rather than the effort of a day.
 *
 * The important distinction this file makes is between metrics that are
 * comparable to population norms and metrics that are not. VO2 max and
 * respiratory rate genuinely are — there are validated reference ranges by age
 * and sex. HRV and resting heart rate are not, which is why everywhere else in
 * VitalSync they are scored only against your own history. Presenting them the
 * same way would quietly imply a "good" HRV number exists, and it doesn't.
 *
 * So each biomarker declares which kind it is, and gets the treatment that
 * fits.
 */

const RECENT_DAYS = 14;

/**
 * Cooper Institute VO2 max norms, ml/(kg·min), by age band.
 * The one metric here where "how do I compare to other people" is a fair
 * question with a real answer.
 */
const VO2_NORMS = {
  male: [
    { maxAge: 29, bands: [[52, 'Superior'], [46, 'Excellent'], [42, 'Good'], [37, 'Fair']] },
    { maxAge: 39, bands: [[51, 'Superior'], [45, 'Excellent'], [41, 'Good'], [35, 'Fair']] },
    { maxAge: 49, bands: [[46, 'Superior'], [40, 'Excellent'], [36, 'Good'], [31, 'Fair']] },
    { maxAge: 59, bands: [[42, 'Superior'], [36, 'Excellent'], [32, 'Good'], [27, 'Fair']] },
    { maxAge: 200, bands: [[38, 'Superior'], [33, 'Excellent'], [29, 'Good'], [24, 'Fair']] },
  ],
  female: [
    { maxAge: 29, bands: [[47, 'Superior'], [41, 'Excellent'], [37, 'Good'], [32, 'Fair']] },
    { maxAge: 39, bands: [[45, 'Superior'], [39, 'Excellent'], [35, 'Good'], [31, 'Fair']] },
    { maxAge: 49, bands: [[40, 'Superior'], [35, 'Excellent'], [31, 'Good'], [27, 'Fair']] },
    { maxAge: 59, bands: [[37, 'Superior'], [32, 'Excellent'], [28, 'Good'], [24, 'Fair']] },
    { maxAge: 200, bands: [[33, 'Superior'], [28, 'Excellent'], [25, 'Good'], [21, 'Fair']] },
  ],
};

const BAND_COLOURS = {
  Superior: '#22c55e',
  Excellent: '#22c55e',
  Good: '#84cc16',
  Fair: '#eab308',
  Low: '#f97316',
};

export function vo2Rating(value, { age, sex } = {}) {
  const table = VO2_NORMS[sex];
  if (!table || !Number.isFinite(Number(value)) || !Number.isFinite(Number(age))) return null;

  const row = table.find((r) => Number(age) <= r.maxAge) ?? table[table.length - 1];
  const band = row.bands.find(([threshold]) => Number(value) >= threshold);
  const label = band ? band[1] : 'Low';
  return { label, color: BAND_COLOURS[label] };
}

/**
 * The catalogue. `comparable: false` means the only honest read is your own
 * direction of travel.
 */
export const BIOMARKERS = [
  {
    key: 'hrv',
    label: 'HRV baseline',
    unit: 'ms',
    precision: 1,
    goodDirection: 'up',
    comparable: false,
    note: 'Autonomic recovery capacity. Only meaningful against your own history.',
  },
  {
    key: 'resting_hr',
    label: 'Resting heart rate',
    unit: 'bpm',
    precision: 0,
    goodDirection: 'down',
    comparable: false,
    note: 'Falls as aerobic fitness improves. Rises with fatigue, illness or alcohol.',
  },
  {
    key: 'vo2_max',
    label: 'VO₂ max',
    unit: 'ml/kg/min',
    precision: 1,
    goodDirection: 'up',
    comparable: true,
    note: 'Aerobic capacity, and the strongest single predictor of all-cause mortality.',
  },
  {
    key: 'cardio_recovery',
    label: 'Cardio recovery',
    unit: 'bpm',
    precision: 0,
    goodDirection: 'up',
    comparable: true,
    // Under 12 bpm in the first minute is the classic red flag in the
    // literature; above 25 is a well-trained response.
    bands: [[25, 'Excellent'], [18, 'Good'], [12, 'Fair']],
    note: 'How far your heart rate drops in the minute after peak effort.',
  },
  {
    key: 'respiratory_rate',
    label: 'Respiratory rate',
    unit: 'breaths/min',
    precision: 1,
    goodDirection: 'stable',
    comparable: true,
    bands: [[20, 'Low'], [12, 'Good'], [0, 'Low']],
    note: 'Normal adult range is 12–20 at rest. A sustained rise often precedes illness.',
  },
  {
    key: 'weight_kg',
    label: 'Weight',
    unit: 'kg',
    precision: 1,
    goodDirection: 'stable',
    comparable: false,
    note: 'Trend matters far more than any single reading.',
  },
  {
    key: 'spo2',
    label: 'Blood oxygen',
    unit: '%',
    precision: 1,
    goodDirection: 'up',
    comparable: true,
    bands: [[95, 'Good'], [90, 'Fair']],
    note: 'Below 95% at rest is worth watching; below 90% warrants medical advice.',
  },
];

/** Applies a simple descending threshold table. */
function bandRating(value, bands) {
  if (!bands || !Number.isFinite(Number(value))) return null;
  const hit = bands.find(([threshold]) => Number(value) >= threshold);
  const label = hit ? hit[1] : 'Low';
  return { label, color: BAND_COLOURS[label] ?? '#f97316' };
}

/**
 * @param {Array} history health_logs, any order
 * @param {object} profile for the VO2 reference table
 * @returns one entry per biomarker that has any data at all
 */
export function summariseBiomarkers(history = [], profile = null) {
  const sorted = [...history].sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

  return BIOMARKERS.map((marker) => {
    const readings = sorted
      .map((row) => ({ date: row.date, value: Number(row[marker.key]) }))
      .filter((r) => Number.isFinite(r.value));

    if (!readings.length) return { ...marker, hasData: false };

    const latest = readings[0];
    const recent = mean(readings.slice(0, RECENT_DAYS).map((r) => r.value));
    const baseline =
      readings.length >= MIN_BASELINE_DAYS
        ? mean(readings.slice(0, BASELINE_DAYS).map((r) => r.value))
        : null;

    // Direction of travel: recent window against the longer baseline.
    let trend = null;
    if (baseline !== null && recent !== null && baseline !== 0) {
      const deltaPct = ((recent - baseline) / baseline) * 100;
      const flat = Math.abs(deltaPct) < 2;
      const rising = deltaPct > 0;
      const good =
        marker.goodDirection === 'stable' ? flat : marker.goodDirection === 'up' ? rising : !rising;

      trend = {
        deltaPct,
        label: flat ? 'Stable' : rising ? 'Rising' : 'Falling',
        color: flat ? 'var(--text-muted)' : good ? '#22c55e' : '#f97316',
      };
    }

    const rating =
      marker.key === 'vo2_max'
        ? vo2Rating(latest.value, { age: profile?.age, sex: profile?.sex })
        : marker.comparable
          ? bandRating(latest.value, marker.bands)
          : null;

    // Oldest-first series for the sparkline.
    const series = readings
      .slice(0, BASELINE_DAYS)
      .reverse()
      .map((r) => r.value);

    return {
      ...marker,
      hasData: true,
      latest: latest.value,
      latestDate: latest.date,
      recent,
      baseline,
      readings: readings.length,
      trend,
      rating,
      series,
    };
  });
}
