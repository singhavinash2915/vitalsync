/**
 * The 12-week programme, as written by the coach.
 *
 * This replaces the cricket-oriented templates the app used to prescribe. Those
 * were mine; this is a specific plan from someone who has seen the person, and
 * an app giving different advice from the coach is worse than an app giving
 * none — so where they disagreed, this wins.
 *
 * The rep range on every exercise is load-bearing, not decoration: double
 * progression reads it to decide whether the next session adds weight or chases
 * a rep. `sets × [min, max]` is the contract `suggestNextLoad` depends on.
 *
 * Priorities it is built around, in the coach's order: body recomposition, fat
 * loss toward 83–84 kg, muscle and strength, leg strength, core, stamina.
 */

/** Cardio is prescribed as incline walking — the knee does not want running. */
const CARDIO = {
  walk: (mins) => `Treadmill incline walk — ${mins} min`,
  mixed: (mins) => `Treadmill or cycle — ${mins} min`,
};

const WARMUP = { name: 'Warm-up', sets: null, reps: null, note: '5–7 min, raise the heart rate and open the hips' };

/**
 * The five-day split. Runs while gym is the whole week.
 * Keys are `Date.getDay()` — 0 is Sunday.
 */
export const FIVE_DAY = {
  1: {
    role: 'Legs — strength',
    focus: 'The heaviest day of the week, and the one leg strength actually comes from',
    part: 'legs',
    cardio: CARDIO.walk(10),
    exercises: [
      WARMUP,
      { name: 'Leg press', sets: 4, reps: [8, 10] },
      { name: 'Back squat', sets: 3, reps: [8, 10], note: 'goblet squat is fine if the bar is not' },
      { name: 'Romanian deadlift', sets: 3, reps: [8, 10] },
      { name: 'Hamstring curl', sets: 3, reps: [10, 12] },
      { name: 'Standing calf raise', sets: 3, reps: [12, 15] },
    ],
  },
  2: {
    role: 'Push — chest, shoulders, triceps',
    focus: 'Upper body pressing',
    part: 'chest',
    cardio: CARDIO.mixed(10),
    exercises: [
      WARMUP,
      { name: 'Bench press', sets: 4, reps: [8, 10] },
      { name: 'Incline dumbbell press', sets: 3, reps: [10, 10] },
      { name: 'Overhead press', sets: 3, reps: [8, 10] },
      { name: 'Lateral raise', sets: 3, reps: [12, 15] },
      { name: 'Triceps pushdown', sets: 3, reps: [10, 12] },
    ],
  },
  3: {
    role: 'Pull + core — back, biceps',
    focus: 'The back half of the body, plus the core work that protects the rest',
    part: 'back',
    cardio: CARDIO.mixed(12),
    exercises: [
      WARMUP,
      { name: 'Lat pulldown', sets: 4, reps: [8, 12] },
      { name: 'Seated cable row', sets: 3, reps: [10, 10] },
      { name: 'One-arm dumbbell row', sets: 3, reps: [10, 10], note: 'each side' },
      { name: 'Face pull', sets: 3, reps: [12, 15] },
      { name: 'Dumbbell curl', sets: 3, reps: [10, 12] },
      { name: 'Cable curl', sets: 2, reps: [12, 12] },
      { name: 'Plank', sets: 3, reps: null, note: '30–45 seconds' },
      { name: 'Dead bug', sets: 3, reps: [10, 10], note: 'each side' },
    ],
  },
  4: {
    role: 'Legs + core — hypertrophy',
    focus: 'Leg volume, deliberately not a second maximum-strength day',
    part: 'legs',
    cardio: CARDIO.walk(10),
    exercises: [
      WARMUP,
      { name: 'Leg press', sets: 3, reps: [10, 12] },
      { name: 'Bulgarian split squat', sets: 3, reps: [8, 10], note: 'each leg' },
      { name: 'Hip thrust', sets: 3, reps: [10, 12] },
      { name: 'Leg extension', sets: 3, reps: [12, 15] },
      { name: 'Hamstring curl', sets: 3, reps: [12, 12] },
      { name: 'Hanging leg raise', sets: 3, reps: [10, 15], note: 'knee raises are fine' },
      { name: 'Pallof press', sets: 3, reps: [10, 10], note: 'each side' },
    ],
  },
  5: {
    role: 'Full body + conditioning',
    focus: 'Everything once through, then the longest cardio of the week',
    part: 'full body',
    cardio: CARDIO.walk(15),
    exercises: [
      WARMUP,
      { name: 'Goblet squat', sets: 3, reps: [10, 10] },
      { name: 'Bench press', sets: 3, reps: [10, 10], note: 'or machine chest press' },
      { name: 'Lat pulldown', sets: 3, reps: [10, 10] },
      { name: 'Romanian deadlift', sets: 3, reps: [10, 10], note: 'dumbbells' },
      { name: 'Lateral raise', sets: 3, reps: [12, 12] },
      { name: 'Seated cable row', sets: 3, reps: [10, 10] },
    ],
  },
};

