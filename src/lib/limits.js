/**
 * Movements this body is not currently allowed to do.
 *
 * The gym templates in `coach.js` prescribe trap-bar jumps, pogo hops, Nordic
 * curls and 40m strides, and they prescribe them off a readiness score that
 * knows nothing about a knee. A recovering ACL makes that combination the most
 * dangerous thing in the app: a good HRV morning would confidently hand back a
 * session of exactly the loading the knee cannot take.
 *
 * So restrictions live on the profile and are applied to the written session
 * before it is shown. Two rules shape how:
 *
 *   - **Substitute, do not delete.** A session missing its power work with no
 *     explanation looks like a bug, and invites putting the movement back. Each
 *     swap keeps the training intent and says what it replaced.
 *   - **Never silently.** The substitution is labelled on screen, so the reason
 *     is visible at the moment it matters rather than buried in a setting.
 *
 * Knee comfort and soreness are recorded next to these but are deliberately
 * *not* score inputs. Respiratory rate was kept out of the recovery score for
 * the same reason: there is no evidence yet that either predicts anything for
 * this person, and an unproven term in a score is noise wearing a number.
 */

export const LIMITS = {
  no_plyometrics: {
    label: 'No jumping',
    detail: 'Jumps, hops and bounding are out while the knee is rebuilding.',
  },
  no_sprinting: {
    label: 'No sprinting',
    detail: 'Maximal running is out; steady aerobic work is fine.',
  },
  limit_deep_knee_flexion: {
    label: 'Limit deep knee bend',
    detail: 'Squat and lunge to around parallel rather than full depth.',
  },
  no_contact: {
    label: 'No contact',
    detail: 'Nothing with a collision or a change-of-direction demand.',
  },
};

/**
 * Substitutions, keyed by the limit that triggers them.
 *
 * `match` is tested case-insensitively against the prescribed line, so it has
 * to be specific enough not to catch a safe movement by accident — "jump"
 * alone would also match "jump rope warm-up", which is why the phrases are
 * matched as written in the templates.
 */
const SUBSTITUTIONS = {
  no_plyometrics: [
    { match: 'trap-bar jump', replace: 'Trap-bar deadlift 5×3 @ RPE 7', why: 'same hinge power, no landing' },
    { match: 'pogo hops', replace: 'Standing calf raise 3×12 slow', why: 'loads the calf without impact' },
    { match: 'med-ball rotational throw', replace: 'Cable rotational press 4×6 each side', why: 'same rotation, controlled' },
    { match: 'nordic curl', replace: 'Hamstring curl 3×10', why: 'hamstring work without the eccentric load spike' },
  ],
  no_sprinting: [
    { match: 'stride', replace: '6 × 90s bike interval at a conversational-plus pace', why: 'aerobic stimulus without top-end running' },
    { match: 'a-skips, high knees, heel flicks', replace: 'Walking warm-up, 5 min, plus hip mobility', why: 'no impact drills' },
    { match: '400m easy jog', replace: '5 min easy bike', why: 'no running while the knee rebuilds' },
    { match: 'run-up rhythm without ball', replace: 'Standing shadow bowling, no run-up', why: 'keeps the action without the approach' },
  ],
  limit_deep_knee_flexion: [
    { match: 'back squat', replace: 'Box squat to parallel 4×5 @ RPE 7', why: 'depth capped by the box' },
    { match: 'walking lunge', replace: 'Split squat to a pad, 3×10 each leg', why: 'controlled depth, no travelling' },
  ],
};

/** The limits currently in force, read off the profile. */
export function activeLimits(profile) {
  const raw = profile?.training_limits;
  if (!Array.isArray(raw)) return [];
  return raw.filter((key) => key in LIMITS);
}

/**
 * Applies the active limits to one prescribed line.
 *
 * @returns {{text: string, replaced: string|null, why: string|null}}
 */
export function applyLimitsToItem(item, limits = []) {
  for (const limit of limits) {
    for (const rule of SUBSTITUTIONS[limit] ?? []) {
      if (item.toLowerCase().includes(rule.match)) {
        return { text: rule.replace, replaced: item, why: rule.why, limit };
      }
    }
  }
  return { text: item, replaced: null, why: null, limit: null };
}

/** Applies the active limits across a whole session's blocks. */
export function applyLimitsToBlocks(blocks = [], limits = []) {
  if (!limits.length) return { blocks, substitutions: [] };

  const substitutions = [];
  const out = blocks.map((block) => ({
    ...block,
    items: block.items.map((item) => {
      const result = applyLimitsToItem(item, limits);
      if (result.replaced) substitutions.push(result);
      return result.text;
    }),
  }));

  return { blocks: out, substitutions };
}

/**
 * What a match day means under these limits.
 *
 * Worth saying plainly rather than programming around: sixteen overs of
 * fielding and running between the wickets IS sprinting, and unlike a gym
 * movement it cannot be substituted out once you are on the field. The app's
 * job here is to state the conflict, not to pretend it has solved it.
 */
export function cricketLimitNote(limits = []) {
  if (!limits.includes('no_sprinting')) return null;
  return {
    tone: 'bad',
    text: 'You are not cleared to sprint, and a 16-over match involves it — running between the wickets and chasing in the deep. Field in the ring, take singles rather than turning for two, and treat this as a question for whoever is managing the knee rather than something the app can program around.',
  };
}
