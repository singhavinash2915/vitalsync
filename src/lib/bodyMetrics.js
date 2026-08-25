import { toNumber, hasNumber } from './scores';

/**
 * Every number on the InBody printout, and what it actually means.
 *
 * The sheet hands back fifteen figures and explains almost none of them, so
 * most of it goes unread — "SMI 8.4 kg/m²" is not information until someone
 * says what it is for. Each entry here carries the plain-English meaning, why
 * it is worth watching, and the reference band the machine prints beside it.
 *
 * The bands are InBody's own for an adult male and match the printout they came
 * from. They are *population* ranges, which is the opposite of how the rest of
 * this app works — every score elsewhere is measured against your own baseline,
 * because a HRV of 45ms is excellent for one person and a warning for another.
 * The same caution applies here: the range says where most people sit, not
 * where you should be. The direction of travel between two scans is the part
 * that is genuinely about you.
 */

/** `range` is [low, high]; `better` says which way is good when it matters. */
export const BODY_METRICS = [
  {
    key: 'weight_kg',
    label: 'Weight',
    unit: 'kg',
    group: 'headline',
    range: [60.6, 82.0],
    what: 'Everything on the scale — muscle, fat, water, bone and whatever you last ate.',
    why: 'On its own it cannot tell you whether a kilo lost was fat or muscle, which is the entire reason the rest of this sheet exists.',
  },
  {
    key: 'body_fat_pct',
    label: 'Percent body fat',
    unit: '%',
    group: 'headline',
    range: [10, 20],
    better: 'lower',
    what: 'How much of your weight is fat, as a percentage.',
    why: 'The number that actually moves when a cut is working. It can fall while weight stays flat, which is muscle being gained as fat is lost.',
  },
  {
    key: 'skeletal_muscle_kg',
    label: 'Skeletal muscle mass',
    unit: 'kg',
    group: 'headline',
    range: [33, 41],
    better: 'higher',
    what: 'The muscle you can actually train — not counting organ or smooth muscle.',
    why: 'The one to defend. Your scan advised losing 10.7 kg of fat and 0.0 kg of muscle, and this is the number that says whether that is happening.',
  },
  {
    key: 'body_fat_mass_kg',
    label: 'Body fat mass',
    unit: 'kg',
    group: 'headline',
    range: [8.6, 17.1],
    better: 'lower',
    what: 'The same fat as a weight rather than a percentage.',
    why: 'Easier to reason about than a percentage when you are trying to lose a specific amount — a kilo here is a kilo off the target.',
  },

  {
    key: 'fat_free_mass_kg',
    label: 'Fat free mass',
    unit: 'kg',
    group: 'composition',
    range: [54.5, 66.6],
    better: 'higher',
    what: 'Everything that is not fat: muscle, bone, organs and water.',
    why: 'Your protein target is calculated from this rather than bodyweight, because the requirement comes from the tissue being protected.',
  },
  {
    key: 'total_body_water_l',
    label: 'Total body water',
    unit: 'L',
    group: 'composition',
    range: [40.0, 49.0],
    what: 'All the water in you, inside and outside the cells.',
    why: 'Moves with hydration, salt and time of day, which is why two scans taken at different times are not strictly comparable. Scan in the same state each time.',
  },
  {
    key: 'protein_kg',
    label: 'Protein',
    unit: 'kg',
    group: 'composition',
    range: [10.7, 13.1],
    better: 'higher',
    what: 'The solid protein content of your muscle, water excluded.',
    why: 'Falls before visible muscle does when protein intake is short, so it is an early warning that a deficit is too steep.',
  },
  {
    key: 'mineral_kg',
    label: 'Mineral',
    unit: 'kg',
    group: 'composition',
    range: [3.71, 4.53],
    what: 'Mostly bone, plus minerals held in blood and tissue.',
    why: 'Changes very slowly. A drop over months is worth mentioning to a doctor; week to week it is noise.',
  },

  {
    key: 'bmi',
    label: 'BMI',
    unit: '',
    group: 'risk',
    range: [18.5, 25.0],
    better: 'lower',
    what: 'Weight divided by height squared.',
    why: 'Blunt by design — it cannot tell muscle from fat, so a muscular person reads "overweight". Treat the body-fat percentage above as the real answer.',
  },
  {
    key: 'visceral_fat_level',
    label: 'Visceral fat level',
    unit: '',
    group: 'risk',
    range: [1, 9],
    better: 'lower',
    what: 'Fat packed around the organs rather than under the skin, on a 1–20 scale.',
    why: 'The metabolically dangerous kind — tied to blood sugar, blood pressure and heart risk. Under 10 is the target, and it responds well to losing fat generally.',
  },
  {
    key: 'waist_hip_ratio',
    label: 'Waist-hip ratio',
    unit: '',
    group: 'risk',
    range: [0.8, 0.9],
    better: 'lower',
    what: 'Waist circumference divided by hip.',
    why: 'A second read on where fat is stored. Above 0.90 for a man points at the abdominal pattern that carries most of the risk.',
  },

  {
    key: 'bmr_kcal',
    label: 'Basal metabolic rate',
    unit: 'kcal',
    group: 'energy',
    range: [1813, 2133],
    better: 'higher',
    what: 'What you would burn in a day doing nothing at all.',
    why: 'The floor of the energy-balance card. It scales with fat-free mass, which is another reason losing muscle in a cut works against you.',
  },
  {
    key: 'smi',
    label: 'Skeletal muscle index',
    unit: 'kg/m²',
    group: 'energy',
    range: [7.0, 11.0],
    better: 'higher',
    what: 'Limb muscle scaled to your height, so tall and short people compare fairly.',
    why: 'The clinical measure for low muscle mass. Below about 7.0 for a man is the threshold doctors use for sarcopenia.',
  },
  {
    key: 'inbody_score',
    label: 'InBody score',
    unit: '/100',
    group: 'energy',
    range: [80, 100],
    better: 'higher',
    what: "The machine's own summary, weighted toward muscle relative to what it expects for your height.",
    why: 'Useful only against your own past scores. Above 80 is its "normal"; a muscular person can pass 100.',
  },
];

