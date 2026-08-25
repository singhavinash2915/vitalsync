/**
 * The lift picker's catalogue, grouped the way people think about training.
 *
 * Typing an exercise name on a phone between sets is friction nobody accepts
 * for long, so the flow is body part → list → tap. `muscles` is not decoration:
 * it is what lets weekly volume be counted per muscle group, which is the
 * number that says whether there is enough stimulus to hold muscle through a
 * deficit.
 *
 * `lower` marks lower-body compounds, which progress in larger jumps than
 * upper-body lifts — 2.5 kg on a bench is a real week's work, 2.5 kg on a
 * deadlift is rounding error.
 */

export const BODY_PARTS = [
  { key: 'legs', label: 'Legs', emoji: '🦵' },
  { key: 'chest', label: 'Chest', emoji: '💪' },
  { key: 'back', label: 'Back', emoji: '🔙' },
  { key: 'shoulders', label: 'Shoulders', emoji: '🏋️' },
  { key: 'arms', label: 'Arms', emoji: '💪' },
  { key: 'core', label: 'Core', emoji: '🎯' },
  { key: 'cardio', label: 'Cardio', emoji: '🏃' },
];

export const EXERCISES = [
  // --- legs ----------------------------------------------------------------
  { name: 'Back squat', part: 'legs', muscles: ['quads', 'glutes'], lower: true },
  { name: 'Box squat to parallel', part: 'legs', muscles: ['quads', 'glutes'], lower: true },
  { name: 'Front squat', part: 'legs', muscles: ['quads'], lower: true },
  { name: 'Leg press', part: 'legs', muscles: ['quads', 'glutes'], lower: true },
  { name: 'Goblet squat', part: 'legs', muscles: ['quads', 'glutes'], lower: true },
  { name: 'Romanian deadlift', part: 'legs', muscles: ['hamstrings', 'glutes'], lower: true },
  { name: 'Deadlift', part: 'legs', muscles: ['hamstrings', 'glutes', 'back'], lower: true },
  { name: 'Trap-bar deadlift', part: 'legs', muscles: ['quads', 'glutes', 'back'], lower: true },
  { name: 'Split squat to a pad', part: 'legs', muscles: ['quads', 'glutes'], lower: true },
  { name: 'Bulgarian split squat', part: 'legs', muscles: ['quads', 'glutes'], lower: true },
  { name: 'Walking lunge', part: 'legs', muscles: ['quads', 'glutes'], lower: true },
  { name: 'Hamstring curl', part: 'legs', muscles: ['hamstrings'] },
  { name: 'Leg extension', part: 'legs', muscles: ['quads'] },
  { name: 'Hip thrust', part: 'legs', muscles: ['glutes'], lower: true },
  { name: 'Standing calf raise', part: 'legs', muscles: ['calves'] },
  { name: 'Copenhagen plank', part: 'legs', muscles: ['adductors', 'core'] },

  // --- chest ---------------------------------------------------------------
  { name: 'Bench press', part: 'chest', muscles: ['chest', 'triceps'] },
  { name: 'Incline bench press', part: 'chest', muscles: ['chest', 'shoulders'] },
  { name: 'Incline dumbbell press', part: 'chest', muscles: ['chest', 'shoulders'] },
  { name: 'Dumbbell press', part: 'chest', muscles: ['chest', 'triceps'] },
  { name: 'Dumbbell fly', part: 'chest', muscles: ['chest'] },
  { name: 'Cable fly', part: 'chest', muscles: ['chest'] },
  { name: 'Push-up', part: 'chest', muscles: ['chest', 'triceps'] },
  { name: 'Dip', part: 'chest', muscles: ['chest', 'triceps'] },

  // --- back ----------------------------------------------------------------
  { name: 'Pull-up', part: 'back', muscles: ['lats', 'biceps'] },
  { name: 'Weighted pull-up', part: 'back', muscles: ['lats', 'biceps'] },
  { name: 'Chin-up', part: 'back', muscles: ['lats', 'biceps'] },
  { name: 'Lat pulldown', part: 'back', muscles: ['lats'] },
  { name: 'Barbell row', part: 'back', muscles: ['back', 'lats'] },
  { name: 'Chest-supported row', part: 'back', muscles: ['back'] },
  { name: 'Seated cable row', part: 'back', muscles: ['back'] },
  { name: 'One-arm dumbbell row', part: 'back', muscles: ['back'] },
  { name: 'Face pull', part: 'back', muscles: ['rear delts', 'back'] },
  { name: 'Prone Y-T-W', part: 'back', muscles: ['rear delts', 'back'] },
  { name: 'Farmer carry', part: 'back', muscles: ['back', 'core'] },

  // --- shoulders -----------------------------------------------------------
  { name: 'Overhead press', part: 'shoulders', muscles: ['shoulders', 'triceps'] },
  { name: 'Landmine press', part: 'shoulders', muscles: ['shoulders'] },
  { name: 'Dumbbell shoulder press', part: 'shoulders', muscles: ['shoulders'] },
  { name: 'Lateral raise', part: 'shoulders', muscles: ['shoulders'] },
  { name: 'Cable external rotation', part: 'shoulders', muscles: ['rotator cuff'] },
  { name: 'Band pull-apart', part: 'shoulders', muscles: ['rear delts'] },
  { name: 'Serratus wall slide', part: 'shoulders', muscles: ['serratus'] },

  // --- arms ----------------------------------------------------------------
  { name: 'Barbell curl', part: 'arms', muscles: ['biceps'] },
  { name: 'Dumbbell curl', part: 'arms', muscles: ['biceps'] },
  { name: 'Cable curl', part: 'arms', muscles: ['biceps'] },
  { name: 'Hammer curl', part: 'arms', muscles: ['biceps', 'forearms'] },
  { name: 'Triceps pushdown', part: 'arms', muscles: ['triceps'] },
  { name: 'Skull crusher', part: 'arms', muscles: ['triceps'] },
  { name: 'Overhead triceps extension', part: 'arms', muscles: ['triceps'] },

  // --- core ----------------------------------------------------------------
  { name: 'Plank', part: 'core', muscles: ['core'] },
  { name: 'Side plank', part: 'core', muscles: ['core', 'obliques'] },
  { name: 'Pallof press', part: 'core', muscles: ['core', 'obliques'] },
  { name: 'Dead bug', part: 'core', muscles: ['core'] },
  { name: 'Hanging leg raise', part: 'core', muscles: ['core'] },
  { name: 'Cable rotational press', part: 'core', muscles: ['obliques', 'core'] },

  // --- cardio --------------------------------------------------------------
  { name: 'Bike interval', part: 'cardio', muscles: ['cardio'] },
  { name: 'Rowing machine', part: 'cardio', muscles: ['cardio', 'back'] },
  { name: 'Incline walk', part: 'cardio', muscles: ['cardio'] },
  { name: 'Swim', part: 'cardio', muscles: ['cardio'] },
];

const byName = new Map(EXERCISES.map((e) => [e.name.toLowerCase(), e]));

/** Catalogue entry for a name, or null when it is one of the user's own. */
export const findExercise = (name) => byName.get(String(name ?? '').toLowerCase()) ?? null;

/** Everything for one body part. */
export const exercisesForPart = (part) => EXERCISES.filter((e) => e.part === part);

/** Muscles an exercise trains — falls back to the body part for custom lifts. */
export function musclesFor(name, fallbackPart = null) {
  const known = findExercise(name);
  if (known) return known.muscles;
  return fallbackPart ? [fallbackPart] : [];
}

/** True when a lift should progress in bigger jumps. */
export const isLowerBody = (name) => Boolean(findExercise(name)?.lower);
