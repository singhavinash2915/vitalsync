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

import { statusColor } from './viz';

/**
 * How many days of history form the personal baseline.
 *
 * This started at 7 and that was too short to be meaningful: a bad week
 * *becomes* the baseline, so the next ordinary day scores like a personal
 * best. Against real data, an HRV of 48.9 ms — about 10% above a long-run
 * average of 44 — scored 98 on a 7-day baseline purely because the preceding
 * week had been poor. On a 60-day baseline the same day scores 79.
 *
 * 60 days is long enough to be stable against a rough patch and short enough
 * to follow genuine fitness change over a season. It matches the window used
 * by Training Today's RTT and is in the same range as Oura and Whoop.
 */
export const BASELINE_DAYS = 60;

/**
 * Bumped whenever a change to this file would make previously stored scores
 * disagree with freshly computed ones. The app compares it against the value
 * saved on the profile and rebuilds history once when they differ — otherwise
 * the dashboard (which always recomputes live) would show one formula while
 * Trends showed another.
 *
 * 2: readiness became pure recovery; load is reported alongside, not subtracted.
 * 3: a missing resting heart rate no longer scores as 0 bpm (which read as
 *    100% below baseline, i.e. perfect recovery), and recovery is weighted
 *    over the halves actually measured instead of blending against a
 *    placeholder 50.
 * 4: no formula change. A rebuild used to take its dates from the in-memory
 *    120-day window, stranding older scored days on whatever formula was
 *    current when they were last written — and baselines for days near the
 *    window edge were computed from a truncated history. Rebuilds now read the
 *    whole record, so a day's score no longer depends on when it was computed.
 */
export const SCORING_VERSION = 4;

/**
 * Below this, the baseline is too thin to trust and the sub-score falls back
 * to a neutral 50 rather than pretending to know.
 */
export const MIN_BASELINE_DAYS = 5;

/**
 * Colours come from `lib/viz.js` rather than living here.
 *
 * The previous set failed validation on this app's own dark surface: "Good" and
 * "Excellent" were 4.2 apart under protanopia — the same colour to a red-green
 * colourblind reader — and "Moderate" and "Poor" were 10.4 apart, below the
 * floor at which full colour vision separates a pair. Those four bands drive
 * every training decision the app makes.
 *
 * The replacement is stepped so lightness is monotone with visible gaps, which
 * means the bands stay readable in greyscale and under any colour-vision
 * deficiency, and it is never rendered without its label.
 */
export const SCORE_BANDS = [
  { min: 80, key: 'excellent', label: 'Excellent' },
  { min: 60, key: 'good', label: 'Good' },
  { min: 40, key: 'moderate', label: 'Moderate' },
  { min: 0, key: 'poor', label: 'Poor' },
];

export function bandFor(score) {
  const value = clamp(score ?? 0, 0, 100);
  return SCORE_BANDS.find((b) => value >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

/**
 * @param {number} score
 * @param {boolean} isDark  which stepping to use — dark is the app's default
 */
export const scoreColor = (score, isDark = true) => statusColor(bandFor(score).key, isDark);
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

/**
 * Number() that does not lie about absent values.
 *
 * `Number(null)` is 0 and `Number.isFinite(0)` is true, so the obvious
 * `Number.isFinite(Number(row.x))` treats every missing reading as a real zero.
 * That has produced a "lowest resting heart rate: 0 bpm" record, a VO2 max of
 * 0.0, a resting HR "56 above baseline", and a batch of rows rejected by a
 * database check constraint. Route every read of a possibly-absent DB value
 * through here.
 *
 * @returns {number|null} the number, or null if there was nothing to read
 */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** True when `value` holds a real, usable number. */
export const hasNumber = (value) => toNumber(value) !== null;

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
export function rollingAverage(history, key, days = BASELINE_DAYS) {
  const values = history
    .slice(0, days)
    .map((row) => row?.[key])
    .filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v)));

  if (values.length < MIN_BASELINE_DAYS) return null;
  return mean(values);
}

