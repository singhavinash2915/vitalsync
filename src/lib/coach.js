import { bandFor } from './scores';
import { shiftKey, todayKey } from './dates';
import { sessionFor, ageFrom } from './training';

/**
 * The trainer. Where `training.js` says how hard to go, this says what to do.
 *
 * It writes a real session — movements, sets, reps, an intent for each block —
 * for an all-rounder who bats, bowls seam and fields, and whose gym work exists
 * to serve that rather than to be an end in itself. Two things shape every
 * prescription beyond the day's readiness:
 *
 *   1. What is coming. Legs the day before a match is a bad trade however good
 *      the morning reading is, so the plan reads forward before it prescribes.
 *   2. What his own history says. The findings from `discover.js` are passed in
 *      and can override the default caution — most usefully that a single low
 *      morning, for this person, is mostly noise.
 */

const CRICKET_DEMANDS = {
  bowling: 'seam bowling — repeated near-maximal trunk rotation and single-leg braking',
  batting: 'batting — repeat sprints between wickets, rotational power',
  fielding: 'stop-start running and throwing from the deep',
};

/**
 * A six-day block built around a cricket all-rounder rather than a bodybuilder:
 * hinge and squat strength for the base, throwing-shoulder and thoracic work to
 * keep the bowling action healthy, rotational power for bat and ball, and one
 * genuinely aerobic day so sixteen overs in the field is not the hardest thing
 * the body does that week.
 */
const GYM_DAYS = {
  1: {
    role: 'Lower strength',
    focus: 'The base everything else is built on',
    blocks: [
      { name: 'Prime', items: ['5 min bike or skip', 'Leg swings, hip 90/90, ankle rocks'] },
      {
        name: 'Main',
        items: ['Back squat 4×5 @ RPE 7', 'Romanian deadlift 3×8', 'Walking lunge 3×10 each leg'],
      },
      { name: 'Support', items: ['Copenhagen plank 3×20s each side', 'Calf raise 3×12'] },
      { name: 'Finish', items: ['Dead bug 3×10 each side'] },
    ],
  },
  2: {
    role: 'Upper push + bowling shoulder',
    focus: 'Keeping the bowling arm durable, not just strong',
    blocks: [
      { name: 'Prime', items: ['Band pull-apart 2×15', 'Wall slides 2×10'] },
      { name: 'Main', items: ['Bench press 4×6 @ RPE 7', 'Half-kneeling landmine press 3×8 each'] },
      {
        name: 'Support',
        items: ['Cable external rotation 3×12 each', 'Serratus wall slide 3×10', 'Face pull 3×15'],
      },
      { name: 'Finish', items: ['Thoracic rotation 2×8 each side'] },
    ],
  },
  3: {
    role: 'Conditioning + rotational power',
    focus: 'The engine for sixteen overs in the field',
    blocks: [
      { name: 'Prime', items: ['400m easy jog', 'A-skips, high knees, heel flicks'] },
      {
        name: 'Main',
        items: ['6 × 40m stride at 80%, walk back', 'Med-ball rotational throw 4×5 each side'],
      },
      { name: 'Support', items: ['Pallof press 3×12 each', 'Side plank with reach 3×8 each'] },
      { name: 'Finish', items: ['5 min easy spin'] },
    ],
  },
  4: {
    role: 'Lower power',
    focus: 'Speed between the wickets and braking force in the delivery stride',
    blocks: [
      { name: 'Prime', items: ['5 min bike', 'Pogo hops 3×10'] },
      { name: 'Main', items: ['Trap-bar jump 5×3', 'Split squat 3×8 each', 'Nordic curl 3×5'] },
      { name: 'Support', items: ['Single-leg calf raise 3×12 each', 'Hip airplane 2×6 each'] },
      { name: 'Finish', items: ['Ankle mobility 2 min'] },
    ],
  },
  5: {
    role: 'Upper pull',
    focus: 'The back half of the shoulder, which is what saves the front half',
    blocks: [
      { name: 'Prime', items: ['Scap pull-up 2×8', 'Band dislocate 2×10'] },
      { name: 'Main', items: ['Weighted pull-up 4×5', 'Chest-supported row 3×10'] },
      { name: 'Support', items: ['Prone Y-T-W 3×8 each', 'Farmer carry 3×40m'] },
      { name: 'Finish', items: ['Hang from bar 3×20s'] },
    ],
  },
  6: {
    role: 'Full body + cricket skill',
    focus: 'Tie it together while it is still fresh from the week',
    blocks: [
      { name: 'Prime', items: ['Full dynamic warm-up, 8 min'] },
      { name: 'Main', items: ['Deadlift 3×5 @ RPE 7', 'Overhead press 3×8', 'Chin-up 3×max-2'] },
      { name: 'Skill', items: ['Shadow batting 10 min', 'Run-up rhythm without ball, 10 reps'] },
      { name: 'Finish', items: ['10 min easy walk'] },
    ],
  },
  0: {
    role: 'Optional easy day',
    focus: 'Movement, not training',
    blocks: [
      { name: 'Move', items: ['30–40 min walk, or an easy swim', 'Full-body mobility 10 min'] },
    ],
  },
};

