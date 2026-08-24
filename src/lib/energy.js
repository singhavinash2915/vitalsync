import { toNumber, mean } from './scores';
import { todayKey, shiftKey } from './dates';
import { dayTotals } from './nutrition';
import { latestScan } from './body';

/**
 * Calories in against calories out.
 *
 * Two numbers the app already holds make this possible without asking for
 * anything new: the InBody scan measured basal metabolic rate, and the watch
 * reports active energy every day. Burn is the sum of the two, intake is the
 * sum of the day's meals, and the gap is the deficit.
 *
 * A warning that belongs next to every figure here rather than buried in a
 * footnote: **this arithmetic drifts.** Wrist-worn active-energy estimates are
 * routinely out by a fifth in either direction, BMR from bioimpedance is an
 * estimate of an estimate, and portion sizes are eyeballed. A daily deficit
 * computed from three approximations is a direction, not a measurement. The
 * scale and the scan are the arbiters — if the numbers here say 700 under and
 * the weight has not moved in a month, the numbers are wrong, not the scale.
 */

/** Energy in a kilogram of body fat. The usual 7,700 kcal figure. */
const KCAL_PER_KG_FAT = 7700;

/** Fallback BMR from the Mifflin-St Jeor equation, when no scan has measured one. */
export function estimateBmr({ weightKg, heightCm, age, sex }) {
  const w = toNumber(weightKg);
  const h = toNumber(heightCm);
  const a = toNumber(age);
  if (!w || !h || !a) return null;
  const base = 10 * w + 6.25 * h - 5 * a;
  return Math.round(sex === 'female' ? base - 161 : base + 5);
}

/**
 * What the body spent on a given day.
 *
 * `active_calories` from Apple Health is energy *above* resting, so adding it
 * to BMR gives the day's total rather than double-counting the baseline.
 */
export function burnFor({ scans = [], health = [], profile = null, date = todayKey() }) {
  const scan = latestScan(scans);
  const bmr =
    toNumber(scan?.bmr_kcal) ??
    estimateBmr({
      weightKg: toNumber(scan?.weight_kg) ?? toNumber(profile?.weight),
      heightCm: toNumber(profile?.height),
      age: toNumber(profile?.age),
      sex: profile?.sex,
    });
  if (!bmr) return null;

  const row = health.find((r) => r.date === date);
  const active = toNumber(row?.active_calories);

  return {
    bmr,
    active,
    // Without an active figure the day is not zero-activity, it is unknown —
    // so the total is reported as BMR-only and flagged rather than guessed.
    total: active === null ? bmr : bmr + active,
    activeKnown: active !== null,
    basis: scan?.bmr_kcal ? 'measured by your scan' : 'estimated from height and weight',
  };
}

/** Intake, burn and the gap between them for one day. */
export function energyBalance({ meals = [], scans = [], health = [], profile = null, date = todayKey() }) {
  const burn = burnFor({ scans, health, profile, date });
  if (!burn) return null;

  const intake = dayTotals(meals, date);
  const logged = intake.meals > 0;

  return {
    date,
    intake: intake.kcal,
    logged,
    burn: burn.total,
    bmr: burn.bmr,
    active: burn.active,
    activeKnown: burn.activeKnown,
    basis: burn.basis,
    // Negative is a deficit. Only meaningful once something has been eaten and
    // logged — an unlogged day would otherwise read as a heroic fast.
    balance: logged ? intake.kcal - burn.total : null,
  };
}

/**
 * The deficit per day implied by a goal and a deadline.
 *
 * Fat loss is the target, so the kilos are converted at the energy density of
 * fat. Deliberately reports the rate as well as the number, because a plan
 * needing more than about 0.75 kg a week is one that takes muscle with it —
 * which is the specific failure this whole feature exists to avoid.
 */
export function deficitTarget({ scans = [], goalWeightKg = null, weeks = 8 }) {
  const scan = latestScan(scans);
  const current = toNumber(scan?.weight_kg);
  const goal = toNumber(goalWeightKg) ?? toNumber(scan?.target_weight_kg);
  if (!current || !goal || goal >= current || weeks <= 0) return null;

  const toLose = current - goal;
  const perWeek = toLose / weeks;
  const perDay = Math.round((toLose * KCAL_PER_KG_FAT) / (weeks * 7));

  return {
    current,
    goal,
    toLose: Math.round(toLose * 10) / 10,
    weeks,
    perWeek: Math.round(perWeek * 100) / 100,
    perDay,
    tooFast: perWeek > 0.75,
  };
}

/** Rolling average balance, over days that were actually logged. */
export function weeklyBalance({ meals = [], scans = [], health = [], profile = null, days = 7 }) {
  const from = shiftKey(todayKey(), -(days - 1));
  const dates = [...new Set(meals.filter((m) => m.date >= from && m.date <= todayKey()).map((m) => m.date))];

  const balances = dates
    .map((date) => energyBalance({ meals, scans, health, profile, date }))
    .filter((b) => b && b.balance !== null);

  if (!balances.length) return { days, loggedDays: 0, average: null };

  return {
    days,
    loggedDays: balances.length,
    average: Math.round(mean(balances.map((b) => b.balance))),
    byDay: balances.sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

/** One honest sentence about today's balance. */
export function balanceSummary(balance, target) {
  if (!balance) return null;
  if (!balance.logged) {
    return {
      tone: 'info',
      text: `Burning about ${balance.burn} kcal today (${balance.bmr} at rest${balance.activeKnown ? ` plus ${balance.active} active` : ', activity not yet synced'}). Log a meal to see the gap.`,
    };
  }

  const gap = balance.balance;
  const need = target?.perDay ?? null;

  if (gap > 0) {
    return {
      tone: 'warn',
      text: `${gap} kcal above your burn today. A surplus is not a disaster on one day — but it is not the direction of travel.`,
    };
  }

  const deficit = Math.abs(gap);
  if (need && deficit >= need * 0.8) {
    return {
      tone: 'good',
      text: `${deficit} kcal under, against the ${need} a day your ${target.goal} kg goal needs. On pace.`,
    };
  }
  return {
    tone: 'info',
    text: need
      ? `${deficit} kcal under. Your goal needs about ${need} a day, so this is short — though remember these are three estimates stacked, and the scale is the real judge.`
      : `${deficit} kcal under your estimated burn today.`,
  };
}

export { KCAL_PER_KG_FAT };