/**
 * The three-day version, for once cricket takes Tuesday, Thursday and Saturday.
 *
 * Legs, Push, Pull — the Thursday leg day and the Friday full-body drop out.
 * That is roughly a third of the weekly leg volume gone, which is worth knowing
 * given leg strength is high on the priority list; the Monday session is
 * lengthened slightly to claw some of it back.
 */
export const THREE_DAY = {
  1: {
    ...FIVE_DAY[1],
    role: 'Legs — strength',
    focus: 'The only heavy leg day this week, so it carries more than usual',
    exercises: [
      ...FIVE_DAY[1].exercises,
      { name: 'Bulgarian split squat', sets: 2, reps: [8, 10], note: 'each leg — covering the lost Thursday' },
    ],
  },
  3: { ...FIVE_DAY[2], role: 'Push — chest, shoulders, triceps' },
  5: { ...FIVE_DAY[3], role: 'Pull + core — back, biceps' },
};

/** Recovery days are a walk, not a session. */
export const RECOVERY = {
  role: 'Recovery',
  focus: 'Walking, and the steps that the desk does not give you',
  part: null,
  cardio: null,
  exercises: [{ name: 'Walk', sets: null, reps: null, note: '20–40 min, easy' }],
};

/**
 * Which block applies on a date.
 *
 * Keyed off how the training plan describes the week rather than the calendar:
 * a week containing cricket is a three-day gym week, whatever the month says.
 */
export function blockFor(plan = [], date = new Date()) {
  const iso = date.toISOString().slice(0, 10);
  const active = plan.filter((b) => b.starts_on <= iso && (!b.ends_on || b.ends_on >= iso));
  const hasCricket = active.some((b) => b.activity === 'cricket');
  return hasCricket ? THREE_DAY : FIVE_DAY;
}

/** The session for a date, or null when the plan says rest. */
export function sessionFromProgramme(plan = [], date = new Date()) {
  const block = blockFor(plan, date);
  return block[date.getDay()] ?? null;
}

/** Flattens a programme day into the block shape the coach card renders. */
export function toBlocks(day) {
  if (!day) return [];
  const line = (e) => {
    if (!e.sets) return e.note ? `${e.name} — ${e.note}` : e.name;
    // A timed hold has no rep count, so the note becomes the prescription. It
    // still has to read as "N × something": the lift picker finds the movement
    // name by stripping from the first "N ×" onward, and a line shaped any
    // other way turns into a button labelled "Plank 3 (30-45 seconds)".
    if (!e.reps) return `${e.name} ${e.sets} × ${e.note ?? 'as prescribed'}`;
    const range = e.reps[0] === e.reps[1] ? `×${e.reps[0]}` : `×${e.reps[0]}–${e.reps[1]}`;
    return `${e.name} ${e.sets}${range}${e.note ? ` (${e.note})` : ''}`;
  };

  const warmup = day.exercises.filter((e) => e.name === 'Warm-up');
  const main = day.exercises.filter((e) => e.name !== 'Warm-up');

  return [
    warmup.length ? { name: 'Prime', items: warmup.map(line) } : null,
    { name: 'Main', items: main.map(line) },
    day.cardio ? { name: 'Cardio', items: [day.cardio] } : null,
  ].filter(Boolean);
}

/** Rep range for one exercise on a given day, for double progression. */
export function repRangeFor(day, exerciseName) {
  const hit = day?.exercises?.find(
    (e) => e.name.toLowerCase() === String(exerciseName ?? '').toLowerCase()
  );
  return hit?.reps ?? null;
}

/**
 * The rep range for a lift anywhere in the programme.
 *
 * Double progression needs the range even when the lift is logged on a day it
 * was not prescribed — someone doing Friday's bench on a Saturday is still
 * doing the programme. Where a lift appears on more than one day at different
 * ranges (leg press is 8–10 on Monday and 10–12 on Thursday), the widest span
 * is returned, which is the forgiving direction: it holds the weight a rep
 * longer rather than adding load early.
 */
export function rangeForExercise(name) {
  const wanted = String(name ?? '').toLowerCase();
  const found = Object.values(FIVE_DAY)
    .flatMap((d) => d.exercises)
    .filter((e) => e.name.toLowerCase() === wanted && e.reps);
  if (!found.length) return null;
  return [Math.min(...found.map((e) => e.reps[0])), Math.max(...found.map((e) => e.reps[1]))];
}