/** How many usable readings back the baseline, for "based on N days" copy. */
export function baselineCoverage(history, key, days = BASELINE_DAYS) {
  return history
    .slice(0, days)
    .map((row) => row?.[key])
    .filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).length;
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
  let hasHrv = false;
  if (hasNumber(hrv) && Number.isFinite(hrvBaseline) && hrvBaseline > 0) {
    const deltaPct = ((toNumber(hrv) - hrvBaseline) / hrvBaseline) * 100;
    hrvScore = clamp(50 + (deltaPct / HRV_FULL_SCALE) * 50, 0, 100);
    hasHrv = true;
  }

  let rhrScore = 50;
  let hasRhr = false;
  if (hasNumber(restingHr) && Number.isFinite(rhrBaseline) && rhrBaseline > 0) {
    // Inverted: a resting HR *below* baseline is the good direction.
    const deltaPct = ((rhrBaseline - toNumber(restingHr)) / rhrBaseline) * 100;
    rhrScore = clamp(50 + (deltaPct / RHR_FULL_SCALE) * 50, 0, 100);
    hasRhr = true;
  }

  // Weight only what was actually measured. Blending a real HRV against a
  // placeholder 50 for the missing half drags every partial reading toward
  // average and reports it with the same confidence as a complete one; if only
  // HRV is known, the honest answer is what HRV alone says.
  const base =
    hasHrv && hasRhr
      ? hrvScore * 0.6 + rhrScore * 0.4
      : hasHrv
        ? hrvScore
        : hasRhr
          ? rhrScore
          : 50;
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
      // Which halves this score actually rests on, so a partial reading can be
      // labelled as one rather than passed off as a full measurement.
      measured: [hasHrv ? 'hrv' : null, hasRhr ? 'restingHr' : null].filter(Boolean),
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
 * Objective sleep quality from the stage breakdown, 0-100.
 *
 * The self-rating is 40% of the sleep score and almost nobody fills it in, so
 * for anyone syncing from a watch that half of the score sat permanently
 * unused. The stages answer the same question better than memory does.
 *
 * Three components, against adult norms:
 *   deep       13-23% of the night is healthy; scored against 15%
 *   REM        20-25% is healthy; scored against 20%
 *   efficiency asleep / (asleep + awake) — 95%+ is excellent, 80% is poor
 *
 * Deep is weighted hardest because it is the stage that tracks physical
 * recovery. Returns null unless there is enough of a breakdown to be honest.
 */
export function sleepQualityFromStages({ duration_hours, deep_hours, rem_hours, awake_hours } = {}) {
  const total = Number(duration_hours);
  if (!Number.isFinite(total) || total <= 0) return null;

  const deep = Number(deep_hours);
  const rem = Number(rem_hours);
  if (!Number.isFinite(deep) && !Number.isFinite(rem)) return null;

  const parts = [];

  if (Number.isFinite(deep)) {
    parts.push({ value: clamp((deep / total / 0.15) * 100, 0, 100), weight: 0.4 });
  }
  if (Number.isFinite(rem)) {
    parts.push({ value: clamp((rem / total / 0.2) * 100, 0, 100), weight: 0.35 });
  }
  if (hasNumber(awake_hours)) {
    const efficiency = total / (total + Number(awake_hours));
    // 80% efficiency scores 0, 100% scores 100 — below 80 is broken sleep.
    parts.push({ value: clamp(((efficiency - 0.8) / 0.2) * 100, 0, 100), weight: 0.25 });
  }

  const weight = parts.reduce((sum, p) => sum + p.weight, 0);
  if (!weight) return null;

  return round(parts.reduce((sum, p) => sum + p.value * p.weight, 0) / weight);
}

/**
 * Sleep Score = 60% duration + 40% quality.
 *
 * Quality prefers your own rating when you gave one, and falls back to the
 * stage-derived figure otherwise.
 *
 * Returns a null score when nothing was logged. That distinction matters:
 * "I didn't record my sleep" is not the same claim as "I slept terribly", and
 * scoring the former as 0 silently drags readiness down by 30 points for
 * anyone who doesn't wear their watch to bed.
 *
 * When only one half is present the score uses that half alone rather than
 * treating the missing one as zero.
 */
