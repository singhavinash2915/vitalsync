/**
 * Answers the two questions you actually have about an automated sync, which
 * are not the same question:
 *
 *   "Is the automation still running?"  -> when a row was last WRITTEN
 *   "Am I looking at current data?"     -> the newest DATE covered
 *
 * Both can mislead alone. A shortcut that fires every three hours but exports
 * a stale range keeps `lastWrite` fresh while `newestDate` falls behind. A
 * broken shortcut leaves both frozen, but you cannot tell that from a
 * dashboard that simply shows the last day it happens to have.
 */

/** Where a row came from, in the order we'd rather report it. */
const SOURCE_LABELS = {
  'health-sync': 'Apple Health sync',
  import: 'File import',
  manual: 'Entered by hand',
};

export const sourceLabel = (source) => SOURCE_LABELS[source] ?? source ?? 'Unknown';

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const daysBetween = (from, to) =>
  Math.max(0, Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86_400_000));

function newest(rows, key) {
  let best = null;
  for (const row of rows) {
    const value = row?.[key];
    if (value && (!best || value > best)) best = value;
  }
  return best;
}

/**
 * @param {{health:Array, sleep:Array, workouts:Array}} tables
 * @returns {{
 *   lastWrite: string|null, lastWriteSource: string|null,
 *   newestDate: string|null, daysBehind: number|null,
 *   bySource: Array<{source:string, rows:number, lastWrite:string, newestDate:string}>,
 *   pushWorking: boolean, state: 'live'|'stale'|'behind'|'empty',
 * }}
 */
export function summariseSync({ health = [], sleep = [], workouts = [] } = {}) {
  const rows = [...health, ...sleep, ...workouts];

  if (!rows.length) {
    return {
      lastWrite: null,
      lastWriteSource: null,
      newestDate: null,
      daysBehind: null,
      bySource: [],
      pushWorking: false,
      state: 'empty',
    };
  }

  const groups = new Map();
  for (const row of rows) {
    const source = row.source ?? 'manual';
    const written = row.updated_at ?? row.created_at ?? null;
    const group = groups.get(source) ?? { source, rows: 0, lastWrite: null, newestDate: null };
    group.rows += 1;
    if (written && (!group.lastWrite || written > group.lastWrite)) group.lastWrite = written;
    if (row.date && (!group.newestDate || row.date > group.newestDate)) group.newestDate = row.date;
    groups.set(source, group);
  }

  const bySource = [...groups.values()].sort((a, b) =>
    (b.lastWrite ?? '') < (a.lastWrite ?? '') ? -1 : 1
  );

  const lastWrite = newest(rows, 'updated_at') ?? newest(rows, 'created_at');
  const newestDate = newest(rows, 'date');
  const lastWriteSource = bySource.find((g) => g.lastWrite === lastWrite)?.source ?? null;

  // Whole calendar days between the newest row and today, computed on the
  // date strings so a timezone offset can never make "today" look like -1.
  const daysBehind = newestDate === null ? null : daysBetween(newestDate, localToday());

  const push = groups.get('health-sync');
  // A push counts as working only if it both happened recently and delivered
  // data for a recent day — either alone can be true while sync is broken.
  const pushedRecently =
    push?.lastWrite && Date.now() - Date.parse(push.lastWrite) < 36 * 3600 * 1000;

  let state = 'live';
  if (daysBehind !== null && daysBehind >= 3) state = 'behind';
  else if (lastWrite && Date.now() - Date.parse(lastWrite) > 48 * 3600 * 1000) state = 'stale';

  return {
    lastWrite,
    lastWriteSource,
    newestDate,
    daysBehind,
    bySource,
    pushWorking: Boolean(pushedRecently),
    state,
  };
}

/** "4 minutes ago", "3 hours ago", "2 days ago". */
export function timeAgo(timestamp) {
  if (!timestamp) return 'never';
  const ms = Date.now() - Date.parse(timestamp);
  if (!Number.isFinite(ms)) return 'unknown';
  if (ms < 90_000) return 'just now';

  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;

  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
