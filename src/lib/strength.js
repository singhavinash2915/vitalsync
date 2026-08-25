import { toNumber, hasNumber } from './scores';
import { musclesFor, isLowerBody } from './exercises';
import { shiftKey, todayKey } from './dates';

/**
 * What was actually lifted, and whether it is going up.
 *
 * Apple Health already records that a 40-minute strength session happened; it
 * cannot record that the squat went from 80 kg to 85 kg. That gap is the only
 * thing this file exists to close, so everything is keyed on the exercise
 * rather than the session — the useful question is "is my squat moving", not
 * "what did I do on Tuesday".
 */

/**
 * Epley. Estimated one-rep max from a working set.
 *
 * Every 1RM formula drifts badly above about ten reps, where it is really
 * measuring endurance, so sets beyond that are not converted at all rather
 * than converted into a confident-looking wrong number.
 */
export function estimateOneRepMax(weightKg, reps) {
  const w = toNumber(weightKg);
  const r = toNumber(reps);
  if (w === null || r === null || w <= 0 || r < 1 || r > 10) return null;
  return r === 1 ? w : Math.round(w * (1 + r / 30) * 10) / 10;
}

/** Heaviest working set of a group, by estimated 1RM then by load. */
function bestSet(sets = []) {
  const working = sets.filter((s) => !s.is_warmup && hasNumber(s.weight_kg) && hasNumber(s.reps));
  if (!working.length) return null;

  return working.reduce((best, set) => {
    const a = estimateOneRepMax(set.weight_kg, set.reps) ?? toNumber(set.weight_kg);
    const b = estimateOneRepMax(best.weight_kg, best.reps) ?? toNumber(best.weight_kg);
    return a > b ? set : best;
  });
}

/** Groups a flat set list into `{ date, sets, best, volume }` per session. */
export function sessionsFor(sets = [], exercise) {
  const mine = sets.filter(
    (s) => (s.exercise ?? '').toLowerCase() === (exercise ?? '').toLowerCase()
  );
  const byDate = new Map();
  for (const set of mine) {
    if (!byDate.has(set.date)) byDate.set(set.date, []);
    byDate.get(set.date).push(set);
  }

  return [...byDate.entries()]
    .map(([date, group]) => ({
      date,
      sets: group.sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0)),
      best: bestSet(group),
      // Working volume only — warm-ups inflate tonnage without driving anything.
      volume: group
        .filter((s) => !s.is_warmup)
        .reduce((sum, s) => sum + (toNumber(s.weight_kg) ?? 0) * (toNumber(s.reps) ?? 0), 0),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Every exercise logged, most recently trained first. */
export function exerciseList(sets = []) {
  const seen = new Map();
  for (const set of sets) {
    const name = set.exercise;
    if (!name) continue;
    if (!seen.has(name) || seen.get(name) < set.date) seen.set(name, set.date);
  }
  return [...seen.entries()]
    .sort((a, b) => (a[1] < b[1] ? 1 : -1))
    .map(([exercise, lastDate]) => ({ exercise, lastDate }));
}

/**
 * Progress on one lift: the last session against the one before it.
 *
 * Compares estimated 1RM rather than raw load, so 3×5 at 80 kg and 1×3 at 90 kg
 * can be told apart honestly instead of the lighter-but-harder session looking
 * like a regression.
 */
export function progressFor(sets = [], exercise) {
  const sessions = sessionsFor(sets, exercise);
  if (!sessions.length) return null;

  const last = sessions[sessions.length - 1];
  const previous = sessions.length > 1 ? sessions[sessions.length - 2] : null;

  const e1rm = (session) =>
    session?.best ? estimateOneRepMax(session.best.weight_kg, session.best.reps) : null;

  const now = e1rm(last);
  const before = e1rm(previous);
  const delta = now !== null && before !== null ? now - before : null;

  const allTime = sessions
    .map((s) => e1rm(s))
    .filter((v) => v !== null)
    .reduce((a, b) => Math.max(a, b), 0);

  return {
    exercise,
    sessions: sessions.length,
    last,
    previous,
    estimatedMax: now,
    delta,
    isPersonalBest: now !== null && now >= allTime && sessions.length > 1,
    direction: delta === null ? 'unknown' : delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat',
  };
}

/** Sets belonging to one day, grouped by exercise in the order first logged. */
export function setsForDate(sets = [], date) {
  const mine = sets.filter((s) => s.date === date);
  const order = [];
  const byExercise = new Map();
  for (const set of mine) {
    if (!byExercise.has(set.exercise)) {
      byExercise.set(set.exercise, []);
      order.push(set.exercise);
    }
    byExercise.get(set.exercise).push(set);
  }
  return order.map((exercise) => ({
    exercise,
    sets: byExercise.get(exercise).sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0)),
  }));
}


