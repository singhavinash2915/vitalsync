import { bandFor } from './scores';
import { shiftKey, todayKey } from './dates';
import { sessionFor, ageFrom } from './training';
import { detectIllnessSignal } from './illness';
import { suggestNextLoad } from './strength';
import { activeLimits, applyLimitsToBlocks, cricketLimitNote, LIMITS } from './limits';
import { sessionFromProgramme, toBlocks, RECOVERY } from './programme';

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
 * The gym week no longer lives here. It is the coach's 12-week programme, in
 * `programme.js`, and the templates that used to sit at this spot were mine —
 * built for a cricket all-rounder rather than for body recomposition. An app
 * that argues with the person's actual coach is worse than one that says
 * nothing, so what this file does now is scale the coach's session to the
 * morning's reading, not choose a different one.
 */

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
export function bandKey(readiness, illness = null) {
  const scored = !Number.isFinite(Number(readiness))
    ? 'moderate'
    : Number(readiness) < 25
      ? 'critical'
      : bandFor(readiness).key;

  // Matches the dashboard card: a likely infection is a rest day outright, and
  // a milder signal costs one band. The written session and the morning
  // guidance must not disagree about whether to train.
  if (illness?.level === 'likely') return 'critical';
  if (illness) {
    const order = ['excellent', 'good', 'moderate', 'poor', 'critical'];
    const i = order.indexOf(scored);
    return i < 0 ? scored : order[Math.min(i + 1, order.length - 1)];
  }
  return scored;
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
  illness = null,
  date = todayKey(),
} = {}) {
  const session = sessionFor(plan, new Date(`${date}T12:00:00`));
  const activity = session?.activity ?? 'rest';
  const band = bandKey(readiness, illness);
  const limits = activeLimits(profile);
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

  if (illness) {
    notes.push({
      tone: illness.level === 'likely' ? 'bad' : 'warn',
      text:
        illness.level === 'likely'
          ? `Breathing rate up ${illness.respiratoryDelta}% for ${illness.days} nights${illness.corroborated ? ', with resting heart rate up too' : ''}. This is a rest day regardless of the score.`
          : `Breathing rate up ${illness.respiratoryDelta}% for ${illness.days} nights — one notch easier than planned, and look again tomorrow.`,
    });
  }

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
          : [{ name: 'Optional', items: toBlocks(RECOVERY)[0].items }],
      rationale:
        band === 'critical'
          ? 'A reading this low on a day you have not trained is not training fatigue. Look at sleep, illness and stress before you look at your programme.'
          : 'Rest is the session. Adaptation happens now, not in the gym.',
      notes,
      substitutions: [],
    };
  }

  if (activity === 'cricket') {
    const banded = CRICKET_OVERS[band];
    const kneeNote = cricketLimitNote(limits);
    if (kneeNote) notes.push(kneeNote);

    // A full run-up is a sprint. Whatever the morning's number says, it cannot
    // unlock one while the knee is restricted, so the band sets the volume and
    // the limit sets the approach.
    const overs = limits.includes('no_sprinting')
      ? {
          overs: `${banded.overs.replace(/full run-up/i, 'off a walking run-up').replace(/, and only off a short run/i, ', off a walking run-up')}`,
          field: 'Slip, point or inside the ring — nothing in the deep',
        }
      : banded;
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
      substitutions: [],
    };
  }

  // --- gym ------------------------------------------------------------------
  const when = new Date(`${date}T12:00:00`);
  const template = sessionFromProgramme(plan, when) ?? RECOVERY;
  let blocks = toBlocks(template);

  if (scale.volume === 0) {
    blocks = [{ name: 'Instead of the session', items: ['20–30 min easy walk', 'Mobility, 10 min'] }];
  } else if (scale.volume <= 0.5) {
    // The lifting gets halved, but the walk stays. Cardio is the fat-loss half
    // of this programme and it costs almost nothing to recover from — cutting
    // it on a bad morning would trade the wrong thing away.
    blocks = blocks
      .filter((b) => b.name !== 'Cardio')
      .concat([{ name: 'Cardio', items: ['Easy walk, 10 min — keep it conversational'] }]);
  }

  // Legs the day before a match is the one swap worth making unprompted.
  if (ahead?.inDays === 1 && template.part === 'legs' && scale.volume > 0) {
    notes.push({
      tone: 'warn',
      text: 'You have a match tomorrow and today is a leg day. Keep the main lift but halve the sets — dead legs cost you more between the wickets than the session buys you.',
    });
  }

  const skipping = scale.volume === 0;

  // Restricted movements are swapped before the session is shown, and the swap
  // is carried out to the UI so it appears as a labelled substitution rather
  // than a session that quietly lost its power work.
  const { blocks: safeBlocks, substitutions } = applyLimitsToBlocks(blocks, limits);
  blocks = safeBlocks;

  return {
    date,
    activity,
    band,
    title: skipping ? 'Skip the session' : template.role,
    subtitle: scale.label,
    // Both describe work that is not happening today, so neither belongs on a
    // card that is telling him not to train.
    focus: skipping ? null : template.focus,
    duration: skipping ? null : Math.round(60 * scale.volume),
    skipped: skipping,
    blocks,
    rationale:
      skipping
        ? 'There is no adaptation available at this level. A session now only deepens the hole.'
        : `${scale.note} Today is ${template.role.toLowerCase()} — ${template.focus.toLowerCase()}.`,
    notes,
    substitutions,
    ageNote: profile && ageFrom(profile) ? `Programmed for ${ageFrom(profile)}` : null,
  };
}

