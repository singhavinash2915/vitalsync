import { mean, BASELINE_DAYS } from './scores';
import { shiftKey } from './dates';

/**
 * Finds the things that are true about *this* body.
 *
 * The rest of the app applies published rules — HRV below baseline means
 * fatigue, under six hours of sleep blunts recovery. Those rules describe a
 * population. This file describes one person, by going back through their own
 * history and measuring what actually happened.
 *
 * The two are frequently in conflict, and when they are, this file wins,
 * because it is the one holding evidence. What it must never do is invent a
 * finding to fill the screen: every probe returns null when the data cannot
 * support a claim, and `confidence` is reported alongside every number so a
 * pattern built on nineteen days is never dressed up as a law.
 */

const MIN_GROUP = 12; // below this a group mean is anecdote, not evidence

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const finite = (v) => Number.isFinite(v);

function sd(values) {
  if (values.length < 2) return null;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, x) => s + (x - m) ** 2, 0) / (values.length - 1));
}

/**
 * Welch's t-test, then a normal approximation for the p-value. The samples
 * here run to hundreds of days, where the normal approximation and the real
 * t-distribution agree to more decimal places than we display.
 */
function welch(a, b) {
  if (a.length < 2 || b.length < 2) return null;
  const [ma, mb] = [mean(a), mean(b)];
  const [va, vb] = [sd(a) ** 2 / a.length, sd(b) ** 2 / b.length];
  const denom = Math.sqrt(va + vb);
  if (!denom) return null;
  const t = (ma - mb) / denom;
  // Abramowitz & Stegun 7.1.26 for erf, giving a two-tailed p.
  const z = Math.abs(t) / Math.SQRT2;
  const tt = 1 / (1 + 0.3275911 * z);
  const erf =
    1 -
    ((((1.061405429 * tt - 1.453152027) * tt + 1.421413741) * tt - 0.284496736) * tt +
      0.254829592) *
      tt *
      Math.exp(-z * z);
  return { t, p: 1 - erf, diff: ma - mb };
}

function confidenceFrom(p, n) {
  if (n < MIN_GROUP) return 'insufficient';
  if (p === null) return 'insufficient';
  if (p < 0.01 && n >= 40) return 'strong';
  if (p < 0.05) return 'moderate';
  return 'weak';
}

/**
 * Every metric is judged against a trailing baseline rather than an absolute
 * number, because a 45ms HRV means something different in a year when the
 * average was 41 than in one when it was 45. Trailing, not centred, so a day
 * is only ever compared with days that preceded it.
 */
