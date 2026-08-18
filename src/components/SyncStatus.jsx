import { useMemo } from 'react';
import clsx from 'clsx';
import { RefreshCw, CheckCircle2, AlertTriangle, CloudOff, Watch } from 'lucide-react';

import { useDataStore } from '../store/useDataStore';
import { useAuthStore } from '../store/useAuthStore';
import { summariseSync, timeAgo, sourceLabel } from '../lib/syncStatus';
import { relativeDay } from '../lib/dates';

const STATES = {
  live: { icon: CheckCircle2, color: '#22c55e', tone: 'bg-score-excellent/10' },
  stale: { icon: AlertTriangle, color: '#f97316', tone: 'bg-score-moderate/10' },
  behind: { icon: AlertTriangle, color: '#f97316', tone: 'bg-score-moderate/10' },
  empty: { icon: CloudOff, color: '#8494a6', tone: 'bg-black/5 dark:bg-white/5' },
};

/** Shared summary so both the compact strip and the detail panel agree. */
function useSync() {
  const health = useDataStore((s) => s.health);
  const sleep = useDataStore((s) => s.sleep);
  const workouts = useDataStore((s) => s.workouts);
  return useMemo(() => summariseSync({ health, sleep, workouts }), [health, sleep, workouts]);
}

/**
 * One line on the dashboard answering "is my data actually arriving?".
 *
 * It deliberately reports the last *write* rather than the newest date: a
 * shortcut that keeps firing but exports a stale range looks healthy by date
 * alone, and a broken shortcut looks healthy for a day by write time alone.
 * Whichever is worse decides the colour.
 */
export function SyncStrip() {
  const sync = useSync();
  const loading = useDataStore((s) => s.loading);
  if (loading) return null;

  const { icon: Icon, color, tone } = STATES[sync.state] ?? STATES.empty;

  const headline =
    sync.state === 'empty'
      ? 'No data yet'
      : sync.daysBehind > 0
        ? `Data through ${relativeDay(sync.newestDate)}`
        : 'Up to date';

  const detail =
    sync.state === 'empty'
      ? 'Import an export or set up the sync automation'
      : `${sourceLabel(sync.lastWriteSource)} · ${timeAgo(sync.lastWrite)}`;

  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border px-3 py-2"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
    >
      <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-lg', tone)}>
        <Icon size={14} style={{ color }} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">{headline}</span>
        <span className="muted block truncate text-[11px]">{detail}</span>
      </span>
      {sync.pushWorking ? (
        <span
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: '#22c55e1a', color: '#22c55e' }}
        >
          <Watch size={10} aria-hidden="true" /> Auto
        </span>
      ) : null}
    </div>
  );
}

/** The full picture, for Settings. */
export function SyncPanel() {
  const sync = useSync();
  const loadAll = useDataStore((s) => s.loadAll);
  const lastFetch = useDataStore((s) => s.lastSyncedAt);
  const userId = useAuthStore((s) => s.user?.id);

  return (
    <div className="space-y-3">
      <div
        className="rounded-xl border p-3"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
      >
        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="muted">Data arrived</dt>
            <dd className="font-semibold">{timeAgo(sync.lastWrite)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="muted">Covers up to</dt>
            <dd className="font-semibold">
              {sync.newestDate ? relativeDay(sync.newestDate) : '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="muted">Automatic sync</dt>
            <dd className="font-semibold" style={{ color: sync.pushWorking ? '#22c55e' : '#f97316' }}>
              {sync.pushWorking ? 'Working' : 'Not seen recently'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="muted">App last refreshed</dt>
            <dd className="font-semibold">{timeAgo(lastFetch)}</dd>
          </div>
        </dl>
      </div>

      {sync.bySource.length ? (
        <div>
          <p className="muted mb-1 text-[10px] uppercase tracking-wide">Where your data came from</p>
          <ul className="space-y-1">
            {sync.bySource.map((group) => (
              <li
                key={group.source}
                className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="min-w-0">
                  <span className="font-medium">{sourceLabel(group.source)}</span>
                  <span className="muted ml-2">{group.rows.toLocaleString()} rows</span>
                </span>
                <span className="muted shrink-0">{timeAgo(group.lastWrite)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        onClick={() => userId && loadAll(userId)}
        className="muted flex items-center gap-1.5 text-[11px] hover:text-accent"
      >
        <RefreshCw size={11} aria-hidden="true" /> Refresh now
      </button>
    </div>
  );
}
