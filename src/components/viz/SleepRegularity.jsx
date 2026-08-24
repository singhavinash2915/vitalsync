import { useMemo } from 'react';

import { seriesColor } from '../../lib/viz';
import { useChartTheme } from './ChartFrame';
import { shortDate } from '../../lib/dates';

/** Minutes since 18:00, so an evening bedtime and a morning wake sit on one axis. */
const AXIS_START_HOUR = 18;
const AXIS_HOURS = 18; // 6pm through noon

function toOffset(time) {
  if (!time) return null;
  const [h, m] = String(time).split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  const minutes = h * 60 + (m || 0);
  const start = AXIS_START_HOUR * 60;
  // Wrap post-midnight times onto the far side of the axis.
  return minutes >= start ? minutes - start : minutes + (24 * 60 - start);
}

const label = (time) => (time ? String(time).slice(0, 5) : '');

/**
 * When sleep actually happened, night by night.
 *
 * Duration alone hides the thing that most often explains a bad morning: the
 * night that started at 2am. Each bar spans bedtime to wake on a shared 6pm-to-
 * noon axis, so a drifting schedule shows up as a staircase rather than as
 * seven similar-looking totals.
 *
 * Renders nothing without times. Those columns were null on every night until
 * the parser was fixed to keep the start and end of each sleep record instead
 * of only summing their durations — so an empty chart here means an import that
 * predates that fix, not a person who never slept.
 */
export default function SleepRegularity({ sleep = [], nights = 7 }) {
  const theme = useChartTheme();
  const color = seriesColor(0, theme.isDark);

  const rows = useMemo(
    () =>
      [...sleep]
        .filter((s) => s.bedtime && s.wake_time)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, nights)
        .reverse()
        .map((s) => {
          const from = toOffset(s.bedtime);
          const to = toOffset(s.wake_time);
          return from === null || to === null ? null : { date: s.date, from, to, bedtime: s.bedtime, wake: s.wake_time };
        })
        .filter(Boolean),
    [sleep, nights]
  );

  if (!rows.length) return null;

  const span = AXIS_HOURS * 60;
  const ticks = [18, 22, 2, 6, 12];

  return (
    <div>
      <div className="relative mb-1 flex justify-between text-[9px]" style={{ color: theme.axis.tick.fill }}>
        {ticks.map((h) => (
          <span key={h}>{h === 12 ? 'noon' : `${h % 12 || 12}${h < 12 || h === 12 ? 'am' : 'pm'}`}</span>
        ))}
      </div>

      <div className="space-y-1.5">
        {rows.map((r) => {
          const left = (r.from / span) * 100;
          const width = Math.max(2, ((r.to - r.from + (r.to < r.from ? span : 0)) / span) * 100);
          return (
            <div key={r.date} className="flex items-center gap-2">
              <span className="muted w-12 shrink-0 text-[9px]">{shortDate(r.date)}</span>
              <div className="relative h-3.5 flex-1 overflow-hidden rounded-full" style={{ background: theme.track }}>
                <div
                  className="absolute inset-y-0 rounded-full"
                  style={{ left: `${left}%`, width: `${width}%`, background: color }}
                  title={`${label(r.bedtime)} to ${label(r.wake)}`}
                />
              </div>
              <span className="muted w-20 shrink-0 text-right text-[9px] tabular-nums">
                {label(r.bedtime)}–{label(r.wake)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
