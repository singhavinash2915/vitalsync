import { toNumber, hasNumber, mean } from './scores';

/**
 * Reading an InBody trend for the thing that actually matters.
 *
 * The scan's own advice was −10.7 kg of fat and **0.0 kg of muscle**, and that
 * zero is the whole brief: the goal is to lose fat while holding 37 kg of
 * skeletal muscle. Bodyweight alone cannot tell you whether that is happening —
 * a kilo off the scale is good news or bad news depending entirely on which
 * tissue it came from, and the failure mode of an aggressive deficit is that it
 * comes from both.
 *
 * So everything here is expressed as the split, not the total.
 */

const KG_PER_WEEK_SAFE = 0.75; // above this, lean mass usually starts going too

const sortAsc = (rows) => [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));

const weeksBetween = (from, to) =>
  (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / (7 * 86400000);

/** Latest scan, or null. */
export function latestScan(scans = []) {
  const rows = sortAsc(scans);
  return rows.length ? rows[rows.length - 1] : null;
}

/**
 * Change between the first and last scan, split by tissue.
 *
 * Returns null with fewer than two scans — a single reading is a starting
 * point, not a trend, and dressing it up as one would be the same mistake as
 * scoring a body off one morning's HRV.
 */
export function bodyTrend(scans = []) {
  const rows = sortAsc(scans).filter((r) => hasNumber(r.weight_kg));
  if (rows.length < 2) return null;

  const first = rows[0];
  const last = rows[rows.length - 1];
  const weeks = weeksBetween(first.date, last.date);
  if (weeks <= 0) return null;

  const delta = (key) =>
    hasNumber(first[key]) && hasNumber(last[key])
      ? toNumber(last[key]) - toNumber(first[key])
      : null;

  const weightChange = delta('weight_kg');
  const fatChange = delta('body_fat_mass_kg');
  const muscleChange = delta('skeletal_muscle_kg');
  const leanChange = delta('fat_free_mass_kg');

  // Of the weight that moved, how much came from fat? This is the number that
  // separates a good cut from a bad one.
  const fatShare =
    weightChange !== null && fatChange !== null && Math.abs(weightChange) > 0.1
      ? (fatChange / weightChange) * 100
      : null;

  const losingLean = (muscleChange ?? leanChange ?? 0) < -0.4;
  const perWeek = weightChange === null ? null : weightChange / weeks;

  return {
    scans: rows.length,
    from: first.date,
    to: last.date,
    weeks: Number(weeks.toFixed(1)),
    weightChange,
    fatChange,
    muscleChange,
    leanChange,
    fatShare,
    perWeek,
    losingLean,
    tooFast: perWeek !== null && perWeek < -KG_PER_WEEK_SAFE,
    verdict: losingLean
      ? 'losing-lean'
      : fatChange !== null && fatChange < -0.2
        ? 'on-track'
        : 'holding',
  };
}

/** Progress from the starting weight toward the goal. */
export function goalProgress(scans = [], goalWeightKg = null) {
  const rows = sortAsc(scans).filter((r) => hasNumber(r.weight_kg));
  if (!rows.length) return null;

  const start = toNumber(rows[0].weight_kg);
  const current = toNumber(rows[rows.length - 1].weight_kg);
  const goal =
    toNumber(goalWeightKg) ?? toNumber(rows[rows.length - 1].target_weight_kg);
  if (goal === null) return null;

  const total = start - goal;
  const done = start - current;

  return {
    start,
    current,
    goal,
    toGo: Number((current - goal).toFixed(1)),
    // A single scan has made no progress by definition; guard the divide.
    pct: Math.abs(total) < 0.1 ? null : Math.max(0, Math.min(100, (done / total) * 100)),
  };
}

/**
 * The one sentence worth putting on the screen.
 *
 * Deliberately refuses to congratulate weight loss on its own — the whole point
 * of measuring composition is that the scale cannot tell you whether it went
 * well.
 */
export function bodySummary(scans = [], goalWeightKg = null) {
  const last = latestScan(scans);
  if (!last) return null;

  const trend = bodyTrend(scans);
  const goal = goalProgress(scans, goalWeightKg);

  if (!trend) {
    return {
      tone: 'info',
      headline: 'First scan recorded',
      detail: `${toNumber(last.weight_kg)} kg at ${toNumber(last.body_fat_pct)}% body fat, ${toNumber(last.skeletal_muscle_kg)} kg skeletal muscle. One scan is a starting point — the next one is where this starts telling you something.`,
      goal,
      trend: null,
    };
  }

  const kg = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} kg`;

  const detail = trend.losingLean
    ? `Weight is ${kg(trend.weightChange)} over ${trend.weeks} weeks, but skeletal muscle is ${kg(trend.muscleChange ?? trend.leanChange)} — the deficit is eating into lean mass, which is the one outcome the plan was built to avoid. Ease the deficit and keep protein up.`
    : trend.fatShare !== null && trend.fatShare > 80
      ? `${kg(trend.weightChange)} over ${trend.weeks} weeks, and ${Math.round(trend.fatShare)}% of it came off as fat with muscle held at ${toNumber(last.skeletal_muscle_kg)} kg. That is exactly the split the scan asked for.`
      : `${kg(trend.weightChange)} over ${trend.weeks} weeks. Fat ${kg(trend.fatChange ?? 0)}, muscle ${kg(trend.muscleChange ?? 0)}.`;

  return {
    tone: trend.losingLean ? 'bad' : trend.verdict === 'on-track' ? 'good' : 'info',
    headline: trend.losingLean
      ? 'Losing muscle, not just fat'
      : trend.verdict === 'on-track'
        ? 'Fat down, muscle held'
        : 'Composition steady',
    detail,
    goal,
    trend,
  };
}

/** Average of a field across scans, for a chart's reference line. */
export function scanAverage(scans = [], key) {
  const values = scans.filter((r) => hasNumber(r[key])).map((r) => toNumber(r[key]));
  return values.length ? mean(values) : null;
}
