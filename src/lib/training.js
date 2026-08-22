import { bandFor } from './scores';

/**
 * Turns a readiness score into an instruction for the session you are actually
 * about to do.
 *
 * The central point is that the same number means different things for
 * different activities. A gym session is infinitely scalable — drop a set, drop
 * the weight, go home. A 16-over match is not: once you have turned up, you
 * are fielding for sixteen overs whatever your HRV says. So poor readiness
 * before the gym means "do less", and poor readiness before a match means
 * "manage yourself inside it" — bowl a shorter spell, take an easier fielding
 * position, drink more.
 *
 * Advice is deliberately concrete. "Train as tolerated" tells you nothing at
 * 7am; "three working sets instead of five, stop two reps short" is a decision
 * you can act on.
 */

export const ACTIVITIES = {
  gym: { label: 'Gym', emoji: '🏋️', color: '#a855f7' },
  cricket: { label: 'Cricket', emoji: '🏏', color: '#22c55e' },
  run: { label: 'Run', emoji: '🏃', color: '#38bdf8' },
  rest: { label: 'Rest', emoji: '🌙', color: '#64748b' },
  other: { label: 'Session', emoji: '⚡', color: '#eab308' },
};

/** 0 = Sunday, matching Date.getDay(). */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Age from a date of birth, falling back to a stored age for old profiles. */
export function ageFrom(profile) {
  const dob = profile?.date_of_birth;
  if (!dob) return Number(profile?.age) || null;

  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return Number(profile?.age) || null;

  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) years -= 1;
  return years;
}

/** The plan row covering a given date, newest block wins. */
export function sessionFor(plan = [], date = new Date()) {
  const day = date.getDay();
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  const candidates = plan
    .filter((row) => row.weekday === day)
    .filter((row) => row.starts_on <= key && (!row.ends_on || row.ends_on >= key))
    .sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1));

  return candidates[0] ?? null;
}

// ---------------------------------------------------------------------------
// Guidance
// ---------------------------------------------------------------------------

const GYM = {
  excellent: {
    headline: 'Push it',
    detail: 'Top sets, near-maximal work, or a PR attempt. Your body can take it today.',
    actions: [
      'Full working sets at your usual load',
      'Take the heaviest lift close to failure',
      'Add a set to your main movement if it feels good',
    ],
  },
  good: {
    headline: 'Train as planned',
    detail: 'Normal session. Nothing to hold back for, nothing to chase either.',
    actions: [
      'Full volume at your usual working weight',
      'Leave one or two reps in reserve on the last set',
    ],
  },
  moderate: {
    headline: 'Cut the volume, keep the weight',
    detail:
      'Intensity is what drives adaptation; volume is what drives fatigue. Drop the second, protect the first.',
    actions: [
      'Three working sets rather than five',
      'Same load, but stop two or three reps short',
      'Skip the accessory work and finish early',
    ],
  },
  poor: {
    headline: 'Technique day',
    detail:
      'Training hard on a body this depleted buys fatigue without adaptation, and is where most avoidable strains happen.',
    actions: [
      '60–70% of your usual load, crisp reps only',
      'No sets to failure, no new maxes',
      'Twenty minutes is a complete session today',
    ],
  },
  critical: {
    headline: 'Skip it today',
    detail:
      'This is not a "go lighter" day. At this level there is no adaptation to be had — a session now only deepens the hole, and it is where strains and illness start.',
    actions: [
      'No lifting at all, not even light — the bar is not the problem, the recovery is',
      'A twenty-minute easy walk if you want to move, nothing that raises your breathing',
      'Eat a proper meal and get to bed an hour early',
      'Nothing is lost. One skipped session costs you nothing; training through this costs a week',
    ],
  },
};

/**
 * Cricket guidance for an all-rounder in a short-format match.
 *
 * The bowling advice is weighted more heavily than the batting advice because
 * that is where the injury risk sits: repeated near-maximal bowling on a poorly
 * recovered body is a well-known contributor to side and lower-back problems,
 * and unlike batting it is a load you can partly choose.
 */
const CRICKET = {
  excellent: {
    headline: 'Full role',
    detail: 'Take the new ball, bowl your full quota, bat where you are most useful.',
    actions: [
      'Open the bowling if the captain wants it',
      'Full quota of overs, back-to-back spells are fine',
      'Push singles hard — your legs will hold up',
    ],
  },
  good: {
    headline: 'Play your normal game',
    detail: 'Nothing to manage. Bowl your overs, field where you like.',
    actions: [
      'Full quota, split into two spells if you can',
      'Normal fielding position',
    ],
  },
  moderate: {
    headline: 'Manage your overs',
    detail:
      'You cannot scale a match down the way you can a gym session, so the lever is how you spend yourself inside it.',
    actions: [
      'Split your spells — avoid bowling consecutive overs',
      'Lead with batting; that is where you cost yourself least',
      'Take an inner-ring position rather than chasing the boundary',
      'Drink between every over, not just at drinks',
    ],
  },
  poor: {
    headline: 'Tell the captain before the toss',
    detail:
      'Bowling at pace on a body this depleted is where injuries come from, and you will not bowl well anyway. Play, but play within yourself.',
    actions: [
      'Two overs maximum, and only off a shortened run-up',
      'Bat, field at slip or point, skip the outfield',
      'If you are opening the bowling, ask to be first change instead',
      'Extra fluid and salt before you start — open ground, no shade',
    ],
  },
  critical: {
    headline: 'Bat and field only — do not bowl',
    detail:
      'Sixteen overs in the field is already more than this body should be doing. Bowling on top of it, in open sun, is how side strains and back injuries happen.',
    actions: [
      'No overs at all. Tell the captain before the toss, not at the change',
      'Bat if needed, field at slip or point — nothing in the deep',
      'If this is not a fixture you have to play, sit it out',
      'If you feel any tightness, come off. This is not the day to push through it',
    ],
  },
};

