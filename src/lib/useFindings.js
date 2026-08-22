import { useMemo } from 'react';

import { useDataStore } from '../store/useDataStore';
import { discoverFindings } from './discover';

/**
 * Findings over the deepest history available.
 *
 * `fullHistory` arrives a moment after the windowed `health` slice, so until it
 * lands the findings run on 120 days and quietly under-report their samples.
 * Preferring whichever is longer means the screen fills immediately and then
 * sharpens, rather than sitting empty or — worse — showing a confident number
 * derived from a fraction of the record.
 */
export function useFindings() {
  const health = useDataStore((s) => s.health);
  const fullHistory = useDataStore((s) => s.fullHistory);
  const sleep = useDataStore((s) => s.sleep);
  const fullSleep = useDataStore((s) => s.fullSleepHistory);
  const loading = useDataStore((s) => s.fullHistoryLoading);

  const rows = fullHistory.length >= health.length ? fullHistory : health;
  const nights = fullSleep.length >= sleep.length ? fullSleep : sleep;

  return {
    findings: useMemo(() => discoverFindings({ health: rows, sleep: nights }), [rows, nights]),
    days: rows.length,
    refining: loading,
  };
}
