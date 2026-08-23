import { mean, toNumber, hasNumber, BASELINE_DAYS } from './scores';

/**
 * Early warning from breathing rate, which is the one thing it is good for.
 *
 * Respiratory rate was deliberately kept out of the recovery score: measured
 * against his own history it barely moves — a spread of about 2% against HRV's
 * 12% — so weighting it continuously would shift the number without telling
 * anyone anything. What that same stability makes it excellent at is the
 * opposite job. A signal that normally sits within a couple of percent is a
 * loud one on the rare occasions it climbs, and a sustained rise in overnight
 * breathing rate is a recognised early sign of a developing infection, often
 * a day or two before you feel it.
 *
 * So it is a flag on rare excursions rather than a term in an equation.
 *
 * Two rules keep it from crying wolf, which would be worse than not having it:
 *   - never fire on a single night, because one reading is noise; and
 *   - treat a simultaneous rise in resting heart rate as corroboration, since
 *     the two moving together is far more specific than either alone.
 */

// Chosen against a personal spread of roughly 2%: +4% is about two standard
// deviations, and +7% is well outside anything in the record.
const WATCH_PCT = 4;
const LIKELY_PCT = 7;
const RHR_CORROBORATION_PCT = 4;

const MIN_BASELINE_READINGS = 10; // breathing rate is logged far more sparsely than HRV
const MIN_ELEVATED_READINGS = 2; // never on a single night
const RECENT_WINDOW = 5; // a reading older than this says nothing about today

/** Trailing mean of `key` over rows strictly older than `date`. */
function baselineFor(rows, key, date, days = BASELINE_DAYS) {
  const cutoff = new Date(`${date}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  const values = rows
    .filter((r) => r.date < date && r.date >= cutoffKey && hasNumber(r[key]))
    .map((r) => toNumber(r[key]));

  return values.length >= MIN_BASELINE_READINGS ? mean(values) : null;
}

/**
 * Looks for a sustained rise in overnight breathing rate.
 *
 * @param {Array}  health  health rows, any order
 * @param {string} asOf    the day to assess, yyyy-MM-dd
 * @returns {object|null}  null when there is nothing to say — which is the
 *                         normal case, and the case that must stay silent
 */
export function detectIllnessSignal(health = [], asOf = null) {
  if (!health.length) return null;

  const rows = [...health].sort((a, b) => (a.date < b.date ? -1 : 1));
  const today = asOf ?? rows[rows.length - 1].date;

  const rrBaseline = baselineFor(rows, 'respiratory_rate', today);
  if (!rrBaseline) return null;

  // Recent readings, most recent first, ignoring days the watch logged nothing.
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() - RECENT_WINDOW);
  const horizonKey = horizon.toISOString().slice(0, 10);

  const recent = rows
    .filter((r) => r.date <= today && r.date >= horizonKey && hasNumber(r.respiratory_rate))
    .reverse();
  if (recent.length < MIN_ELEVATED_READINGS) return null;

  const pct = (v) => ((toNumber(v) - rrBaseline) / rrBaseline) * 100;

  // Count back while readings stay elevated; the run is what makes it credible.
  let run = 0;
  for (const row of recent) {
    if (pct(row.respiratory_rate) >= WATCH_PCT) run += 1;
    else break;
  }
  if (run < MIN_ELEVATED_READINGS) return null;

  const elevated = recent.slice(0, run);
  const rrDelta = mean(elevated.map((r) => pct(r.respiratory_rate)));

  // Resting heart rate over the same nights, as corroboration.
  const rhrBaseline = baselineFor(rows, 'resting_hr', today);
  const rhrValues = elevated.filter((r) => hasNumber(r.resting_hr)).map((r) => toNumber(r.resting_hr));
  const rhrDelta =
    rhrBaseline && rhrValues.length
      ? ((mean(rhrValues) - rhrBaseline) / rhrBaseline) * 100
      : null;

  const corroborated = rhrDelta !== null && rhrDelta >= RHR_CORROBORATION_PCT;
  const level = rrDelta >= LIKELY_PCT || corroborated ? 'likely' : 'watch';

  const nights = `${run} night${run === 1 ? '' : 's'}`;
  const rrText = `${rrDelta >= 0 ? '+' : ''}${rrDelta.toFixed(1)}% above your ${rrBaseline.toFixed(1)} breaths/min baseline`;

  return {
    level,
    days: run,
    respiratoryDelta: Number(rrDelta.toFixed(1)),
    respiratoryBaseline: Number(rrBaseline.toFixed(1)),
    restingHrDelta: rhrDelta === null ? null : Number(rhrDelta.toFixed(1)),
    corroborated,
    headline:
      level === 'likely'
        ? 'Your body is fighting something'
        : 'Breathing rate is up — worth watching',
    detail:
      level === 'likely'
        ? `Overnight breathing has run ${rrText} for ${nights}${
            corroborated
              ? `, with resting heart rate ${rhrDelta.toFixed(1)}% up over the same period`
              : ''
          }. Those two moving together is the pattern that usually shows up a day or two before an infection is felt. Treat this as a rest day regardless of what the readiness number says, drink more than you want to, and sleep. If it holds for another two days or you develop a temperature, see a doctor rather than training through it.`
        : `Overnight breathing has run ${rrText} for ${nights}. On its own that is mild and can just as easily be a hot room, a late meal or alcohol — but it is the earliest thing your watch notices when something is developing. Keep today easy and look again tomorrow.`,
  };
}

export { WATCH_PCT, LIKELY_PCT };
