import { toNumber, hasNumber, mean } from './scores';
import { todayKey, shiftKey } from './dates';
import { proteinTarget, proteinSummary } from './nutrition';
import { weeklyVolume } from './strength';
import { cutCheck } from './cutcheck';
import { latestScan } from './body';
import { detectIllnessSignal } from './illness';

/**
 * The week, and the one thing to change.
 *
 * The app holds nearly two and a half thousand days and never volunteers a
 * conclusion — everything has to be gone looking for. This composes what the
 * other modules already compute into a single readable week, and then, more
 * usefully, picks the single most worthwhile change rather than listing six.
 *
 * Everything it reports is measured, and where a measurement is missing it says
 * so instead of quietly averaging over a smaller number. A week with two logged
 * days is a week with two logged days, not a verdict.
 */

const DAYS = 7;

/** Mean of a field over rows in the window, or null if nothing was recorded. */
function windowMean(rows, key, from) {
  const values = rows
    .filter((r) => r.date >= from && r.date <= todayKey() && hasNumber(r[key]))
    .map((r) => toNumber(r[key]));
  return values.length ? { value: mean(values), days: values.length } : null;
}

const DEFAULT_SLEEP_TARGET = 7.5;
const DEFAULT_STEP_TARGET = 8000;

/** The three lifts the coach uses as the strength benchmark, plus the hold. */
const BENCHMARKS = ['Leg press', 'Bench press', 'Lat pulldown', 'Plank'];

/**
 * Sunday's measurement prompt.
 *
 * The programme asks for weight, waist, steps and the benchmark lifts once a
 * week, and a weekly ritual that depends on remembering it is a weekly ritual
 * that stops. It only appears on Sundays, and only lists what is actually
 * missing — a prompt for things already recorded is the fastest way to teach
 * someone to ignore prompts.
 *
 * Photos are deliberately not on this list. The coach asks for them; this app
 * is publicly readable, so the waist measurement stands in for them.
 */
function checkInPrompt({ bodyComposition = [], strengthSets = [] } = {}) {
  const today = todayKey();
  if (new Date(`${today}T12:00:00`).getDay() !== 0) return null;

  const since = shiftKey(today, -6);
  const recent = bodyComposition.filter((r) => r.date >= since);
  const missing = [];

  if (!recent.some((r) => hasNumber(r.weight_kg))) missing.push('weight');
  if (!recent.some((r) => hasNumber(r.waist_cm))) missing.push('waist');

  const liftedSince = new Set(
    strengthSets.filter((r) => r.date >= since).map((r) => String(r.exercise ?? '').toLowerCase())
  );
  const notLifted = BENCHMARKS.filter((n) => !liftedSince.has(n.toLowerCase()));
  if (notLifted.length) missing.push(`${notLifted.join(', ')}`);

  if (!missing.length) return { done: true, missing: [], text: 'Week logged — weight, waist and the benchmark lifts are all in.' };

  return {
    done: false,
    missing,
    text: `Sunday check-in. Still to record this week: ${missing.join('; ')}.`,
  };
}