/**
 * What to put on the bar next time — double progression.
 *
 * The coach's rule, and it replaces the RPE-based one this used to run. Weight
 * is held until every working set reaches the TOP of its rep range; only then
 * does it go up, and the reps reset to the bottom. His own worked example:
 *
 *   10 kg for 10, 9, 8   → stay at 10 kg, chase the missing reps
 *   10 kg for 10, 10, 10 → add weight, start again around 8, 8, 8
 *
 * Why this rather than effort: a rep range is observed, an RPE is reported.
 * Double progression cannot be gamed by a generous self-rating on a hard day,
 * and it is what the person is actually being coached to do — an app arguing
 * with the coach is worse than an app that stays quiet.
 *
 * RPE has not gone away; it now answers a different question. The coach wants
 * roughly one to three reps left in the tank, so a run of "Grind" answers is
 * the signal that a weight went up too early, reported separately by
 * `effortWarning` below.
 */
export function suggestNextLoad(sets = [], exercise, repRange = null) {
  const sessions = sessionsFor(sets, exercise);
  if (!sessions.length) return null;

  const last = sessions[sessions.length - 1];
  const working = last.sets.filter((x) => !x.is_warmup && hasNumber(x.weight_kg) && hasNumber(x.reps));
  if (!working.length) return null;

  const load = Math.max(...working.map((x) => toNumber(x.weight_kg)));
  // Only sets at the working weight count — a lighter back-off set is not a
  // failed attempt at the top of the range.
  const atLoad = working.filter((x) => toNumber(x.weight_kg) === load);
  const reps = atLoad.map((x) => toNumber(x.reps));
  const lowest = Math.min(...reps);
  const step = isLowerBody(exercise) ? 5 : 2.5;

  // Without a prescribed range there is nothing to progress against, so fall
  // back to reporting what was done rather than inventing a target.
  if (!repRange) {
    return {
      weight: load,
      reps: Math.max(...reps),
      change: 0,
      reason: `Last time ${load} kg for ${reps.join(', ')}. No rep range set for this lift, so repeat and see.`,
    };
  }

  const [min, max] = repRange;
  const clearedTop = reps.length >= 1 && lowest >= max;

  if (clearedTop) {
    return {
      weight: load + step,
      reps: min,
      change: step,
      reason: `Every set reached ${max} at ${load} kg, so the range is done. Add ${step} kg and start again around ${min}.`,
    };
  }

  return {
    weight: load,
    reps: Math.min(max, lowest + 1),
    change: 0,
    reason: `Last time ${reps.join(', ')} at ${load} kg. Same weight — the weight goes up when every set reaches ${max}.`,
  };
}

/**
 * Whether the effort ratings say the weight went up too soon.
 *
 * Separate from the load rule on purpose. The coach's target is one to three
 * reps left in the tank, which is RPE 7 to 9; a run of harder answers than that
 * means the last increase was premature, and that is worth saying before the
 * lift stalls rather than after.
 */
