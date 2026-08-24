import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

import { useDataStore } from '../../store/useDataStore';
import { deviationIndex } from '../../lib/discover';
import { shortDate, todayKey, shiftKey } from '../../lib/dates';
import { seriesColor } from '../../lib/viz';
import { useChartTheme, ChartLegend } from './ChartFrame';

const METRICS = [
  { key: 'hrv', label: 'HRV', column: 'hrv' },
  { key: 'resting_hr', label: 'Resting HR', column: 'resting_hr' },
];

/**
 * Recovery against the input that drives it, on ONE axis.
 *
 * The screen this imitates plots recovery in percent and HRV in milliseconds on
 * two different y-scales. That is the most common charting mistake there is:
 * where the two lines cross is decided by the scales you happen to choose, so
 * rescaling either axis rewrites the story without touching the data.
 *
 * Both series are therefore shown as percent against their own 60-day baseline,
 * which is the unit `discover.js` already reasons in and the only one where the
 * comparison means anything: "how far from normal is each of these today". One
 * axis, no arbitrary crossings, same shape.
 *
 * Worth knowing while reading it: recovery is *computed from* these inputs —
 * 60% HRV, 40% resting heart rate — so tight agreement is arithmetic, not
 * discovery. What is worth looking for is the days they come apart, which is
 * where the other half of the formula was doing the work.
 */
export default function RecoveryTrend({ days = 14 }) {
  const health = useDataStore((s) => s.health);
  const fullHistory = useDataStore((s) => s.fullHistory);
  const scores = useDataStore((s) => s.scores);
  const theme = useChartTheme();
  const [metric, setMetric] = useState('hrv');

  const rows = fullHistory.length >= health.length ? fullHistory : health;
  const active = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  const data = useMemo(() => {
    const metricDev = deviationIndex(rows, active.column);
    const recoveryDev = deviationIndex(
      scores.map((s) => ({ date: s.date, recovery: s.recovery_score })),
      'recovery'
    );

    const from = shiftKey(todayKey(), -(days - 1));
    const dates = [...new Set([...metricDev.keys(), ...recoveryDev.keys()])]
      .filter((d) => d >= from && d <= todayKey())
      .sort();

    return dates.map((date) => ({
      date,
      tick: shortDate(date),
      recovery: recoveryDev.has(date) ? Math.round(recoveryDev.get(date) * 10) / 10 : null,
      metric: metricDev.has(date) ? Math.round(metricDev.get(date) * 10) / 10 : null,
    }));
  }, [rows, scores, active.column, days]);

  const usable = data.filter((d) => d.recovery !== null || d.metric !== null);
  if (usable.length < 3) return null;

  const recoveryColor = seriesColor(0, theme.isDark);
  const metricColor = seriesColor(1, theme.isDark);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <ChartLegend
          items={[
            { label: 'Recovery', color: recoveryColor },
            { label: active.label, color: metricColor },
          ]}
        />
        <div className="flex gap-0.5 rounded-lg p-0.5" style={{ background: 'var(--bg-sunken)' }}>
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className="rounded-md px-2 py-1 text-[10px] font-medium transition-colors"
              style={
                m.key === metric
                  ? { background: 'var(--bg-elevated)', color: 'var(--text)' }
                  : { color: 'var(--text-muted)' }
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="tick" {...theme.axis} interval="preserveStartEnd" minTickGap={22} />
            <YAxis {...theme.axis} tickFormatter={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}%`} width={42} />
            {/* Zero is each series' own normal, which is what makes one axis honest. */}
            <ReferenceLine y={0} stroke={theme.grid} strokeDasharray="3 3" />
            <Tooltip
              contentStyle={theme.tooltip}
              labelStyle={{ color: 'var(--text-muted)' }}
              formatter={(value, name) => [
                value === null ? '—' : `${value > 0 ? '+' : ''}${value}% vs baseline`,
                name === 'recovery' ? 'Recovery' : active.label,
              ]}
            />
            <Line
              type="monotone"
              dataKey="recovery"
              name="recovery"
              stroke={recoveryColor}
              strokeWidth={2}
              dot={{ r: 2.5, strokeWidth: 0, fill: recoveryColor }}
              activeDot={{ r: 5 }}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="metric"
              name="metric"
              stroke={metricColor}
              strokeWidth={2}
              dot={{ r: 2.5, strokeWidth: 0, fill: metricColor }}
              activeDot={{ r: 5 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="muted mt-1 text-[10px] leading-relaxed">
        Both plotted against their own 60-day baseline, so they share one scale.
        {active.key === 'resting_hr'
          ? ' Resting heart rate is inverted in the score — a rise is a bad sign, so the lines diverging is expected.'
          : ' Recovery is 60% HRV, so close agreement is the formula, not a finding — the days they part are the interesting ones.'}
      </p>
    </div>
  );
}