/** Where a value sits in its band: 'low' | 'in' | 'high', or null if unknown. */
export function bandFor(metric, value) {
  const v = toNumber(value);
  if (v === null || !metric.range) return null;
  const [lo, hi] = metric.range;
  if (v < lo) return 'low';
  if (v > hi) return 'high';
  return 'in';
}

/**
 * Is being outside the band good or bad here?
 *
 * Sitting above the range is a problem for body fat and a good thing for muscle,
 * so "out of range" alone says nothing without knowing which way is better.
 * Metrics with no `better` (water, mineral) are simply reported as out of range.
 */
export function verdictFor(metric, value) {
  const band = bandFor(metric, value);
  if (!band) return null;
  if (band === 'in') return 'good';
  if (!metric.better) return 'note';
  const goodDirection = metric.better === 'higher' ? 'high' : 'low';
  return band === goodDirection ? 'good' : 'bad';
}

/** Position 0–1 within the band, for drawing a marker. Clamped just outside. */
export function positionIn(metric, value) {
  const v = toNumber(value);
  if (v === null || !metric.range) return null;
  const [lo, hi] = metric.range;
  const span = hi - lo || 1;
  return Math.max(-0.15, Math.min(1.15, (v - lo) / span));
}

/** Change between two scans for one metric, with the direction judged. */
export function deltaFor(metric, current, previous) {
  const a = toNumber(current?.[metric.key]);
  const b = toNumber(previous?.[metric.key]);
  if (a === null || b === null) return null;

  const change = Math.round((a - b) * 100) / 100;
  if (Math.abs(change) < 0.01) return { change: 0, tone: 'flat' };

  const tone = !metric.better
    ? 'flat'
    : (metric.better === 'higher') === change > 0
      ? 'good'
      : 'bad';
  return { change, tone };
}

/** Only the metrics this scan actually carries. */
export const presentMetrics = (scan) => BODY_METRICS.filter((m) => hasNumber(scan?.[m.key]));

export const GROUPS = [
  { key: 'headline', label: 'The four that matter most' },
  { key: 'composition', label: 'What you are made of' },
  { key: 'risk', label: 'Risk markers' },
  { key: 'energy', label: 'Energy and muscle quality' },
];