export function weeklyReview({
  scores = [],
  health = [],
  sleep = [],
  meals = [],
  workouts = [],
  strengthSets = [],
  bodyComposition = [],
  profile = null,
} = {}) {
  const from = shiftKey(todayKey(), -(DAYS - 1));
  const prevFrom = shiftKey(from, -DAYS);

  const readiness = windowMean(scores, 'readiness_score', from);
  const prevReadiness = scores
    .filter((r) => r.date >= prevFrom && r.date < from && hasNumber(r.readiness_score))
    .map((r) => toNumber(r.readiness_score));
  const readinessDelta =
    readiness && prevReadiness.length ? Math.round(readiness.value - mean(prevReadiness)) : null;

  const sleepAvg = windowMean(sleep, 'duration_hours', from);
  const stepAvg = windowMean(health, 'steps', from);

  /*
   * Targets the coach set, with his numbers as the fallback.
   *
   * Sleep and steps were both already tracked and neither had anything to hit,
   * which makes a chart out of something that should be a verdict. The
   * fallbacks are the middle of his ranges (7.5-8 h, 7-10k) so these read
   * correctly whether or not the profile columns have been filled in.
   */
  const sleepGoal = toNumber(profile?.sleep_target_hours) ?? DEFAULT_SLEEP_TARGET;
  const stepGoal = toNumber(profile?.step_target) ?? DEFAULT_STEP_TARGET;
  const target = proteinTarget({ profile, latestScan: latestScan(bodyComposition) });
  const protein = proteinSummary(meals, target.grams, DAYS);
  const volume = weeklyVolume(strengthSets, DAYS);
  const sessions = workouts.filter((w) => w.date >= from && Number(w.duration_mins) > 0);
  const cut = cutCheck({
    scans: bodyComposition,
    sets: strengthSets,
    proteinAverage: protein.average,
    proteinTarget: target.grams,
  });
  const illness = detectIllnessSignal(health);

  /*
   * One recommendation, not six.
   *
   * Ordered by consequence: something medical outranks a training tweak, and a
   * training tweak outranks a logging nag. A list of six things to fix is a
   * list nobody acts on, so only the top one is returned.
   */
  const candidates = [
    illness && {
      priority: 0,
      text:
        illness.level === 'likely'
          ? `Your breathing rate has been up ${illness.respiratoryDelta}% for ${illness.days} nights. Rest until it settles — that outranks everything else here.`
          : `Breathing rate is mildly up. Keep this week easy and look again in a few days.`,
    },
    cut?.verdict === 'losing-muscle' && {
      priority: 1,
      text: 'You are losing muscle alongside the fat. Ease the deficit and get protein up — that is the outcome this whole plan exists to avoid.',
    },
    protein.average !== null &&
      protein.average < target.grams * 0.85 && {
        priority: 2,
        text: `Protein averaged ${protein.average} g against a ${target.grams} g target. In a deficit that is the difference between losing fat and losing muscle — one extra scoop or a bowl of curd a day closes most of it.`,
      },
    volume.length > 0 &&
      volume.every((v) => !v.enough) && {
        priority: 3,
        text: `No muscle group hit ${volume[0].target} working sets this week. Holding 37 kg of muscle through a cut takes roughly that per group — the easiest fix is another set on the lifts you already do.`,
      },
    readinessDelta !== null &&
      readinessDelta <= -8 && {
        priority: 4,
        text: `Readiness fell ${Math.abs(readinessDelta)} points against last week. Something is accumulating — look at sleep before you look at the programme.`,
      },
    sleepAvg &&
      sleepAvg.value < sleepGoal - 0.75 && {
        priority: 5,
        text: `Sleep averaged ${sleepAvg.value.toFixed(1)}h against a ${sleepGoal}h target. Your own data says duration does not move your HRV much, so this is not about tomorrow's score — it is about the deficit being survivable, and it is the single biggest thing on this page you can change.`,
      },
    stepAvg &&
      stepAvg.value < stepGoal * 0.75 && {
        priority: 6,
        text: `Steps averaged ${Math.round(stepAvg.value).toLocaleString()} a day against ${stepGoal.toLocaleString()}. That gap is roughly ${Math.round((stepGoal - stepAvg.value) * 0.04)} kcal a day of the deficit you are otherwise trying to find in food.`,
      },
    protein.loggedDays < 7 && {
      priority: 7,
      text: `Only ${protein.loggedDays} of ${DAYS} days had food logged, so the protein figure above is thin. A few more days makes it worth acting on.`,
    },
    { priority: 9, text: 'Nothing obviously needs changing. Keep doing what you did.' },
  ].filter(Boolean);

  const focus = candidates.sort((a, b) => a.priority - b.priority)[0];

  return {
    from,
    to: todayKey(),
    readiness: readiness ? { value: Math.round(readiness.value), days: readiness.days, delta: readinessDelta } : null,
    sleep: sleepAvg
      ? { value: Math.round(sleepAvg.value * 10) / 10, days: sleepAvg.days, target: sleepGoal }
      : null,
    steps: stepAvg
      ? { value: Math.round(stepAvg.value), days: stepAvg.days, target: stepGoal }
      : null,
    protein: { ...protein, target: target.grams },
    volume,
    sessions: sessions.length,
    sessionMinutes: sessions.reduce((sum, w) => sum + Number(w.duration_mins ?? 0), 0),
    strengthSets: strengthSets.filter((s) => s.date >= from && !s.is_warmup).length,
    cut,
    focus: focus.text,
    checkIn: checkInPrompt({ bodyComposition, strengthSets }),
    // Said plainly so a thin week is never mistaken for a good one.
    coverage: {
      scored: readiness?.days ?? 0,
      food: protein.loggedDays,
      of: DAYS,
    },
  };
}

export { DAYS as REVIEW_DAYS };
