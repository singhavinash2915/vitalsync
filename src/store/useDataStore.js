import { create } from 'zustand';
import { supabase, describeError } from '../lib/supabase';
import { computeDailyScores, SCORING_VERSION } from '../lib/scores';
import { HEALTH_COLUMNS } from '../lib/healthImport';
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

/** Written on every imported sleep row so the key sets stay uniform. */
const SLEEP_COLUMNS = [
  'duration_hours',
  'quality_rating',
  'bedtime',
  'wake_time',
  'deep_hours',
  'rem_hours',
  'core_hours',
  'awake_hours',
  'in_bed_hours',
];

/**
 * The database's own column rules, mirrored here so a bad value is dropped
 * before it can abort a 2,400-row batch. Postgres rejects the *whole* upsert
 * for one offending cell, so validating per-cell on the way out turns a total
 * failure into one missing number.
 *
 * `int` matches the `integer` columns (22P02 otherwise); min/max mirror the
 * CHECK constraints in 0001_init.sql (23514 otherwise).
 */
const COLUMN_RULES = {
  hrv: { min: 1, max: 400 },
  resting_hr: { min: 25, max: 150, int: true },
  spo2: { min: 50, max: 100 },
  body_temp: { min: 30, max: 45 },
  active_calories: { min: 0, max: 20000, int: true },
  steps: { min: 0, max: 200000, int: true },
  duration_hours: { min: 0, max: 24 },
  deep_hours: { min: 0, max: 24 },
  rem_hours: { min: 0, max: 24 },
  core_hours: { min: 0, max: 24 },
  awake_hours: { min: 0, max: 24 },
  in_bed_hours: { min: 0, max: 24 },
  quality_rating: { min: 1, max: 5, int: true },
  duration_mins: { min: 1, max: 1440, int: true },
  intensity: { min: 1, max: 10, int: true },
  calories_burned: { min: 0, max: 20000, int: true },
};

/**
 * Returns a value safe for `column`, or null.
 *
 * The null check is load-bearing and was the source of a real bug: `Number(null)`
 * is 0 and `Number.isFinite(0)` is true, so an earlier version of this rounded
 * every absent integer to 0 — which silently wrote fake zero step counts and
 * blew up on resting_hr, whose CHECK starts at 25.
 */