function deviationIndex(rows, key, days = BASELINE_DAYS) {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out = new Map();
  for (let i = 0; i < sorted.length; i += 1) {
    const value = num(sorted[i][key]);
    if (!finite(value)) continue;
    const window = sorted
      .slice(Math.max(0, i - days), i)
      .map((r) => num(r[key]))
      .filter(finite);
    if (window.length < 15) continue;
    const base = mean(window);
    if (!base) continue;
    out.set(sorted[i].date, ((value - base) / base) * 100);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Probes. Each takes the prepared context and returns a finding, or null.
// ---------------------------------------------------------------------------

/**
 * The most important thing to know before reading any single day's score.
 * A body whose overnight readings swing twenty points is telling you that one
 * reading is mostly noise, and that acting hard on it is acting on a coin toss.
 */
function volatility({ hrvDev }) {
  const dates = [...hrvDev.keys()].sort();
  if (dates.length < 60) return null;

  const swings = [];
  for (let i = 1; i < dates.length; i += 1) {
    if (shiftKey(dates[i - 1], 1) !== dates[i]) continue; // consecutive days only
    swings.push(Math.abs(hrvDev.get(dates[i]) - hrvDev.get(dates[i - 1])));
  }
  if (swings.length < 40) return null;

  swings.sort((a, b) => a - b);
  const median = swings[Math.floor(swings.length / 2)];
  const bigShare = Math.round((swings.filter((s) => s > 20).length / swings.length) * 100);
  const spread = sd([...hrvDev.values()]);

  return {
    id: 'volatility',
    category: 'How to read your own numbers',
    title: 'Your HRV is unusually noisy',
    headline: `Median overnight swing of ${median.toFixed(0)} points`,
    detail: `Across ${swings.length} consecutive nights your HRV moved a median of ${median.toFixed(0)} points from one morning to the next, and ${bigShare}% of nights moved more than 20. The spread around your own baseline is ±${spread.toFixed(0)}%. That is a wide signal, and it means a single low morning is much weaker evidence for you than it would be for someone with a steady trace.`,
    evidence: { n: swings.length, effect: median, unit: 'pts' },
    confidence: 'strong',
    tone: 'info',
  };
}

/**
 * Directly tests the thing the app does every morning: treat a low reading as
 * a signal. If one low day does not predict the days after it, then it is not
 * a signal, and the honest move is to say so rather than to keep alarming.
 */
function singleDayVsRun({ hrvDev }) {
  const forward = (predicate) => {
    const out = [];
    for (const date of hrvDev.keys()) {
      if (!predicate(date)) continue;
      const nextThree = [1, 2, 3].map((k) => hrvDev.get(shiftKey(date, k))).filter(finite);
      if (nextThree.length) out.push(mean(nextThree));
    }
    return out;
  };

  const afterOne = forward((d) => hrvDev.get(d) <= -15);
  const afterRun = forward((d) =>
    [0, 1, 2].every((k) => {
      const v = hrvDev.get(shiftKey(d, -k));
      return finite(v) && v <= -8;
    })
  );
  if (afterOne.length < MIN_GROUP || afterRun.length < MIN_GROUP) return null;

  const test = welch(afterRun, afterOne);
  return {
    id: 'single-day-vs-run',
    category: 'How to read your own numbers',
    title: 'One bad morning means very little. Three in a row means a lot',
    headline: `${mean(afterOne).toFixed(1)}% after one bad day vs ${mean(afterRun).toFixed(1)}% after three`,
    detail: `After a single morning 15% or more below your baseline, the next three days average ${mean(afterOne).toFixed(1)}% — essentially back to normal, ${afterOne.length} occurrences. After three consecutive days each 8% or more down, the next three average ${mean(afterRun).toFixed(1)}%, over ${afterRun.length} occurrences. So a lone bad reading is mostly noise and should cost you at most one session. A run of them is real, and should cost you a lighter week.`,
    evidence: { n: afterOne.length + afterRun.length, effect: mean(afterRun) - mean(afterOne), unit: '%' },
    confidence: confidenceFrom(test?.p ?? null, Math.min(afterOne.length, afterRun.length)),
    tone: 'info',
  };
}

/**
 * The textbook expectation is that yesterday's training suppresses today's
 * HRV. Worth testing rather than assuming, because when it comes back the
 * other way it usually means the quiet days are sick days.
 */
function loadTolerance({ health, hrvDev }) {
  const bands = [
    { label: 'under 4,000', lo: 0, hi: 4000 },
    { label: '4–7,000', lo: 4000, hi: 7000 },
    { label: '7–10,000', lo: 7000, hi: 10000 },
    { label: '10–14,000', lo: 10000, hi: 14000 },
    { label: 'over 14,000', lo: 14000, hi: Infinity },
  ];

  const groups = bands.map((band) => {
    const values = health
      .filter((r) => {
        const steps = num(r.steps);
        return finite(steps) && steps >= band.lo && steps < band.hi;
      })
      .map((r) => hrvDev.get(shiftKey(r.date, 1)))
      .filter(finite);
    return { ...band, values, mean: values.length ? mean(values) : null, n: values.length };
  });

  const usable = groups.filter((g) => g.n >= MIN_GROUP);
  if (usable.length < 3) return null;

  const quiet = groups.find((g) => g.hi === 4000);
  const busy = usable[usable.length - 1];
  if (!quiet || quiet.n < MIN_GROUP) return null;

  const test = welch(busy.values, quiet.values);
  const inverted = busy.mean > quiet.mean;

  return {
    id: 'load-tolerance',
    category: 'Training load',
    title: inverted
      ? 'Hard days do not cost you the next morning — quiet days do'
      : 'Heavy days show up in the next morning’s HRV',
    headline: inverted
      ? `${busy.mean >= 0 ? '+' : ''}${busy.mean.toFixed(1)}% after your busiest days vs ${quiet.mean.toFixed(1)}% after your quietest`
      : `${busy.mean.toFixed(1)}% after your busiest days`,
    detail: inverted
      ? `Sorted by yesterday's step count, the morning after your busiest days averages ${busy.mean >= 0 ? '+' : ''}${busy.mean.toFixed(1)}% against baseline (${busy.label} steps, ${busy.n} days), while the morning after your quietest averages ${quiet.mean.toFixed(1)}% (${quiet.n} days). The relationship runs the opposite way to the textbook. The likeliest reading is not that training helps you recover, but that your low-activity days are the days you were already unwell, travelling or flattened — the inactivity is a symptom, not a cause. Practically: do not blame a bad morning on yesterday's session.`
      : `The morning after your busiest days averages ${busy.mean.toFixed(1)}% against baseline over ${busy.n} days, compared with ${quiet.mean.toFixed(1)}% after your quietest. Yesterday's load is genuinely visible in this morning's reading.`,
    evidence: { n: groups.reduce((s, g) => s + g.n, 0), effect: busy.mean - quiet.mean, unit: '%' },
    confidence: confidenceFrom(test?.p ?? null, Math.min(busy.n, quiet.n)),
    tone: 'info',
    table: usable.map((g) => ({ label: `${g.label} steps`, value: g.mean, n: g.n })),
  };
}

/** Whether a second hard day in a row is affordable. */
function backToBack({ health, hrvDev }) {
  const byDate = new Map(health.map((r) => [r.date, r]));
  const [after1, after2] = [[], []];

  for (const row of health) {
    const today = num(row.steps);
    const yesterday = num(byDate.get(shiftKey(row.date, -1))?.steps);
    if (!finite(today) || !finite(yesterday) || today <= 9000) continue;
    const outcome = hrvDev.get(shiftKey(row.date, 1));
    if (!finite(outcome)) continue;
    (yesterday > 9000 ? after2 : after1).push(outcome);
  }
  if (after1.length < MIN_GROUP || after2.length < MIN_GROUP) return null;

  const test = welch(after2, after1);
  const holdsUp = mean(after2) >= mean(after1) - 3;

  return {
    id: 'back-to-back',
    category: 'Training load',
    title: holdsUp
      ? 'You handle back-to-back hard days'
      : 'The second hard day in a row is the expensive one',
    headline: `${mean(after2) >= 0 ? '+' : ''}${mean(after2).toFixed(1)}% after two hard days vs ${mean(after1) >= 0 ? '+' : ''}${mean(after1).toFixed(1)}% after one`,
    detail: holdsUp
      ? `A hard day following a rest day leaves you at ${mean(after1) >= 0 ? '+' : ''}${mean(after1).toFixed(1)}% the next morning (${after1.length} days); a second hard day back-to-back leaves you at ${mean(after2) >= 0 ? '+' : ''}${mean(after2).toFixed(1)}% (${after2.length} days). Consecutive load is not what breaks you, which matters from October when cricket and gym days sit next to each other.`
      : `A second consecutive hard day costs you ${(mean(after1) - mean(after2)).toFixed(1)} points more than an isolated one. Put a genuine easy day between your two heaviest sessions.`,
    evidence: { n: after1.length + after2.length, effect: mean(after2) - mean(after1), unit: '%' },
    confidence: confidenceFrom(test?.p ?? null, Math.min(after1.length, after2.length)),
    tone: holdsUp ? 'good' : 'warn',
  };
}

/** Which day of the week actually goes badly, if any. */
function weekdayPattern({ hrvDev }) {
  const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const buckets = NAMES.map(() => []);
  for (const [date, value] of hrvDev) {
    buckets[new Date(`${date}T00:00:00Z`).getUTCDay()].push(value);
  }
  if (buckets.some((b) => b.length < MIN_GROUP)) return null;

  const summary = buckets.map((values, i) => ({ day: NAMES[i], mean: mean(values), n: values.length, values }));
  const best = summary.reduce((a, b) => (b.mean > a.mean ? b : a));
  const worst = summary.reduce((a, b) => (b.mean < a.mean ? b : a));
  const test = welch(best.values, worst.values);
  if (best.mean - worst.mean < 3) return null; // a flat week is not a finding

  return {
    id: 'weekday',
    category: 'Weekly rhythm',
    title: `${worst.day} is consistently your worst morning`,
    headline: `${worst.day} ${worst.mean.toFixed(1)}% vs ${best.day} ${best.mean >= 0 ? '+' : ''}${best.mean.toFixed(1)}%`,
    detail: `Averaged over ${summary.reduce((s, d) => s + d.n, 0)} mornings, ${worst.day} comes in ${Math.abs(best.mean - worst.mean).toFixed(1)} points below ${best.day}. If a hard session has to move, move it off ${worst.day}.`,
    evidence: { n: worst.n, effect: best.mean - worst.mean, unit: '%' },
    confidence: confidenceFrom(test?.p ?? null, worst.n),
    tone: 'info',
    table: summary.map((d) => ({ label: d.day.slice(0, 3), value: d.mean, n: d.n })),
  };
}

/** The multi-year view — the one thing a daily score can never show you. */
function yearOverYear({ health }) {
  const years = new Map();
  for (const row of health) {
    const year = row.date.slice(0, 4);
    if (!years.has(year)) years.set(year, { hrv: [], rhr: [], steps: [] });
    const bucket = years.get(year);
    if (finite(num(row.hrv))) bucket.hrv.push(num(row.hrv));
    if (finite(num(row.resting_hr))) bucket.rhr.push(num(row.resting_hr));
    if (finite(num(row.steps))) bucket.steps.push(num(row.steps));
  }

  const rows = [...years.entries()]
    .map(([year, b]) => ({
      year,
      hrv: b.hrv.length >= 30 ? mean(b.hrv) : null,
      rhr: b.rhr.length >= 30 ? mean(b.rhr) : null,
      steps: b.steps.length >= 30 ? mean(b.steps) : null,
      n: b.hrv.length,
    }))
    .filter((r) => r.hrv !== null)
    .sort((a, b) => (a.year < b.year ? -1 : 1));
  if (rows.length < 2) return null;

  const first = rows[0];
  const latest = rows[rows.length - 1];
  const prior = rows[rows.length - 2];
  const hrvDelta = latest.hrv - prior.hrv;
  const rhrDelta = latest.rhr !== null && prior.rhr !== null ? latest.rhr - prior.rhr : null;
  const improving = hrvDelta > 0 && (rhrDelta === null || rhrDelta <= 0);

  return {
    id: 'year-over-year',
    category: 'The long view',
    title: improving
      ? `${latest.year} is your strongest year on record`
      : `${latest.year} is tracking below ${prior.year}`,
    headline: `HRV ${latest.hrv.toFixed(1)}ms vs ${prior.hrv.toFixed(1)}ms last year`,
    detail: `Year by year your HRV averages ${rows.map((r) => `${r.year} ${r.hrv.toFixed(1)}`).join(', ')}ms${
      latest.rhr !== null && prior.rhr !== null
        ? `, with resting heart rate ${rhrDelta <= 0 ? 'down' : 'up'} from ${prior.rhr.toFixed(1)} to ${latest.rhr.toFixed(1)} bpm`
        : ''
    }${
      latest.steps !== null && prior.steps !== null
        ? ` and daily steps ${latest.steps > prior.steps ? 'up' : 'down'} from ${Math.round(prior.steps).toLocaleString()} to ${Math.round(latest.steps).toLocaleString()}`
        : ''
    }. ${
      improving
        ? 'Whatever you changed this year is working. This is the number worth protecting, and it is invisible from a daily score.'
        : 'The daily scores cannot show you this, and it is the trend that actually matters.'
    }`,
    evidence: { n: rows.reduce((s, r) => s + r.n, 0), effect: latest.hrv - first.hrv, unit: 'ms' },
    confidence: 'strong',
    tone: improving ? 'good' : 'warn',
    table: rows.map((r) => ({ label: r.year, value: r.hrv, n: r.n, raw: true })),
  };
}

/**
 * Sleep is the lever everyone assumes is decisive, so when there is not enough
 * of it logged to tell, that gets said out loud rather than quietly skipped —
 * an absent insight reads as "no effect", which is a different claim.
 */
function sleepEffect({ sleep, hrvDev }) {
  const paired = sleep
    .map((s) => ({ hours: num(s.duration_hours), dev: hrvDev.get(s.date) }))
    .filter((p) => finite(p.hours) && finite(p.dev));

  if (paired.length < 30) {
    return {
      id: 'sleep-effect',
      category: 'Sleep',
      title: 'Not enough sleep data to say anything honest yet',
      headline: `${paired.length} usable nights`,
      detail: `Only ${paired.length} nights line up a logged sleep duration with a next-morning HRV reading, against roughly ${Math.max(0, 30 - paired.length)} more needed before a comparison means anything. Your watch records this every night — the gap is in what reaches the app, so a nightly export is the fix. Until then no claim is made either way, which is not the same as sleep not mattering.`,
      evidence: { n: paired.length, effect: null, unit: null },
      confidence: 'insufficient',
      tone: 'warn',
    };
  }

  const short = paired.filter((p) => p.hours < 6.5).map((p) => p.dev);
  const long = paired.filter((p) => p.hours >= 6.5).map((p) => p.dev);
  if (short.length < MIN_GROUP || long.length < MIN_GROUP) return null;

  const test = welch(long, short);
  const matters = Math.abs(mean(long) - mean(short)) >= 4 && (test?.p ?? 1) < 0.05;

  return {
    id: 'sleep-effect',
    category: 'Sleep',
    title: matters ? 'Sleep length moves your next morning' : 'Sleep length is not what moves your HRV',
    headline: `${mean(long).toFixed(1)}% over 6½h vs ${mean(short).toFixed(1)}% under`,
    detail: matters
      ? `Nights over 6½ hours leave you at ${mean(long) >= 0 ? '+' : ''}${mean(long).toFixed(1)}% against baseline (${long.length} nights); shorter nights leave you at ${mean(short).toFixed(1)}% (${short.length}). That is a real gap and the cheapest lever you have.`
      : `Nights over 6½ hours average ${mean(long) >= 0 ? '+' : ''}${mean(long).toFixed(1)}% against baseline (${long.length} nights) and shorter nights ${mean(short).toFixed(1)}% (${short.length}) — a difference too small to separate from noise. Sleep still matters for everything else, but in your data it is not the dial that explains a bad morning, so stop looking there first.`,
    evidence: { n: paired.length, effect: mean(long) - mean(short), unit: '%' },
    confidence: confidenceFrom(test?.p ?? null, Math.min(short.length, long.length)),
    tone: 'info',
  };
}

/** Where the body is right now, relative to itself. Always shown first. */
function rightNow({ health, hrvDev }) {
  const sorted = [...health].sort((a, b) => (a.date < b.date ? -1 : 1));
  const recent = sorted.slice(-3).map((r) => hrvDev.get(r.date)).filter(finite);
  if (!recent.length) return null;

  const latest = recent[recent.length - 1];
  const runAvg = mean(recent);
  const suppressed = recent.length >= 3 && recent.every((v) => v <= -8);

  return {
    id: 'right-now',
    category: 'Right now',
    title: suppressed
      ? 'Three days down — this one is real'
      : latest <= -15
        ? 'Down this morning, but not yet a pattern'
        : 'Tracking with your baseline',
    headline: `${latest >= 0 ? '+' : ''}${latest.toFixed(1)}% today, ${runAvg >= 0 ? '+' : ''}${runAvg.toFixed(1)}% over three days`,
    detail: suppressed
      ? `All three of your last mornings sit 8% or more below baseline. In your history that pattern does carry forward, so treat this as a genuinely light week rather than a light day.`
      : latest <= -15
        ? `This morning is ${Math.abs(latest).toFixed(0)}% down, but the three-day average is ${runAvg >= 0 ? '+' : ''}${runAvg.toFixed(1)}%, so the run is not yet suppressed. On your own record an isolated morning like this resolves about half the time by tomorrow. Drop today's intensity; do not rewrite the week.`
        : `Your last three mornings average ${runAvg >= 0 ? '+' : ''}${runAvg.toFixed(1)}% against your 60-day baseline. Nothing here argues against training as planned.`,
    evidence: { n: null, effect: latest, unit: '%' },
    // Not a claim about a population — it is a reading off today. Labelling it
    // "strong evidence, n = 3" would be nonsense next to a finding built on 900 days.
    statusOnly: true,
    confidence: 'strong',
    tone: suppressed ? 'bad' : latest <= -15 ? 'warn' : 'good',
  };
}

const PROBES = [
  rightNow,
  volatility,
  singleDayVsRun,
  loadTolerance,
  backToBack,
  weekdayPattern,
  sleepEffect,
  yearOverYear,
];

const RANK = { bad: 0, warn: 1, good: 2, info: 3 };
const CONFIDENCE_RANK = { strong: 0, moderate: 1, weak: 2, insufficient: 3 };

/**
 * Runs every probe over the full history and returns what survived.
 *
 * Ordered by how much it should change what you do today: alarming before
 * reassuring, well-evidenced before tentative.
 */
export function discoverFindings({ health = [], sleep = [] } = {}) {
  if (!health.length) return [];

  const ctx = {
    health: [...health].sort((a, b) => (a.date < b.date ? -1 : 1)),
    sleep,
    hrvDev: deviationIndex(health, 'hrv'),
    rhrDev: deviationIndex(health, 'resting_hr'),
  };

  return PROBES.map((probe) => {
    try {
      return probe(ctx);
    } catch {
      // A single probe failing must never take the screen down with it.
      return null;
    }
  })
    .filter(Boolean)
    .sort(
      (a, b) =>
        (RANK[a.tone] ?? 9) - (RANK[b.tone] ?? 9) ||
        (CONFIDENCE_RANK[a.confidence] ?? 9) - (CONFIDENCE_RANK[b.confidence] ?? 9)
    );
}

export { deviationIndex, MIN_GROUP };