export function effortWarning(sets = [], exercise, sessionsToCheck = 2) {
  const sessions = sessionsFor(sets, exercise).slice(-sessionsToCheck);
  if (sessions.length < sessionsToCheck) return null;

  const graded = sessions.map((s) =>
    s.sets.filter((x) => !x.is_warmup && hasNumber(x.rpe)).map((x) => toNumber(x.rpe))
  );
  if (graded.some((g) => !g.length)) return null;

  const allGrinding = graded.every((g) => Math.max(...g) >= 9);
  if (!allGrinding) return null;

  return `Every set has been a grind for ${sessionsToCheck} sessions. That is past the one-to-three-reps-in-reserve the plan asks for — take 5% off and rebuild rather than waiting for it to stall.`;
}

/**
 * A lift that has stopped moving, and the likeliest reason from the user's data.
 *
 * "You have stalled" on its own is not useful. Under-eating, under-recovering
 * and simply needing a deload all look identical in the set log and call for
 * opposite responses, so the diagnosis is read off the other tables rather than
 * guessed at.
 */
export function detectStall(sets = [], exercise, { nutrition = [], scores = [], proteinTarget = null } = {}) {
  const sessions = sessionsFor(sets, exercise);
  if (sessions.length < 3) return null;

  const recent = sessions.slice(-3);
  const maxes = recent
    .map((s) => (s.best ? estimateOneRepMax(s.best.weight_kg, s.best.reps) : null))
    .filter((v) => v !== null);
  if (maxes.length < 3) return null;

  // Flat or falling across three sessions. A rounding-sized gain is not progress.
  if (maxes[maxes.length - 1] > maxes[0] + 1) return null;

  const since = recent[0].date;
  const window = (rows) => rows.filter((r) => r.date >= since && r.date <= todayKey());

  const proteinDays = window(nutrition).filter((r) => hasNumber(r.protein_g));
  const lowProtein =
    proteinTarget && proteinDays.length >= 3
      ? proteinDays.filter((r) => toNumber(r.protein_g) < proteinTarget * 0.85).length / proteinDays.length > 0.5
      : false;

  const readiness = window(scores).map((r) => toNumber(r.readiness_score)).filter((v) => v !== null);
  const poorRecovery = readiness.length >= 3 && readiness.filter((v) => v < 45).length / readiness.length > 0.5;

  const cause = lowProtein
    ? {
        cause: 'protein',
        detail: `Protein has been under target on most logged days since ${since}. A lift cannot progress on tissue you are not feeding, and this is the cheapest thing on the list to fix.`,
      }
    : poorRecovery
      ? {
          cause: 'recovery',
          detail: `Readiness has been low through this block. The programme is not the problem — the recovery underneath it is.`,
        }
      : {
          cause: 'deload',
          detail: `Nutrition and recovery both look fine, which usually means the lift simply needs a lighter week before it moves again. Drop to about 80% for one session.`,
        };

  return {
    exercise,
    sessions: recent.length,
    from: maxes[0],
    to: maxes[maxes.length - 1],
    since,
    ...cause,
  };
}

/**
 * Working sets per muscle group over the last `days`.
 *
 * Sets, not tonnage — set count is what the maintenance research is expressed
 * in, and roughly 10 hard sets a week per muscle is what holds it through a
 * deficit. Warm-ups are excluded because they drive nothing.
 */
export function weeklyVolume(sets = [], days = 7) {
  const from = shiftKey(todayKey(), -(days - 1));
  const counts = new Map();

  for (const set of sets) {
    if (set.date < from || set.date > todayKey() || set.is_warmup) continue;
    for (const muscle of musclesFor(set.exercise)) {
      counts.set(muscle, (counts.get(muscle) ?? 0) + 1);
    }
  }

  const MAINTENANCE_SETS = 10;
  return [...counts.entries()]
    .map(([muscle, count]) => ({
      muscle,
      sets: count,
      enough: count >= MAINTENANCE_SETS,
      target: MAINTENANCE_SETS,
    }))
    .sort((a, b) => b.sets - a.sets);
}
