/**
 * VitalSync scoring engine.
 *
 * Every score is a 0-100 integer. All functions are pure and side-effect free
 * so they can be unit tested and re-run over historical data at any time.
 *
 * The physiology in one line: HRV rising above your own baseline and resting
 * heart rate falling below it both indicate parasympathetic (recovered) tone.
 * Everything here is measured against *your own* rolling baseline, never
 * against population norms — a HRV of 45ms is great for one person and a red
 * flag for another.
 */

export const SCORE_BANDS = [
  { min: 80, key: 'excellent', label: 'Excellent', color: '#22c55e' },
  { min: 60, key: 'good', label: 'Good', color: '#eab308' },
  { min: 40, key: 'moderate', label: 'Moderate', color: '#f97316' },
  { min: 0, key: 'poor', label: 'Poor', color: '#ef4444' },
];

export function bandFor(score) {
  const value = clamp(score ?? 0, 0, 100);
  return SCORE_BANDS.find((b) => value >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

export const scoreColor = (score) => bandFor(score).color;
export const scoreLabel = (score) => bandFor(score).label;

/**
 * Exertion is the one score where "high" is not "good" — it measures load, not
 * quality. Labelling 95% as "Excellent" would tell you the opposite of what the
 * readiness formula does with it, so it gets its own vocabulary.
 */
export function exertionLabel(score) {
  const value = clamp(score ?? 0, 0, 100);
  if (value >= 85) return 'Very high load';
  if (value >= 60) return 'High load';
  if (value >= 35) return 'Moderate load';
  if (value > 0) return 'Light load';
  return 'Rest day';
}

export function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

const round = (n) => Math.round(clamp(n, 0, 100));

/** Mean of the numeric values in an array, ignoring null/undefined/NaN. */
export function mean(values) {
  const nums = (values ?? []).map(Number).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Rolling baseline from the N most recent prior logs for a metric.
 * `history` must be ordered newest-first and must NOT include today.
 */
export function rollingAverage(history, key, days = 7) {
  return mean(
    history
      .slice(0, days)
      .map((row) => row?.[key])
      .filter((v) => v !== null && v !== undefined)
  );
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

/**
 * Recovery Score — how ready your autonomic nervous system is for load.
 *
 *   HRV vs 7-day average  → 60% weight (higher is better)
 *   RHR vs 7-day average  → 40% weight (lower is better)
 *   Habit modifiers       → additive, applied after the weighted base
 *
 * Deviation from baseline is expressed as a percentage and mapped onto a
 * 50-centred scale: exactly at baseline scores 50, and every 1% of deviation
 * moves the sub-score by a fixed amount until it saturates at 0/100.
 *
 * HRV swings much more than RHR day to day, so the two use different
 * sensitivities: ±25% of HRV spans the full range, while just ±10% of RHR does.
 *
 * With no baseline yet (first week of logging) the sub-score falls back to a
 * neutral 50 so the app still shows something sane on day one.
 */
export function calcRecoveryScore({ hrv, restingHr, hrvBaseline, rhrBaseline, journal } = {}) {
  const HRV_FULL_SCALE = 25; // % deviation that saturates the sub-score
  const RHR_FULL_SCALE = 10;

  let hrvScore = 50;
  if (Number.isFinite(hrv) && Number.isFinite(hrvBaseline) && hrvBaseline > 0) {
    const deltaPct = ((hrv - hrvBaseline) / hrvBaseline) * 100;
    hrvScore = clamp(50 + (deltaPct / HRV_FULL_SCALE) * 50, 0, 100);
  }

  let rhrScore = 50;
  if (Number.isFinite(restingHr) && Number.isFinite(rhrBaseline) && rhrBaseline > 0) {
    // Inverted: a resting HR *below* baseline is the good direction.
    const deltaPct = ((rhrBaseline - restingHr) / rhrBaseline) * 100;
    rhrScore = clamp(50 + (deltaPct / RHR_FULL_SCALE) * 50, 0, 100);
  }

  const base = hrvScore * 0.6 + rhrScore * 0.4;
  const { total: modifier, applied } = habitModifiers(journal);

  return {
    score: round(base + modifier),
    breakdown: {
      hrvScore: round(hrvScore),
      rhrScore: round(rhrScore),
      base: round(base),
      modifier,
      modifiers: applied,
      hasBaseline: Number.isFinite(hrvBaseline) || Number.isFinite(rhrBaseline),
    },
  };
}

/**
 * Lifestyle adjustments from the daily journal.
 * Penalties and bonuses are additive points on the recovery score.
 */
export function habitModifiers(journal) {
  const applied = [];
  if (!journal) return { total: 0, applied };

  if (journal.alcohol) applied.push({ label: 'Alcohol', value: -10 });
  if (Number(journal.stress_level) >= 4) applied.push({ label: 'High stress', value: -8 });
  if (journal.travel) applied.push({ label: 'Travel', value: -4 });
  if (Number(journal.diet_quality) > 0 && Number(journal.diet_quality) <= 2) {
    applied.push({ label: 'Poor diet', value: -5 });
  }
  if (journal.meditation) applied.push({ label: 'Meditation', value: +5 });
  if (journal.good_sleep) applied.push({ label: 'Good sleep', value: +10 });

  return { total: applied.reduce((sum, m) => sum + m.value, 0), applied };
}

// ---------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------

/** Duration in hours → 0-100, per the banding in the spec. */
export function sleepDurationScore(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return 0;
  if (h < 6) return 40;
  if (h < 7) return 60;
  if (h <= 8) return 80;
  return 100;
}

/**
 * Sleep Score = 60% duration + 40% self-rated quality (1-5 → 20-100).
 */
export function calcSleepScore({ durationHours, qualityRating } = {}) {
  const duration = sleepDurationScore(durationHours);
  const quality = Number.isFinite(Number(qualityRating))
    ? clamp((Number(qualityRating) / 5) * 100, 0, 100)
    : 0;

  return {
    score: round(duration * 0.6 + quality * 0.4),
    breakdown: { duration, quality: round(quality) },
  };
}

// ---------------------------------------------------------------------------
// Exertion
// ---------------------------------------------------------------------------

export const DEFAULT_CALORIE_TARGET = 600;

/**
 * Exertion Score — how much load you actually put on the body today.
 * Unlike the other three, a high number is not "good"; it is simply high.
 *
 *   active calories / daily target  → the base
 *   workout intensity              → bonus, up to +20
 *
 * Intensity bonus scales with both how hard and how long you went, so a
 * 20-minute 9/10 session and a 90-minute 5/10 session land in similar places.
 */
export function calcExertionScore({ activeCalories, workouts = [], calorieTarget } = {}) {
  const target = Number(calorieTarget) > 0 ? Number(calorieTarget) : DEFAULT_CALORIE_TARGET;
  const calories = Number(activeCalories);

  const calorieScore = Number.isFinite(calories) ? clamp((calories / target) * 100, 0, 100) : 0;

  // Each workout contributes intensity × normalised duration (1h = 1.0).
  const intensityLoad = workouts.reduce((sum, w) => {
    const intensity = clamp(Number(w.intensity) || 0, 0, 10);
    const hours = clamp((Number(w.duration_mins) || 0) / 60, 0, 3);
    return sum + intensity * hours;
  }, 0);
  const intensityBonus = clamp(intensityLoad * 2.5, 0, 20);

  return {
    score: round(calorieScore + intensityBonus),
    breakdown: {
      calorieScore: round(calorieScore),
      intensityBonus: Math.round(intensityBonus),
      target,
      workoutCount: workouts.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

/**
 * Readiness Score — the single "what should I do today" number.
 *
 *   Recovery      × 0.5
 *   Sleep         × 0.3
 *   (100 - Exertion) × 0.2   ← yesterday's load working against you
 *
 * Exertion is inverted because accumulated load reduces readiness. Weights
 * sum to 1.0, so the result stays on a true 0-100 scale.
 */
export function calcReadinessScore({ recovery = 0, sleep = 0, exertion = 0 } = {}) {
  const value =
    clamp(recovery, 0, 100) * 0.5 +
    clamp(sleep, 0, 100) * 0.3 +
    (100 - clamp(exertion, 0, 100)) * 0.2;
  return { score: round(value) };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Computes all four scores for a single day.
 *
 * @param {object} args
 * @param {object} args.health   health_logs row for the day (hrv, resting_hr, active_calories…)
 * @param {object} args.sleep    sleep_logs row for the day
 * @param {object} args.journal  journal_logs row for the day
 * @param {Array}  args.workouts workout_logs rows for the day
 * @param {Array}  args.history  prior health_logs, newest-first, excluding today
 * @param {Array}  args.sleepHistory prior sleep_logs, newest-first, excluding today
 * @param {object} args.profile  user row (calorie_target)
 */
export function computeDailyScores({
  health = null,
  sleep = null,
  journal = null,
  workouts = [],
  history = [],
  sleepHistory = [],
  profile = null,
} = {}) {
  const hrvBaseline = rollingAverage(history, 'hrv', 7);
  const rhrBaseline = rollingAverage(history, 'resting_hr', 7);

  // "Good sleep" as a recovery bonus is derived, not a checkbox: 7.5h+ at a
  // quality of 4/5 or better. Keeps the journal form short.
  const goodSleep =
    Number(sleep?.duration_hours) >= 7.5 && Number(sleep?.quality_rating ?? 0) >= 4;

  const recovery = calcRecoveryScore({
    hrv: Number(health?.hrv),
    restingHr: Number(health?.resting_hr),
    hrvBaseline,
    rhrBaseline,
    journal: journal ? { ...journal, good_sleep: goodSleep } : goodSleep ? { good_sleep: true } : null,
  });

  const sleepScore = calcSleepScore({
    durationHours: sleep?.duration_hours,
    qualityRating: sleep?.quality_rating,
  });

  const exertion = calcExertionScore({
    activeCalories: health?.active_calories,
    workouts,
    calorieTarget: profile?.calorie_target,
  });

  const readiness = calcReadinessScore({
    recovery: recovery.score,
    sleep: sleepScore.score,
    exertion: exertion.score,
  });

  return {
    recovery_score: recovery.score,
    sleep_score: sleepScore.score,
    exertion_score: exertion.score,
    readiness_score: readiness.score,
    breakdown: {
      recovery: recovery.breakdown,
      sleep: sleepScore.breakdown,
      exertion: exertion.breakdown,
      baselines: {
        hrv: hrvBaseline === null ? null : Number(hrvBaseline.toFixed(1)),
        restingHr: rhrBaseline === null ? null : Number(rhrBaseline.toFixed(1)),
        sleep: (() => {
          const v = rollingAverage(sleepHistory, 'duration_hours', 7);
          return v === null ? null : Number(v.toFixed(1));
        })(),
      },
    },
    /** False when there is literally nothing logged — the UI shows an empty state. */
    hasData: Boolean(health || sleep || journal || workouts.length),
  };
}
