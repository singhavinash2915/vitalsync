import { toNumber, hasNumber, mean } from './scores';
import { bodyTrend } from './body';
import { sessionsFor, estimateOneRepMax, exerciseList } from './strength';

/**
 * Is the cut working?
 *
 * The scan's advice was −10.7 kg of fat and 0.0 kg of muscle, and neither the
 * scale nor the set log can answer that on its own. Weight falling could be
 * either outcome; strength falling could be a bad week or a real loss. Put
 * together they resolve each other, and that combination is the single most
 * useful thing this app can say:
 *
 *   strength holding + fat falling  → it is working, keep going
 *   strength falling + fat falling  → muscle is going too, ease off
 *   strength holding + fat flat     → maintaining, not cutting
 *   strength falling + fat flat     → under-recovered, not under-eating
 *
 * Silent until there is enough of both to mean anything. A verdict off one
 * scan and two sessions would be a guess with a confident face on it.
 */

const MIN_SCANS = 2;
const MIN_LIFTS = 2;
const STRENGTH_NOISE_PCT = 3; // below this, a change in estimated 1RM is nothing

/**
 * Average change in estimated 1RM across the lifts trained often enough to say
 * anything about, as a percentage of where each started.
 *
 * Percentages rather than kilos so a 100 kg squat and a 40 kg press count
 * equally — otherwise the heaviest lift silently becomes the only one measured.
 */
export function strengthTrend(sets = []) {
  const lifts = exerciseList(sets)
    .map(({ exercise }) => {
      const sessions = sessionsFor(sets, exercise);
      if (sessions.length < MIN_LIFTS) return null;

      const first = sessions[0].best;
      const last = sessions[sessions.length - 1].best;
      const from = first ? estimateOneRepMax(first.weight_kg, first.reps) : null;
      const to = last ? estimateOneRepMax(last.weight_kg, last.reps) : null;
      if (!from || !to) return null;

      return { exercise, from, to, changePct: ((to - from) / from) * 100, sessions: sessions.length };
    })
    .filter(Boolean);

  if (!lifts.length) return null;

  const changePct = mean(lifts.map((l) => l.changePct));
  return {
    lifts,
    changePct,
    direction: changePct > STRENGTH_NOISE_PCT ? 'up' : changePct < -STRENGTH_NOISE_PCT ? 'down' : 'holding',
  };
}

/**
 * Combines the two trends into one verdict.
 *
 * @returns {object|null} null while there is not enough of either to judge
 */
export function cutCheck({ scans = [], sets = [], proteinAverage = null, proteinTarget = null } = {}) {
  if (scans.filter((s) => hasNumber(s.weight_kg)).length < MIN_SCANS) return null;

  const body = bodyTrend(scans);
  const strength = strengthTrend(sets);
  if (!body || !strength) return null;

  const fatChange = toNumber(body.fatChange);
  const fatFalling = fatChange !== null && fatChange < -0.3;
  const fatRising = fatChange !== null && fatChange > 0.3;
  const holding = strength.direction !== 'down';

  const pct = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
  const underEating =
    proteinAverage !== null && proteinTarget && proteinAverage < proteinTarget * 0.85;

  /*
   * The coach's rule, and it runs before the scan-based ones because it is
   * better evidence than they are.
   *
   * Waist falling + strength holding or rising = recomposition is working,
   * whatever the scale says. Body weight is the noisiest of the three signals
   * — water, food volume and glycogen move it by a kilo inside a day — and it
   * is also the one most likely to sit flat during exactly the period when
   * muscle is being gained and fat lost at similar rates. A tape measure has
   * none of that noise, which is why he asks for it weekly and calls it the
   * most important indicator.
   *
   * This also means a verdict is available every week rather than only when
   * there is a fresh InBody scan.
   */
  const waist = body.waist;
  if (waist?.falling && holding) {
    const weightNote =
      body.perWeek === null
        ? ''
        : body.perWeek < -0.15
          ? ` Weight is drifting down about ${Math.abs(body.perWeek).toFixed(2)} kg a week, which is the right speed.`
          : body.perWeek > 0.15
            ? ' The scale is up, which at a shrinking waist is muscle, not a problem.'
            : ' The scale is flat, which at a shrinking waist means you are swapping fat for muscle.';
    return {
      verdict: 'working',
      tone: 'good',
      headline: 'Recomposition is working',
      basis: 'waist',
      detail: `Waist down ${Math.abs(waist.change).toFixed(1)} cm over ${waist.weeks} weeks with strength ${pct(strength.changePct)}%.${weightNote} Keep going.`,
      body,
      strength,
    };
  }
  const evidence = `Strength ${pct(strength.changePct)}% across ${strength.lifts.length} lift${strength.lifts.length > 1 ? 's' : ''}, fat mass ${pct(fatChange ?? 0)} kg over ${body.weeks} weeks.`;

  /*
   * The warning half of the same rule.
   *
   * A shrinking waist is only good news while the lifts hold. Falling waist
   * with falling strength is fat and muscle going together, and staying quiet
   * about it until the next InBody scan would mean saying nothing during
   * exactly the weeks it is happening.
   */
  if (waist?.falling && !holding) {
    return {
      verdict: 'losing-muscle',
      tone: 'bad',
      headline: 'Losing muscle along with the fat',
      basis: 'waist',
      detail: `Waist is down ${Math.abs(waist.change).toFixed(1)} cm, but strength is ${pct(strength.changePct)}% across ${strength.lifts.length} lift${strength.lifts.length > 1 ? 's' : ''}. That is the wrong kind of loss.${underEating ? ` Protein is averaging ${Math.round(proteinAverage)} g against a ${proteinTarget} g target, which is the first thing to fix.` : ' Protein looks adequate, so the deficit is probably too steep — take it to about half a kilo a week.'}`,
      body,
      strength,
    };
  }

  if (holding && fatFalling) {
    return {
      verdict: 'working',
      tone: 'good',
      headline: 'The cut is working',
      detail: `${evidence} Fat is coming off while the lifts hold, which is exactly the split the scan asked for. Change nothing.`,
      body,
      strength,
    };
  }

  if (!holding && fatFalling) {
    return {
      verdict: 'losing-muscle',
      tone: 'bad',
      headline: 'Losing muscle along with the fat',
      detail: `${evidence} Both are falling together, which is the outcome the scan's "0.0 kg muscle" line was warning about.${underEating ? ` Protein is averaging ${Math.round(proteinAverage)} g against a ${proteinTarget} g target, which is the first thing to fix.` : ' Protein looks adequate, so the deficit itself is probably too steep — take it to about half a kilo a week.'}`,
      body,
      strength,
    };
  }

  // Without a fat reading there is nothing left to judge on — waist was the
  // fallback and it did not fire, so say that rather than inventing a verdict.
  if (fatChange === null) return null;

  if (holding && !fatFalling) {
    return {
      verdict: fatRising ? 'gaining' : 'maintaining',
      tone: 'info',
      headline: fatRising ? 'Fat is going the wrong way' : 'Maintaining, not cutting',
      detail: `${evidence} The lifts are fine, so training is not the issue — this is an intake question.`,
      body,
      strength,
    };
  }

  return {
    verdict: 'under-recovered',
    tone: 'warn',
    headline: 'Strength is dropping without the fat',
    detail: `${evidence} Losing strength while body fat sits still is usually recovery rather than diet — sleep, stress or too much training, not too little food.`,
    body,
    strength,
  };
}
