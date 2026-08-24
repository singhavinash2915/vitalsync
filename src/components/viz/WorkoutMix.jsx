import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

import { seriesPalette, ALL_PAIRS_CAP } from '../../lib/viz';
import { useChartTheme, ChartLegend } from './ChartFrame';

/**
 * Where the training actually went.
 *
 * A donut compares every slice against every other, so it is an all-pairs form:
 * the four-slot series palette cannot be used in full here, because with all
 * pairs on screen the fourth slot puts yellow beside orange and the separation
 * floors fail. Three named categories, then "Other" in a neutral grey — which
 * is also the more honest chart, since a fourth thin slice rarely says anything.
 */
export default function WorkoutMix({ workouts = [], days = 30 }) {
  const theme = useChartTheme();
  const palette = seriesPalette(theme.isDark);

  const slices = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const from = cutoff.toISOString().slice(0, 10);

    const counts = new Map();
    for (const w of workouts) {
      if (!w.date || w.date < from) continue;
      const key = (w.type ?? 'other').toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, ALL_PAIRS_CAP);
    const rest = sorted.slice(ALL_PAIRS_CAP).reduce((sum, [, n]) => sum + n, 0);

    const out = top.map(([name, value], i) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: palette[i],
    }));
    // "Other" is deliberately neutral: it is a bucket, not an identity, and
    // giving it a hue would imply it names one thing.
    if (rest) out.push({ name: 'Other', value: rest, color: 'var(--viz-other)' });
    return out;
  }, [workouts, days, palette]);

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (!total) return null;

  return (
    <div>
      <div className="relative h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              innerRadius="62%"
              outerRadius="92%"
              startAngle={90}
              endAngle={-270}
              // 2px surface gap between adjacent fills.
              paddingAngle={2}
              stroke="none"
            >
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={theme.tooltip}
              formatter={(value, name) => [`${value} session${value === 1 ? '' : 's'}`, name]}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums">{total}</span>
          <span className="muted text-[10px]">sessions</span>
        </div>
      </div>

      <ChartLegend
        className="mt-2 justify-center"
        items={slices.map((s) => ({ label: `${s.name} ${s.value}`, color: s.color }))}
      />
    </div>
  );
}