/**
 * How the written session survives contact with the morning's reading.
 * `keep` is what to protect when something has to give — intensity drives the
 * adaptation, volume drives the fatigue, so volume is what gets cut first.
 */
const SCALING = {
  excellent: {
    label: 'Full session, and push it',
    volume: 1,
    note: 'Everything as written. This is the morning to add a set or go for a rep PR on the main lift.',
  },
  good: {
    label: 'Full session as written',
    volume: 1,
    note: 'Run the session as programmed. No heroics needed, no cuts needed.',
  },
  moderate: {
    label: 'Cut the volume, keep the weight',
    volume: 0.7,
    note: 'Drop the last set of each main lift and skip the Support block if you are short on time. Same loads.',
  },
  poor: {
    label: 'Prime and Main only, light',
    volume: 0.5,
    note: 'Half the sets, 60–70% of your usual loads, nothing to failure. Skip Support and Finish entirely.',
  },
  critical: {
    label: 'Do not train',
    volume: 0,
    note: 'No session today. The Prime block on its own, as movement, is the most this should be.',
  },
};

const CRICKET_OVERS = {
  excellent: { overs: '4 overs, full run-up', field: 'Anywhere — take the deep' },
  good: { overs: '3–4 overs, full run-up', field: 'Anywhere' },
  moderate: { overs: '2–3 overs, shortened run-up', field: 'Inner ring, avoid the deep' },
  poor: { overs: '2 overs maximum, off a short run', field: 'Slip or point only' },
  critical: { overs: 'None. Tell the captain before the toss', field: 'Slip or point only' },
};

/** Turns a 0–100 score into the band the prescription keys off. */
export function bandKey(readiness) {
  if (!Number.isFinite(Number(readiness))) return 'moderate';
  return Number(readiness) < 25 ? 'critical' : bandFor(readiness).key;
}

/**
 * The forward look. A hard lower-body session the day before a match costs
 * more than it buys, so the plan is allowed to move work rather than only
 * shrink it.
 */
function lookAhead(plan, date) {
  for (let i = 1; i <= 2; i += 1) {
    const key = shiftKey(date, i);
    const session = sessionFor(plan, new Date(`${key}T12:00:00`));
    if (session?.activity === 'cricket') return { inDays: i, activity: 'cricket' };
  }
  return null;
}

/**
 * Builds today's session.
 *
 * @param {object}   input
 * @param {number}   input.readiness   today's readiness score
 * @param {number[]} input.trend       recent readiness scores, oldest first
 * @param {Array}    input.plan        training plan blocks
 * @param {Array}    input.findings    output of discoverFindings()
 * @param {object}   input.profile     user profile, for age
 * @param {string}   input.date        yyyy-MM-dd, defaults to today
 */