export function calcSleepScore({ durationHours, qualityRating, stages } = {}) {
  const hasDuration = Number(durationHours) > 0;
  const hasQuality = Number.isFinite(Number(qualityRating)) && Number(qualityRating) > 0;
  const derived = stages ? sleepQualityFromStages({ duration_hours: durationHours, ...stages }) : null;

  if (!hasDuration && !hasQuality && derived === null) {
    return { score: null, breakdown: { duration: null, quality: null, logged: false } };
  }

  const duration = hasDuration ? sleepDurationScore(durationHours) : null;
  const quality = hasQuality ? clamp((Number(qualityRating) / 5) * 100, 0, 100) : derived;

  let score;
  if (duration !== null && quality !== null) score = duration * 0.6 + quality * 0.4;
  else score = duration ?? quality;

  return {
    score: round(score),
    breakdown: {
      duration: duration === null ? null : round(duration),
      quality: quality === null ? null : round(quality),
      qualitySource: hasQuality ? 'rated' : derived !== null ? 'stages' : null,
      logged: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Exertion
// ---------------------------------------------------------------------------

export const DEFAULT_CALORIE_TARGET = 600;

/** Exertion a typical day should land on, once the target is tuned. */
const TYPICAL_DAY_EXERTION = 0.7;

/**
 * Suggests a daily active-calorie target from your own history.
 *
 * The default 600 is a guess, and a bad one for most people: if your target
 * happens to sit near your average burn, exertion pegs at 100 on half your
 * days. It then carries no information and permanently docks readiness by the
 * full 20-point exertion weight.
 *
 * Aiming the *median* day at 70% leaves headroom, so a genuinely hard day
 * still reads near 100 and an easy one reads low. Uses the median rather than
 * the mean because a couple of big days shouldn't drag the target up.
 *
 * @param {number[]} dailyCalories active calories per day
 * @returns {number|null} target rounded to the nearest 50
 */
export function suggestCalorieTarget(dailyCalories = []) {
  const values = dailyCalories
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  // Fewer than a week of days isn't a distribution, it's noise.
  if (values.length < 7) return null;

  const median = values[Math.floor((values.length - 1) / 2)];
  const target = Math.round(median / TYPICAL_DAY_EXERTION / 50) * 50;
  return clamp(target, 200, 3000);
}

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
 * Readiness Score — how ready your body is to take on load.
 *
 * Readiness IS recovery: HRV and resting heart rate against your own baseline,
 * plus the lifestyle adjustments. Sleep and the load you have already spent are
 * reported next to it rather than blended into it.
 *
 * This changed deliberately. The previous formula folded sleep and exertion in
 * at 30% and 20%, which conflated two genuinely different questions — "how
 * recovered am I" and "how much have I already spent today" — into a single
 * number that answered neither cleanly. On one real day it cost 21 points of
 * drag and put the score 19 below what an HRV-based app reported for the same
 * morning, not because the apps disagreed about the body but because one was
 * quietly subtracting a day's walking from a measure of autonomic recovery.
 *
 * Sleep still reaches readiness, but through physiology rather than
 * arithmetic: a good night adds 10 points inside the recovery calculation, the
 * same way alcohol removes 10. That is a real effect on autonomic tone, not a
 * weighting.
 */
export function calcReadinessScore({ recovery = null } = {}) {
  if (recovery === null || recovery === undefined || !Number.isFinite(Number(recovery))) {
    return { score: null, breakdown: { basis: 'recovery' } };
  }
  return { score: round(Number(recovery)), breakdown: { basis: 'recovery' } };
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
  const hrvBaseline = rollingAverage(history, 'hrv');
  const rhrBaseline = rollingAverage(history, 'resting_hr');

  // "Good sleep" as a recovery bonus is derived, not a checkbox: 7.5h+ at a
  // quality of 4/5 or better. Keeps the journal form short.
  const goodSleep =
    Number(sleep?.duration_hours) >= 7.5 && Number(sleep?.quality_rating ?? 0) >= 4;

  const recovery = calcRecoveryScore({
    // toNumber, not Number: a missing resting heart rate coerced to 0 reads as
    // "100% below baseline", which the scoring rewards as perfect recovery. It
    // pushed a genuine 22 up to 48 on any reading that arrived without an RHR.
    hrv: toNumber(health?.hrv),
    restingHr: toNumber(health?.resting_hr),
    hrvBaseline,
    rhrBaseline,
    journal: journal ? { ...journal, good_sleep: goodSleep } : goodSleep ? { good_sleep: true } : null,
  });

  const sleepScore = calcSleepScore({
    durationHours: sleep?.duration_hours,
    qualityRating: sleep?.quality_rating,
    stages: sleep
      ? {
          deep_hours: sleep.deep_hours,
          rem_hours: sleep.rem_hours,
          awake_hours: sleep.awake_hours,
        }
      : null,
  });

  // Exertion is only meaningful if we know something about the day's output.
  // With neither calories nor a workout it is unknown, not zero.
  const hasExertionInput = hasNumber(health?.active_calories) || workouts.length > 0;
  const exertion = calcExertionScore({
    activeCalories: health?.active_calories,
    workouts,
    calorieTarget: profile?.calorie_target,
  });

  // Recovery falls back to a neutral 50 with no baseline; that is a genuine
  // estimate, but with no HRV *or* resting HR at all there is nothing to score.
  const hasRecoveryInput =
    hasNumber(health?.hrv) || hasNumber(health?.resting_hr);

  const readiness = calcReadinessScore({
    recovery: hasRecoveryInput ? recovery.score : null,
  });

  return {
    recovery_score: hasRecoveryInput ? recovery.score : null,
    sleep_score: sleepScore.score,
    exertion_score: hasExertionInput ? exertion.score : null,
    readiness_score: readiness.score,
    breakdown: {
      recovery: recovery.breakdown,
      sleep: sleepScore.breakdown,
      exertion: exertion.breakdown,
      baselines: {
        hrv: hrvBaseline === null ? null : Number(hrvBaseline.toFixed(1)),
        restingHr: rhrBaseline === null ? null : Number(rhrBaseline.toFixed(1)),
        sleep: (() => {
          const v = rollingAverage(sleepHistory, 'duration_hours');
          return v === null ? null : Number(v.toFixed(1));
        })(),
        days: baselineCoverage(history, 'hrv'),
      },
    },
    /** False when there is literally nothing logged — the UI shows an empty state. */
    hasData: Boolean(health || sleep || journal || workouts.length),
  };
}