const REST = {
  excellent: {
    headline: 'Rest day, and you have earned it',
    detail: 'High readiness on a rest day means the last block is working. Bank it.',
    actions: ['A walk, some mobility, nothing structured'],
  },
  good: {
    headline: 'Rest day',
    detail: 'Nothing required. Light movement if you feel like it.',
    actions: ['Twenty-minute walk keeps the blood moving without cost'],
  },
  moderate: {
    headline: 'Genuine rest',
    detail: 'Your body is asking for the day. Take it as scheduled.',
    actions: ['Walking and mobility only', 'An earlier night than usual'],
  },
  poor: {
    headline: 'Rest, and look at why',
    detail:
      'Low readiness on a rest day means the recovery is not keeping up with the training, or something else is going on — sleep, illness, stress, alcohol.',
    actions: [
      'Complete rest',
      'Check your sleep over the last three nights',
      'If this is a third low day, ease off the next session too',
    ],
  },
  critical: {
    headline: 'Something is going on',
    detail:
      'A reading this low on a day you have not trained is not training fatigue. The usual causes are an infection coming on, a badly broken night, alcohol, or real stress.',
    actions: [
      'Complete rest, and treat tomorrow as a rest day too unless it recovers',
      'Check your resting heart rate — if it is also up, assume you are getting ill',
      'If it stays here for three days with no obvious cause, see a doctor',
    ],
  },
};

const LIBRARY = { gym: GYM, cricket: CRICKET, rest: REST, run: GYM, other: GYM };

/**
 * @param {number|null} readiness
 * @param {string} activity
 * @param {object} context extra signals that override the generic advice
 * @returns {{headline, detail, actions, band, flags}}
 */
export function guidanceFor(readiness, activity = 'gym', context = {}) {
  const key = LIBRARY[activity] ? activity : 'other';

  if (readiness === null || readiness === undefined) {
    return {
      headline: 'No reading this morning',
      detail:
        'Without HRV and resting heart rate there is nothing to base advice on. Go by feel, and check the watch was worn overnight.',
      actions: [],
      band: null,
      flags: [],
    };
  }

  // The published bands stop at "poor" for everything under 40, which is far
  // too wide at the bottom: 38 and 18 are not the same morning. Anything under
  // 25 gets its own tier, because the honest advice there is to not train
  // rather than to train lighter.
  const CRITICAL_BELOW = 25;

  const { effective, adjustment, partOfDay } = adjustForTimeOfDay(readiness, context);
  const band = effective < CRITICAL_BELOW ? 'critical' : bandFor(effective).key;
  const base = LIBRARY[key][band] ?? LIBRARY[key].poor;
  const flags = [];

  if (adjustment < -2) {
    flags.push({
      tone: 'warn',
      text: `You started today at ${readiness} but have already spent a lot of it — for a session now, treat yourself as about ${effective}.`,
    });
  }

  // Signals that matter more than the headline number.
  if (Number(context.sleepHours) > 0 && Number(context.sleepHours) < 6) {
    flags.push({
      tone: 'warn',
      text: `Only ${Number(context.sleepHours).toFixed(1)}h sleep — short sleep blunts reaction time and decision-making before it blunts strength.`,
    });
  }
  if (context.restingHrDelta >= 5) {
    flags.push({
      tone: 'warn',
      text: `Resting heart rate is ${Math.round(context.restingHrDelta)} above baseline, which often shows up a day before you feel unwell.`,
    });
  }
  if (context.consecutiveLowDays >= 3) {
    flags.push({
      tone: 'bad',
      text: `Third low-readiness day in a row. That is accumulated fatigue, not a bad night — take a genuine easy day.`,
    });
  }
  if (activity === 'cricket' && band !== 'poor') {
    flags.push({
      tone: 'info',
      text: 'Open ground: start hydrating an hour before the toss, not at the first drinks break.',
    });
  }

  return { ...base, band, flags, effective, partOfDay, adjustment };
}

/**
 * Readiness is measured overnight, so it describes the body you woke up in.
 * By the evening you have spent some of it, and a session at 7pm lands on a
 * more depleted body than the same session at 7am would have.
 *
 * Load already spent is the only honest proxy we have for that, so an evening
 * session on a day of heavy accumulated load is advised one notch harder than
 * the morning number alone would suggest.
 */
function adjustForTimeOfDay(readiness, context = {}) {
  const hour = Number.isFinite(Number(context.hour)) ? Number(context.hour) : new Date().getHours();
  const load = Number(context.loadSoFar);

  const partOfDay = hour < 11 ? 'morning' : hour < 16 ? 'midday' : 'evening';

  // Mornings need no adjustment — the overnight reading IS the morning state.
  if (partOfDay === 'morning' || !Number.isFinite(load)) {
    return { effective: readiness, adjustment: 0, partOfDay };
  }

  // Only load beyond a normal day's baseline counts against the session.
  const spentBeyondNormal = Math.max(0, load - 50);
  const weight = partOfDay === 'evening' ? 0.3 : 0.15;
  const adjustment = -Math.round(spentBeyondNormal * weight);

  return {
    effective: Math.max(0, Math.min(100, readiness + adjustment)),
    adjustment,
    partOfDay,
  };
}

/** How many days back from today have been below 40. */
export function consecutiveLowDays(scores = [], threshold = 40) {
  const sorted = [...scores].sort((a, b) => (a.date < b.date ? 1 : -1));
  let count = 0;
  for (const row of sorted) {
    if (row.readiness_score === null || row.readiness_score === undefined) break;
    if (row.readiness_score >= threshold) break;
    count += 1;
  }
  return count;
}