/**
 * Best available description of the athlete when the profile does not say.
 *
 * The plan is the most honest signal we have: somebody with cricket days in
 * their week is training for cricket, and somebody with only gym days is not.
 */
function describeAthlete(plan = []) {
  const activities = new Set(plan.map((b) => b.activity).filter(Boolean));
  if (activities.has('cricket')) {
    return 'cricket all-rounder — bats, bowls seam, 16-over matches on open ground';
  }
  if (activities.has('gym')) return 'trains in the gym, no sport specified';
  return 'general fitness, no sport specified';
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

  const illness = detectIllnessSignal(health);
  const limits = activeLimits(profile);

  return {
    today: todayKey(),
    // Named so the model refuses to suggest a restricted movement, rather than
    // relying on it to infer the restriction from a session that lacks one.
    ...(limits.length
      ? { trainingLimits: limits.map((k) => `${LIMITS[k].label}: ${LIMITS[k].detail}`) }
      : {}),
    // Present only when it fires, so its absence is not mistaken for a clean
    // bill of health the data cannot actually give.
    ...(illness
      ? {
          illnessSignal: {
            level: illness.level,
            respiratoryDeltaPct: illness.respiratoryDelta,
            restingHrDeltaPct: illness.restingHrDelta,
            nights: illness.days,
          },
        }
      : {}),
    age: profile ? ageFrom(profile) : null,
    // Describes whoever is signed in, not whoever built the app — a second
    // account must not be coached as a cricketer because the owner is one.
    athlete: profile?.sport?.trim() || describeAthlete(plan),
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

export { SCALING, CRICKET_OVERS };


/**
 * Today's prescription as concrete lifts and loads.
 *
 * The dashboard card's bullets were canned strings picked by band — "three
 * working sets rather than five" said the same thing whoever you were and
 * whatever you had lifted last week. Now that sets are logged, the same advice
 * can name the actual movement and the actual weight, which is the difference
 * between a principle and an instruction.
 *
 * Falls back to the written prescription for any lift with no history, because
 * a first session has nothing to progress from and inventing a number would be
 * worse than a general cue.
 *
 * @returns {string[]|null} null when there is no session to describe
 */
export function concreteActions({ session, sets = [], scale = 1 }) {
  if (!session || session.skipped || session.activity !== 'gym') return null;

  const main = (session.blocks ?? []).find((b) => b.name === 'Main');
  if (!main?.items?.length) return null;

  const out = [];
  for (const item of main.items) {
    // "Box squat to parallel 4×5 @ RPE 7" -> lift name, then its own scheme.
    const name = item.replace(/[,–—-]?\s*\d+\s*×.*$/i, '').replace(/[,;:\s]+$/, '').trim() || item;
    const suggestion = suggestNextLoad(sets, name);

    if (!suggestion) {
      // No history for this lift, so there is nothing to progress from. Show
      // the written prescription, minus the punctuation a substitution leaves
      // behind ("Split squat to a pad, 3×10 each leg").
      out.push(item.replace(/,(\s*\d+\s*×)/, '$1'));
      continue;
    }

    const sets_ = Math.max(2, Math.round(3 * scale));
    const change =
      suggestion.change > 0
        ? ` (up ${suggestion.change} kg)`
        : suggestion.change < 0
          ? ` (down ${Math.abs(suggestion.change)} kg)`
          : '';
    out.push(`${name}: ${suggestion.weight} kg × ${suggestion.reps}, ${sets_} sets${change}`);
  }

  return out.length ? out : null;
}
