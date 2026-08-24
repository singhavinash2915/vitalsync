import { toNumber, hasNumber } from './scores';

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
