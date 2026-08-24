import { toNumber, mean } from './scores';
import { todayKey, shiftKey } from './dates';

/**
 * Protein, and almost nothing else.
 *
 * The app's own record is unambiguous about what gets logged by hand: two
 * journal entries, one manual sleep entry, two manual workouts, against
 * thousands of synced rows. A four-field macro form would be abandoned inside a
 * week, so this tracks the one number that actually decides whether a fat-loss
 * phase costs you muscle, and makes a whole day cost about three taps.
 *
 * Calories are accepted but never required — the scan's 2,458 kcal figure is
 * there if wanted, and hidden if not.
 */

/** A scoop of whey is close enough to this across the common brands. */
export const WHEY_PROTEIN_G = 24;

/** The two quick-add sizes: a scoop, and a protein-forward meal. */
export const QUICK_ADDS = [WHEY_PROTEIN_G, 40];

/**
 * Daily protein target.
 *
 * Anchored to fat-free mass rather than bodyweight, because the requirement
 * comes from the tissue being protected, not from the fat being lost — scaling
 * off 87 kg would set a target that falls as the cut succeeds, which is exactly
 * backwards. 2.4 g per kg of fat-free mass sits at the upper end of the
 * evidence for a deficit, which is where you want it when the brief says hold
 * 37 kg of muscle.
 */
export function proteinTarget({ profile = null, latestScan = null } = {}) {
  const explicit = toNumber(profile?.protein_target_g);
  if (explicit) return { grams: explicit, basis: 'your setting' };

  const ffm = toNumber(latestScan?.fat_free_mass_kg);
  if (ffm) {
    return { grams: Math.round((ffm * 2.4) / 5) * 5, basis: `${ffm} kg fat-free mass` };
  }

  const goal = toNumber(profile?.goal_weight_kg) ?? toNumber(profile?.weight);
  if (goal) return { grams: Math.round((goal * 2) / 5) * 5, basis: 'bodyweight' };

  return { grams: 150, basis: 'default' };
}

/**
 * A day's totals, summed from its meals.
 *
 * Always derived, never stored. `nutrition_logs` still carries a protein_g
 * column from before meals existed, and keeping both would be two copies of one
 * number free to disagree — so that column is dead and this is the only answer.
 */
export function dayTotals(meals = [], date = todayKey()) {
  const rows = meals.filter((m) => m.date === date);
  const sum = (key) =>
    Math.round(rows.reduce((total, m) => total + (toNumber(m[key]) ?? 0), 0) * 10) / 10;

  return {
    date,
    meals: rows.length,
    protein_g: Math.round(sum('protein_g')),
    carbs_g: sum('carbs_g'),
    fat_g: sum('fat_g'),
    kcal: Math.round(sum('kcal')),
  };
}

/** Supplement flags for a day, which are not food and live on their own row. */
export function dayEntry(logs = [], date = todayKey()) {
  const row = logs.find((r) => r.date === date) ?? null;
  return {
    date,
    whey_scoops: toNumber(row?.whey_scoops) ?? 0,
    creatine_taken: Boolean(row?.creatine_taken),
    exists: Boolean(row),
  };
}

/**
 * How the last `days` have gone.
 *
 * Averages only over days that were actually logged. Counting an unlogged day
 * as zero protein would report a diet nobody was on, and would make the average
 * a measure of logging diligence rather than of eating.
 */
export function proteinSummary(meals = [], target = 150, days = 7, supplements = []) {
  const from = shiftKey(todayKey(), -(days - 1));
  const dates = [...new Set(meals.filter((m) => m.date >= from && m.date <= todayKey()).map((m) => m.date))];

  const totals = dates.map((date) => dayTotals(meals, date));
  const average = totals.length ? mean(totals.map((t) => t.protein_g)) : null;
  const onTarget = totals.filter((t) => t.protein_g >= target * 0.9).length;

  return {
    days,
    loggedDays: totals.length,
    average: average === null ? null : Math.round(average),
    onTarget,
    hitRate: totals.length ? Math.round((onTarget / totals.length) * 100) : null,
    creatineDays: supplements.filter((r) => r.date >= from && r.creatine_taken).length,
    byDay: totals.sort((a, b) => (a.date < b.date ? -1 : 1)),
    // Said out loud rather than implied by a thin average.
    coverage: `${totals.length} of ${days} days logged`,
  };
}


/**
 * A previous estimate for the same thing, if there is one.
 *
 * The cheapest API call is the one never made. Estimates are stored on the meal
 * they produced, so the second time the same food is described the answer is
 * already in the database — and people eat the same things constantly. This is
 * the real token saving; switching model tiers only changes the unit price.
 *
 * Matching is on the normalised description, so "Pizza slice" and "pizza
 * slice " reuse the same answer.
 */
export function findCachedEstimate(meals = [], description) {
  const key = String(description ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!key) return null;

  const hit = [...meals]
    .filter((m) => (m.source === 'ai' || m.source === 'repeat') && m.description)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .find((m) => m.description.toLowerCase().replace(/\s+/g, ' ').trim() === key);

  if (!hit) return null;
  return {
    items: [{
      name: hit.description,
      portion: hit.portion ?? '',
      protein_g: toNumber(hit.protein_g) ?? 0,
      carbs_g: toNumber(hit.carbs_g) ?? 0,
      fat_g: toNumber(hit.fat_g) ?? 0,
      kcal: toNumber(hit.kcal) ?? 0,
    }],
    total: {
      protein_g: toNumber(hit.protein_g) ?? 0,
      carbs_g: toNumber(hit.carbs_g) ?? 0,
      fat_g: toNumber(hit.fat_g) ?? 0,
      kcal: toNumber(hit.kcal) ?? 0,
    },
    confidence: hit.confidence ?? 'medium',
    cached: true,
  };
}