export function prescribeSession({
  readiness,
  trend = [],
  plan = [],
  findings = [],
  profile = null,
  date = todayKey(),
} = {}) {
  const session = sessionFor(plan, new Date(`${date}T12:00:00`));
  const activity = session?.activity ?? 'rest';
  const band = bandKey(readiness);
  const scale = SCALING[band];
  const ahead = lookAhead(plan, date);
  const notes = [];

  // A single low morning is, for this body specifically, weak evidence. If the
  // history says so, say so here too rather than cancelling a week on one dip.
  const noisy = findings.find((f) => f.id === 'single-day-vs-run');
  const recent = trend.slice(-3);
  const isolatedDip =
    band !== 'excellent' &&
    recent.length >= 2 &&
    Number(readiness) < 40 &&
    recent.slice(0, -1).some((v) => Number(v) >= 50);

  if (isolatedDip && noisy) {
    notes.push({
      tone: 'info',
      text: 'This is one low morning after a normal run, and on your own record that resolves about half the time by tomorrow. Cut today — do not rewrite the week.',
    });
  }

  if (activity === 'rest') {
    return {
      date,
      activity,
      band,
      title: band === 'critical' ? 'Rest, properly' : 'Rest day',
      subtitle: scale.label,
      duration: null,
      blocks:
        band === 'critical'
          ? [{ name: 'Today', items: ['Nothing structured', 'Eat properly, get to bed early'] }]
          : [{ name: 'Optional', items: GYM_DAYS[0].blocks[0].items }],
      rationale:
        band === 'critical'
          ? 'A reading this low on a day you have not trained is not training fatigue. Look at sleep, illness and stress before you look at your programme.'
          : 'Rest is the session. Adaptation happens now, not in the gym.',
      notes,
    };
  }

  if (activity === 'cricket') {
    const overs = CRICKET_OVERS[band];
    return {
      date,
      activity,
      band,
      title: band === 'critical' ? 'Play, but bowl nothing' : `Match day — ${overs.overs}`,
      subtitle: scale.label,
      duration: null,
      blocks: [
        {
          name: 'Before the toss',
          items: [
            'Full dynamic warm-up — this is not optional on a low reading',
            '10 run-throughs building to match pace',
            'Start hydrating an hour before, not at the first drinks break',
          ],
        },
        { name: 'Bowling', items: [overs.overs, 'Stop if anything tightens — do not bowl through it'] },
        { name: 'Fielding', items: [overs.field] },
        { name: 'Batting', items: ['Bat as normal', 'Call for a runner rather than forcing a third run'] },
        { name: 'After', items: ['10 min easy walk and food inside the hour'] },
      ],
      rationale: `Sixteen overs of ${CRICKET_DEMANDS.fielding} is a load you cannot negotiate once you are on the field, so the bowling is the part you actually control.`,
      notes,
    };
  }

  // --- gym ------------------------------------------------------------------
  const dow = new Date(`${date}T12:00:00`).getDay();
  const template = GYM_DAYS[dow] ?? GYM_DAYS[6];
  let blocks = template.blocks;

  if (scale.volume === 0) {
    blocks = [{ name: 'Instead of the session', items: ['20–30 min easy walk', 'Mobility, 10 min'] }];
  } else if (scale.volume <= 0.5) {
    blocks = blocks.filter((b) => ['Prime', 'Main', 'Move'].includes(b.name));
  } else if (scale.volume <= 0.7) {
    blocks = blocks.filter((b) => b.name !== 'Finish');
  }

  // Legs the day before a match is the one swap worth making unprompted.
  const heavyLower = /Lower/.test(template.role);
  if (ahead?.inDays === 1 && heavyLower && scale.volume > 0) {
    notes.push({
      tone: 'warn',
      text: 'You have a match tomorrow and today is a lower-body day. Keep the main lift but halve the sets — dead legs cost you more between the wickets than the session buys you.',
    });
  }

  const skipping = scale.volume === 0;

  return {
    date,
    activity,
    band,
    title: skipping ? 'Skip the session' : template.role,
    subtitle: scale.label,
    // Both describe work that is not happening today, so neither belongs on a
    // card that is telling him not to train.
    focus: skipping ? null : template.focus,
    duration: skipping ? null : Math.round(75 * scale.volume),
    skipped: skipping,
    blocks,
    rationale:
      skipping
        ? 'There is no adaptation available at this level. A session now only deepens the hole.'
        : `${scale.note} Today is ${template.role.toLowerCase()} — ${template.focus.toLowerCase()}.`,
    notes,
    ageNote: profile && ageFrom(profile) ? `Programmed for ${ageFrom(profile)}` : null,
  };
}

/**
 * Compact, factual brief handed to the language model so its answers are about
 * this body and not about bodies in general. Kept small and pre-summarised on
 * purpose: raw rows would blow the context and invite invention.
 */
export function coachContext({ health = [], sleep = [], scores = [], findings = [], plan = [], profile = null }) {
  const latest = (rows) => (rows.length ? [...rows].sort((a, b) => (a.date < b.date ? -1 : 1)).at(-1) : null);
  const todayHealth = latest(health);
  const todayScores = latest(scores);
  const session = prescribeSession({
    readiness: todayScores?.readiness_score,
    trend: scores.slice(-7).map((s) => s.readiness_score),
    plan,
    findings,
    profile,
  });

  return {
    today: todayKey(),
    age: profile ? ageFrom(profile) : null,
    athlete: 'cricket all-rounder — bats, bowls seam, 16-over matches on open ground',
    latest: {
      date: todayHealth?.date ?? null,
      hrv: todayHealth?.hrv ?? null,
      restingHr: todayHealth?.resting_hr ?? null,
      steps: todayHealth?.steps ?? null,
    },
    scores: todayScores
      ? {
          readiness: todayScores.readiness_score,
          recovery: todayScores.recovery_score,
          sleep: todayScores.sleep_score,
          exertion: todayScores.exertion_score,
        }
      : null,
    readinessLast7: scores.slice(-7).map((s) => ({ date: s.date, readiness: s.readiness_score })),
    sleepLast7: sleep.slice(-7).map((s) => ({ date: s.date, hours: s.duration_hours })),
    plannedToday: { activity: session.activity, prescription: session.title, band: session.band },
    findings: findings.map((f) => ({
      title: f.title,
      headline: f.headline,
      confidence: f.confidence,
      n: f.evidence?.n ?? null,
    })),
  };
}

export { GYM_DAYS, SCALING, CRICKET_OVERS };
