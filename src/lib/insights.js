import { mean, bandFor, BASELINE_DAYS, MIN_BASELINE_DAYS } from './scores';
import { formatHours, relativeDay } from './dates';

/**
 * Turns raw numbers into the one sentence that actually changes behaviour.
 *
 * Insights are ranked by priority and the panel shows the top few, so the
 * loudest signal (a HRV crash, a sleep debt) always wins over a nice-to-know.
 */

const pct = (a, b) => (b ? ((a - b) / b) * 100 : 0);

export function buildInsights({ today, history = [], sleepToday, sleepHistory = [], workouts = [] }) {
  const insights = [];

  // Must match the window the scores themselves use. These sentences quote the
  // baseline back at you, so a 7-day figure here beside a 60-day score on the
  // same screen is worse than saying nothing.
  const baseline = (rows, key) => {
    const values = rows
      .slice(0, BASELINE_DAYS)
      .map((r) => r?.[key])
      .filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v)));
    return values.length < MIN_BASELINE_DAYS ? null : mean(values);
  };

  const hrvBaseline = baseline(history, 'hrv');
  const rhrBaseline = baseline(history, 'resting_hr');
  const sleepBaseline = baseline(sleepHistory, 'duration_hours');

  // --- HRV vs baseline ------------------------------------------------------
  if (Number.isFinite(today?.hrv) && Number.isFinite(hrvBaseline)) {
    const delta = pct(today.hrv, hrvBaseline);
    if (delta >= 8) {
      insights.push({
        priority: 2,
        tone: 'good',
        icon: 'trending-up',
        title: 'HRV above your baseline',
        body: `${Math.round(today.hrv)}ms against your ${hrvBaseline.toFixed(0)}ms 60-day baseline (+${delta.toFixed(0)}%). Your nervous system is well recovered — a good day to train hard.`,
      });
    } else if (delta <= -12) {
      insights.push({
        priority: 0,
        tone: 'bad',
        icon: 'trending-down',
        title: 'HRV is well below baseline',
        body: `${Math.round(today.hrv)}ms vs ${hrvBaseline.toFixed(0)}ms (${delta.toFixed(0)}%). Suppressed HRV usually means fatigue, illness or stress. Keep today easy.`,
      });
    } else {
      insights.push({
        priority: 5,
        tone: 'neutral',
        icon: 'activity',
        title: 'HRV is holding steady',
        body: `${Math.round(today.hrv)}ms, in line with your ${hrvBaseline.toFixed(0)}ms 60-day baseline. Normal training is fine.`,
      });
    }
  }

  // --- Resting HR -----------------------------------------------------------
  if (Number.isFinite(today?.resting_hr) && Number.isFinite(rhrBaseline)) {
    const delta = today.resting_hr - rhrBaseline;
    if (delta >= 5) {
      insights.push({
        priority: 1,
        tone: 'bad',
        icon: 'heart',
        title: 'Resting heart rate is elevated',
        body: `${Math.round(today.resting_hr)} bpm, ${delta.toFixed(0)} above your 60-day baseline. Elevated RHR often shows up a day before you feel run down — prioritise sleep and hydration.`,
      });
    } else if (delta <= -3) {
      insights.push({
        priority: 4,
        tone: 'good',
        icon: 'heart',
        title: 'Resting heart rate is low',
        body: `${Math.round(today.resting_hr)} bpm, ${Math.abs(delta).toFixed(0)} below baseline — a strong sign of recovery.`,
      });
    }
  }

  // --- Sleep ----------------------------------------------------------------
  if (Number.isFinite(Number(sleepToday?.duration_hours))) {
    const hours = Number(sleepToday.duration_hours);
    if (hours < 6) {
      insights.push({
        priority: 1,
        tone: 'bad',
        icon: 'moon',
        title: 'Short sleep last night',
        body: `${formatHours(hours)} logged. Under 6 hours blunts recovery and glucose control — aim to be in bed 60-90 minutes earlier tonight.`,
      });
    } else if (hours >= 8) {
      insights.push({
        priority: 4,
        tone: 'good',
        icon: 'moon',
        title: 'Excellent sleep duration',
        body: `${formatHours(hours)} in bed. This is the single biggest lever on tomorrow's recovery score.`,
      });
    }
    if (Number.isFinite(sleepBaseline) && hours - sleepBaseline <= -1.5) {
      insights.push({
        priority: 3,
        tone: 'warn',
        icon: 'moon',
        title: 'Building a sleep debt',
        body: `You slept ${formatHours(sleepBaseline - hours)} less than your weekly average of ${formatHours(sleepBaseline)}.`,
      });
    }
  }

  // --- Training load --------------------------------------------------------
  const weekLoad = workouts.reduce(
    (sum, w) => sum + (Number(w.intensity) || 0) * ((Number(w.duration_mins) || 0) / 60),
    0
  );
  if (workouts.length >= 5) {
    insights.push({
      priority: 3,
      tone: 'warn',
      icon: 'dumbbell',
      title: 'Heavy training week',
      body: `${workouts.length} sessions logged in the last 7 days (load index ${weekLoad.toFixed(1)}). Schedule a genuine rest day before adaptation stalls.`,
    });
  } else if (workouts.length === 0) {
    insights.push({
      priority: 6,
      tone: 'neutral',
      icon: 'dumbbell',
      title: 'No workouts this week',
      body: 'Nothing logged in the last 7 days. Even a brisk 30-minute walk moves your aerobic base.',
    });
  }

  if (!insights.length) {
    insights.push({
      priority: 9,
      tone: 'neutral',
      icon: 'sparkles',
      title: 'Log your first few days',
      body: `Baselines need at least ${MIN_BASELINE_DAYS} days of HRV and resting heart rate before insights get personal, and settle over ${BASELINE_DAYS}. Add today’s numbers to get started.`,
    });
  }

  return insights.sort((a, b) => a.priority - b.priority);
}