function sanitiseValue(column, value) {
  if (value === null || value === undefined || value === '') return null;

  const rules = COLUMN_RULES[column];
  if (!rules) return value; // text columns (notes, type, bedtime…) pass through

  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < rules.min || number > rules.max) return null;

  return rules.int ? Math.round(number) : number;
}

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
  snapshots: [],

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
      snapshots: [],
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
      const [health, sleep, workouts, journal, scores, snapshots] = await Promise.all([
        table('health_logs'),
        table('sleep_logs'),
        table('workout_logs'),
        table('journal_logs'),
        table('scores'),
        // Intraday points for the "today" curve; a couple of days is plenty.
        supabase
          .from('health_snapshots')
          .select('*')
          .eq('user_id', userId)
          .gte('date', toKey(subDays(new Date(), 2)))
          .order('captured_at', { ascending: true }),
      ]);

      const firstError = [health, sleep, workouts, journal, scores].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      set({
        health: health.data ?? [],
        sleep: sleep.data ?? [],
        workouts: workouts.data ?? [],
        journal: journal.data ?? [],
        scores: scores.data ?? [],
        // A missing snapshots table (migrations not applied) must not break
        // the whole load — the curve is an extra, not a requirement.
        snapshots: snapshots.error ? [] : (snapshots.data ?? []),
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

  /**
   * Rebuilds stored scores once after a change to the scoring algorithm.
   *
   * Today is always recomputed live, so only history goes stale — which shows
   * up as Trends disagreeing with the dashboard. Comparing the profile's saved
   * version against the current one makes that self-healing instead of relying
   * on someone finding the rebuild button.
   */
  rebuildIfScoringChanged: async (userId, profile) => {
    if (!userId || !profile) return { ok: true, skipped: true };
    if (Number(profile.scoring_version) === SCORING_VERSION) return { ok: true, skipped: true };

    const result = await get().recomputeAll(userId, profile);
    if (!result.ok) return result;

    await supabase
      .from('users')
      .update({ scoring_version: SCORING_VERSION })
      .eq('id', userId);

    return { ok: true, rebuilt: result.count };
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
   * Bulk-writes a parsed Apple Health export, then rebuilds every score.
   *
   * Rows are chunked because a year of history is ~365 rows per table and
   * PostgREST gets unhappy with very large single payloads. Existing days are
   * merged rather than replaced: an import carrying only HRV must not wipe the
   * sleep quality you rated by hand on the same day.
   */
  importHealthExport: async ({ userId, days, workouts = [], profile, onProgress }) => {
    set({ saving: true, error: null });

    const state = get();
    const healthRows = [];
    const sleepRows = [];

    /**
     * Every row in a bulk upsert must carry an identical key set, or PostgREST
     * rejects the whole batch with `PGRST102: All object keys must match`.
     *
     * Health exports are inherently ragged — Apple records HRV on the nights
     * you wore the watch and nothing on the others — so building rows from
     * only the fields each day happens to have produces mismatched keys and a
     * 400 for the entire import.
     *
     * Writing a fixed column list fixes that. Each cell falls back to the
     * value already stored, so a partial export never blanks a metric it
     * simply didn't include, and only lands as null when it was never known.
     */
    const buildRow = (columns, { date, values, existing }) => {
      const row = { user_id: userId, date, source: 'import' };
      for (const column of columns) {
        row[column] = sanitiseValue(column, values?.[column] ?? existing?.[column] ?? null);
      }
      return row;
    };

    for (const day of days) {
      if (day.health) {
        healthRows.push(
          buildRow(HEALTH_COLUMNS, {
            date: day.date,
            values: day.health,
            existing: state.health.find((r) => r.date === day.date),
          })
        );
      }
      if (day.sleep) {
        sleepRows.push(
          buildRow(SLEEP_COLUMNS, {
            date: day.date,
            values: day.sleep,
            existing: state.sleep.find((r) => r.date === day.date),
          })
        );
      }
    }

    const CHUNK = 200;
    const writeChunks = async (table, rows) => {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabase
          .from(table)
          .upsert(rows.slice(i, i + CHUNK), { onConflict: 'user_id,date' });
        if (error) throw error;
        onProgress?.(Math.min(i + CHUNK, rows.length), rows.length, table);
      }
    };

    // Only workouts carrying Apple's stable UUID can be deduplicated; without
    // one, a second import would silently double the session.
    const WORKOUT_COLUMNS = [
      'type',
      'duration_mins',
      'intensity',
      'calories_burned',
      'notes',
      'external_id',
    ];
    const workoutRows = workouts
      .filter((w) => w.external_id)
      .map((w) => buildRow(WORKOUT_COLUMNS, { date: w.date, values: w }));

    try {
      await writeChunks('health_logs', healthRows);
      await writeChunks('sleep_logs', sleepRows);

      for (let i = 0; i < workoutRows.length; i += CHUNK) {
        const { error } = await supabase
          .from('workout_logs')
          .upsert(workoutRows.slice(i, i + CHUNK), { onConflict: 'user_id,external_id' });
        if (error) throw error;
        onProgress?.(Math.min(i + CHUNK, workoutRows.length), workoutRows.length, 'workout_logs');
      }

      // Re-read rather than patching local state by hand: the server owns
      // generated ids and timestamps, and the score rebuild below needs the
      // full history in order to compute rolling baselines correctly.
      await get().loadAll(userId, { silent: true });
      await get().recomputeAll(userId, profile);

      set({ saving: false });
      return {
        ok: true,
        health: healthRows.length,
        sleep: sleepRows.length,
        workouts: workoutRows.length,
      };
    } catch (error) {
      const message = describeError(error, 'Could not import that file.');
      set({ saving: false, error: message });
      // Keep the raw error for the UI's technical-detail panel: the friendly
      // string is for reading, this is for diagnosing.
      return {
        ok: false,
        message,
        detail: [error?.code, error?.message, error?.details, error?.hint]
          .filter(Boolean)
          .join(' — '),
      };
    }
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
