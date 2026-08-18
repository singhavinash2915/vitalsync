import { Moon, Info } from 'lucide-react';
import { Card, CardHeader, CardBody, Badge } from './ui';
import { sleepQualityFromStages, clamp } from '../lib/scores';
import { formatHours } from '../lib/dates';

/**
 * The night broken into its stages.
 *
 * Both data sources have carried this all along — Health Auto Export sends
 * core/deep/rem/awake, and Apple's export.xml records each stage as its own
 * segment — and it was being collapsed into a single duration. The split is
 * what makes an objective quality judgement possible, and deep sleep in
 * particular is the part of a night that tracks physical recovery.
 *
 * Percentages are judged against adult norms rather than against you, because
 * unlike HRV these ranges genuinely are population-level.
 */
const STAGES = [
  { key: 'deep_hours', label: 'Deep', color: '#6366f1', healthy: [0.13, 0.23], note: 'physical repair' },
  { key: 'rem_hours', label: 'REM', color: '#38bdf8', healthy: [0.2, 0.25], note: 'memory, mood' },
  { key: 'core_hours', label: 'Core', color: '#818cf8', healthy: [0.45, 0.65], note: 'the bulk of the night' },
  { key: 'awake_hours', label: 'Awake', color: '#f97316', healthy: [0, 0.08], note: 'interruptions' },
];

const verdict = (fraction, [lo, hi]) => {
  if (!Number.isFinite(fraction)) return null;
  if (fraction >= lo && fraction <= hi) return { label: 'Good', color: '#22c55e' };
  // Being *below* the healthy band matters for restorative stages; being above
  // only matters for time awake.
  if (fraction < lo) return { label: 'Low', color: '#f97316' };
  return { label: 'High', color: '#f97316' };
};

export default function SleepStages({ night }) {
  const total = Number(night?.duration_hours);
  const hasStages = STAGES.some((s) => Number(night?.[s.key]) > 0);
  if (!night || !Number.isFinite(total) || total <= 0 || !hasStages) return null;

  // Awake time sits outside "asleep", so the bar is drawn over the full window.
  const awake = Number(night.awake_hours) || 0;
  const window = total + awake;

  const derived = sleepQualityFromStages(night);
  const efficiency = awake > 0 ? (total / window) * 100 : null;

  return (
    <Card delay={40}>
      <CardHeader
        title="Last night, stage by stage"
        subtitle={`${formatHours(total)} asleep${awake > 0 ? ` · ${formatHours(awake)} awake` : ''}`}
        icon={Moon}
        action={derived !== null ? <Badge color="#38bdf8">Quality {derived}</Badge> : null}
      />
      <CardBody className="space-y-3">
        {/* Proportional bar across the whole sleep window */}
        <div className="flex h-3 overflow-hidden rounded-full" style={{ background: 'var(--track)' }}>
          {STAGES.map((stage) => {
            const hours = Number(night[stage.key]) || 0;
            if (hours <= 0) return null;
            return (
              <div
                key={stage.key}
                style={{ width: `${(hours / window) * 100}%`, background: stage.color }}
                title={`${stage.label} ${formatHours(hours)}`}
              />
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {STAGES.map((stage) => {
            const hours = Number(night[stage.key]);
            if (!Number.isFinite(hours) || hours <= 0) return null;

            // Restorative stages are a share of time asleep; time awake is a
            // share of the whole window in bed.
            const denominator = stage.key === 'awake_hours' ? window : total;
            const fraction = hours / denominator;
            const status = verdict(fraction, stage.healthy);

            return (
              <div
                key={stage.key}
                className="rounded-xl border p-2.5"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: stage.color }}
                      aria-hidden="true"
                    />
                    {stage.label}
                  </span>
                  {status ? (
                    <span className="text-[10px] font-semibold" style={{ color: status.color }}>
                      {status.label}
                    </span>
                  ) : null}
                </div>

                <p className="mt-1 text-sm font-bold tabular-nums">{formatHours(hours)}</p>

                <div
                  className="mt-1.5 h-1 overflow-hidden rounded-full"
                  style={{ background: 'var(--track)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${clamp(fraction * 100, 0, 100)}%`,
                      background: stage.color,
                    }}
                  />
                </div>
                <p className="muted mt-1 text-[10px]">
                  {(fraction * 100).toFixed(0)}% · typical {Math.round(stage.healthy[0] * 100)}–
                  {Math.round(stage.healthy[1] * 100)}%
                </p>
              </div>
            );
          })}
        </div>

        {efficiency !== null ? (
          <div
            className="flex items-center justify-between rounded-xl border px-3 py-2"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
          >
            <span className="text-xs font-medium">Sleep efficiency</span>
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: efficiency >= 90 ? '#22c55e' : efficiency >= 80 ? '#eab308' : '#f97316' }}
            >
              {efficiency.toFixed(0)}%
            </span>
          </div>
        ) : null}

        <p className="muted flex items-start gap-1.5 text-[11px] leading-relaxed">
          <Info size={12} className="mt-px shrink-0" aria-hidden="true" />
          These stages now supply the 40% of your sleep score that used to need a manual rating.
          Rate a night yourself and your rating wins.
        </p>
      </CardBody>
    </Card>
  );
}
