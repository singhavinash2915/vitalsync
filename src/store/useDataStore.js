import { create } from 'zustand';
import { supabase, describeError } from '../lib/supabase';
import { computeDailyScores } from '../lib/scores';
import { todayKey, toKey, lastNDays, fromKey } from '../lib/dates';
import { subDays } from 'date-fns';

/**
 * Single source of truth for every health table.
 *
 * Everything is loaded once for a window of days (default 90) and kept in
 * memory. At personal-log scale that is a few hundred rows — far cheaper than
 * a round trip per screen, and it makes rolling baselines trivial to compute.
 */

const WINDOW_DAYS = 120;

const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

/** Index an array of rows by their `date` for O(1) day lookups. */
const indexByDate = (rows) => {
  const map = new Map();
  rows.forEach((row) => map.set(row.date, row));
  return map;
};

export const useDataStore = create((set, get) => ({
  health: [],
  sleep: [],
  workouts: [],
  journal: [],
  scores: [],

  loading: true,
  saving: false,
  error: null,
  lastSyncedAt: null,

  reset: () =>
    set({
      health: [],
      sleep: [],
      workouts: [],
      journal: [],
      scores: [],
      loading: true,
      error: null,
      lastSyncedAt: null,
    }),

  /** Loads every table for the rolling window in one parallel batch. */
  loadAll: async (userId, { silent = false } = {}) => {
    if (!userId) return;
    if (!silent) set({ loading: true });
    set({ error: null });

    const since = toKey(subDays(new Date(), WINDOW_DAYS));

    const table = (name) =>
      supabase
        .from(name)
        .select('*')
        .eq('user_id', userId)
        .gte('date', since)
        .order('date', { ascending: false });

    try {
      const [health, sleep, workouts, journal, scores] = await Promise.all([
        table('health_logs'),
        table('sleep_logs'),
        table('workout_logs'),
        table('journal_logs'),
        table('scores'),
      ]);

      const firstError = [health, sleep, workouts, journal, scores].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      set({
        health: health.data ?? [],
        sleep: sleep.data ?? [],
        workouts: workouts.data ?? [],
        journal: journal.data ?? [],
        scores: scores.data ?? [],
        loading: false,
        lastSyncedAt: new Date().toISOString(),
      });
    } catch (error) {
      set({
        loading: false,
        error: describeError(error, 'Could not load your health data.'),
      });
    }
  },

  // --- selectors ------------------------------------------------------------

  healthFor: (date) => get().health.find((r) => r.date === date) ?? null,
  sleepFor: (date) => get().sleep.find((r) => r.date === date) ?? null,
  journalFor: (date) => get().journal.find((r) => r.date === date) ?? null,
  workoutsFor: (date) => get().workouts.filter((r) => r.date === date),
  scoreFor: (date) => get().scores.find((r) => r.date === date) ?? null,

  /** Prior health logs for a date, newest-first — the baseline input. */
  historyBefore: (date) => get().health.filter((r) => r.date < date).sort(byDateDesc),
  sleepHistoryBefore: (date) => get().sleep.filter((r) => r.date < date).sort(byDateDesc),

  /**
   * Recomputes a day's scores from whatever is currently in the store and
   * persists them. Called after every mutation so `scores` never drifts from
   * its source rows.
   */
  recomputeDay: async (userId, date, profile) => {
    const s = get();
    const computed = computeDailyScores({
      health: s.healthFor(date),
      sleep: s.sleepFor(date),
      journal: s.journalFor(date),
      workouts: s.workoutsFor(date),
      history: s.historyBefore(date),
      sleepHistory: s.sleepHistoryBefore(date),
      profile,
    });

    const row = {
      user_id: userId,
      date,
      recovery_score: computed.recovery_score,
      sleep_score: computed.sleep_score,
      exertion_score: computed.exertion_score,
      readiness_score: computed.readiness_score,
    };

    // Optimistic local update — the ring animates immediately.
    set((state) => ({
      scores: [...state.scores.filter((r) => r.date !== date), { ...row }].sort(byDateDesc),
    }));

    const { data, error } = await supabase
      .from('scores')
      .upsert(row, { onConflict: 'user_id,date' })
      .select()
      .single();

    if (error) {
      set({ error: describeError(error, 'Scores were calculated but could not be saved.') });
      return computed;
    }

    set((state) => ({
      scores: [...state.scores.filter((r) => r.date !== date), data].sort(byDateDesc),
    }));
    return computed;
  },

  /** Shared upsert path for the three one-row-per-day tables. */
  upsertDaily: async (tableName, stateKey, { userId, date, values, profile }) => {
    set({ saving: true, error: null });
    try {
      const payload = { user_id: userId, date, ...values };
      const { data, error } = await supabase
        .from(tableName)
        .upsert(payload, { onConflict: 'user_id,date' })
        .select()
        .single();
      if (error) throw error;

      set((state) => ({
        [stateKey]: [...state[stateKey].filter((r) => r.date !== date), data].sort(byDateDesc),
        saving: false,
      }));

      await get().recomputeDay(userId, date, profile);
      return { ok: true, data };
    } catch (error) {
      const message = describeError(error, `Could not save your ${stateKey} entry.`);
      set({ saving: false, error: message });
      return { ok: false, message };
    }
  },

  saveHealth: (args) => get().upsertDaily('health_logs', 'health', args),
  saveSleep: (args) => get().upsertDaily('sleep_logs', 'sleep', args),
  saveJournal: (args) => get().upsertDaily('journal_logs', 'journal', args),

  // --- workouts (many rows per day) ----------------------------------------

  saveWorkout: async ({ userId, workout, profile }) => {
    set({ saving: true, error: null });
    try {
      const payload = { ...workout, user_id: userId };
      const query = workout.id
        ? supabase.from('workout_logs').update(payload).eq('id', workout.id)
        : supabase.from('workout_logs').insert(payload);

      const { data, error } = await query.select().single();
      if (error) throw error;

      set((state) => ({
        workouts: [...state.workouts.filter((w) => w.id !== data.id), data].sort(byDateDesc),
        saving: false,
      }));

      await get().recomputeDay(userId, data.date, profile);
      return { ok: true, data };
    } catch (error) {
      const message = describeError(error, 'Could not save that workout.');
      set({ saving: false, error: message });
      return { ok: false, message };
    }
  },

  deleteWorkout: async ({ userId, id, date, profile }) => {
    const previous = get().workouts;
    set((state) => ({ workouts: state.workouts.filter((w) => w.id !== id) }));

    const { error } = await supabase.from('workout_logs').delete().eq('id', id);
    if (error) {
      set({ workouts: previous, error: describeError(error, 'Could not delete that workout.') });
      return { ok: false };
    }

    await get().recomputeDay(userId, date, profile);
    return { ok: true };
  },

  deleteDaily: async (tableName, stateKey, { userId, date, profile }) => {
    const previous = get()[stateKey];
    set((state) => ({ [stateKey]: state[stateKey].filter((r) => r.date !== date) }));

    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('user_id', userId)
      .eq('date', date);

    if (error) {
      set({ [stateKey]: previous, error: describeError(error, 'Could not delete that entry.') });
      return { ok: false };
    }
    await get().recomputeDay(userId, date, profile);
    return { ok: true };
  },

  /**
   * Rebuilds every score in the window. Used after the calorie target changes
   * (which shifts exertion, and therefore readiness, for every day).
   */
  recomputeAll: async (userId, profile) => {
    set({ saving: true, error: null });
    const s = get();
    const dates = [
      ...new Set([
        ...s.health.map((r) => r.date),
        ...s.sleep.map((r) => r.date),
        ...s.workouts.map((r) => r.date),
        ...s.journal.map((r) => r.date),
      ]),
    ].sort();

    const rows = dates.map((date) => {
      const computed = computeDailyScores({
        health: s.healthFor(date),
        sleep: s.sleepFor(date),
        journal: s.journalFor(date),
        workouts: s.workoutsFor(date),
        history: s.historyBefore(date),
        sleepHistory: s.sleepHistoryBefore(date),
        profile,
      });
      return {
        user_id: userId,
        date,
        recovery_score: computed.recovery_score,
        sleep_score: computed.sleep_score,
        exertion_score: computed.exertion_score,
        readiness_score: computed.readiness_score,
      };
    });

    if (!rows.length) {
      set({ saving: false });
      return { ok: true, count: 0 };
    }

    const { data, error } = await supabase
      .from('scores')
      .upsert(rows, { onConflict: 'user_id,date' })
      .select();

    if (error) {
      const message = describeError(error, 'Could not rebuild your scores.');
      set({ saving: false, error: message });
      return { ok: false, message };
    }

    set({ scores: (data ?? []).sort(byDateDesc), saving: false });
    return { ok: true, count: rows.length };
  },

  // --- chart series ---------------------------------------------------------

  /**
   * Builds a dense, gap-free series for the charts: one point per calendar day
   * in the range, with nulls where nothing was logged (Recharts draws a break
   * rather than a misleading straight line).
   */
  series: (days = 30) => {
    const s = get();
    const keys = lastNDays(days);
    const health = indexByDate(s.health);
    const sleep = indexByDate(s.sleep);
    const scores = indexByDate(s.scores);

    return keys.map((date) => {
      const h = health.get(date);
      const sl = sleep.get(date);
      const sc = scores.get(date);
      const dayWorkouts = s.workouts.filter((w) => w.date === date);

      return {
        date,
        label: fromKey(date).getDate(),
        hrv: h?.hrv ?? null,
        resting_hr: h?.resting_hr ?? null,
        spo2: h?.spo2 ?? null,
        body_temp: h?.body_temp ?? null,
        steps: h?.steps ?? null,
        active_calories: h?.active_calories ?? null,
        sleep_hours: sl?.duration_hours ?? null,
        sleep_quality: sl?.quality_rating ?? null,
        recovery: sc?.recovery_score ?? null,
        sleep_score: sc?.sleep_score ?? null,
        exertion: sc?.exertion_score ?? null,
        readiness: sc?.readiness_score ?? null,
        workout_minutes: dayWorkouts.reduce((sum, w) => sum + (Number(w.duration_mins) || 0), 0),
      };
    });
  },

  /** Everything the dashboard needs for a single day, in one call. */
  dayBundle: (date = todayKey()) => {
    const s = get();
    return {
      date,
      health: s.healthFor(date),
      sleep: s.sleepFor(date),
      journal: s.journalFor(date),
      workouts: s.workoutsFor(date),
      score: s.scoreFor(date),
      history: s.historyBefore(date),
      sleepHistory: s.sleepHistoryBefore(date),
    };
  },
}));