/** Headline sentence for the dashboard hero, driven by readiness. */
export function readinessAdvice(readiness) {
  const band = bandFor(readiness);
  switch (band.key) {
    case 'excellent':
      return 'Primed. Green light for a hard session or a personal best attempt.';
    case 'good':
      return 'Solid. Train as planned — moderate to hard work is well tolerated.';
    case 'moderate':
      return 'Middling. Keep it aerobic and technical; skip the max efforts today.';
    default:
      return 'Depleted. Prioritise sleep, food and easy movement over training.';
  }
}

/** Weekly rollup used by the Insights panel and the Trends page. */
export function weeklySummary(scores = []) {
  const window = scores.slice(-7);
  const avg = (key) => {
    const v = mean(window.map((s) => s[key]));
    return v === null ? null : Math.round(v);
  };
  const prev = scores.slice(-14, -7);
  const prevAvg = (key) => {
    const v = mean(prev.map((s) => s[key]));
    return v === null ? null : Math.round(v);
  };

  const build = (key) => {
    const current = avg(key);
    const previous = prevAvg(key);
    return {
      value: current,
      delta: current !== null && previous !== null ? current - previous : null,
    };
  };

  return {
    days: window.length,
    recovery: build('recovery_score'),
    sleep: build('sleep_score'),
    exertion: build('exertion_score'),
    readiness: build('readiness_score'),
  };
}

/** Personal records across everything logged so far. */
export function personalRecords({ health = [], sleep = [], workouts = [], scores = [] }) {
  const best = (rows, key, direction = 'max') => {
    const valid = rows.filter((r) => Number.isFinite(Number(r[key])));
    if (!valid.length) return null;
    const winner = valid.reduce((acc, row) =>
      direction === 'max'
        ? Number(row[key]) > Number(acc[key])
          ? row
          : acc
        : Number(row[key]) < Number(acc[key])
          ? row
          : acc
    );
    return { value: Number(winner[key]), date: winner.date, when: relativeDay(winner.date) };
  };

  return [
    { key: 'hrv', label: 'Highest HRV', unit: 'ms', ...(best(health, 'hrv') ?? {}) },
    {
      key: 'rhr',
      label: 'Lowest resting HR',
      unit: 'bpm',
      ...(best(health, 'resting_hr', 'min') ?? {}),
    },
    { key: 'steps', label: 'Most steps', unit: '', ...(best(health, 'steps') ?? {}) },
    {
      key: 'calories',
      label: 'Most active calories',
      unit: 'kcal',
      ...(best(health, 'active_calories') ?? {}),
    },
    {
      key: 'sleep',
      label: 'Longest sleep',
      unit: 'h',
      ...(best(sleep, 'duration_hours') ?? {}),
    },
    {
      key: 'workout',
      label: 'Longest workout',
      unit: 'min',
      ...(best(workouts, 'duration_mins') ?? {}),
    },
    {
      key: 'recovery',
      label: 'Best recovery score',
      unit: '%',
      ...(best(scores, 'recovery_score') ?? {}),
    },
  ].filter((r) => r.value !== undefined);
}
