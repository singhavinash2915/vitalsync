import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  Cell,
} from 'recharts';
import { CalendarRange } from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { computeDailyScores, scoreColor, mean } from '../lib/scores';
import { ACTIVITIES, sessionFor } from '../lib/training';
import { todayKey, fromKey } from '../lib/dates';
import { Card, CardHeader, CardBody, Badge } from './ui';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The week at a glance: readiness as a line, load as bars behind it.
 *
 * The shaded band is your own typical range — the mean of the last 60 days
 * give or take a standard deviation. Without it a reading of 56 is just a
 * number; against the band you can see whether it is an ordinary day for you
 * or genuinely off. That framing matters more here than anywhere else in the
 * app, because readiness has no meaning outside your own distribution.
 *
 * Scores are recomputed from the raw rows rather than read from the stored
 * `scores` table, so the chart cannot drift from the dashboard after a change
 * to the algorithm.
 */
export default function ReadinessWeek({ days = 7 }) {
  const profile = useAuthStore((s) => s.profile);
  const health = useDataStore((s) => s.health);
  const sleepLogs = useDataStore((s) => s.sleep);
  const workoutLogs = useDataStore((s) => s.workouts);
  const journalLogs = useDataStore((s) => s.journal);
  const plan = useDataStore((s) => s.plan);

  const { points, band, average } = useMemo(() => {
    const today = todayKey();
    const keys = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      keys.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      );
    }

    const healthBy = new Map(health.map((r) => [r.date, r]));
    const sleepBy = new Map(sleepLogs.map((r) => [r.date, r]));
    const journalBy = new Map(journalLogs.map((r) => [r.date, r]));

    const scoreOn = (date) => {
      const row = healthBy.get(date);
      if (!row) return null;
      return computeDailyScores({
        health: row,
        sleep: sleepBy.get(date) ?? null,
        journal: journalBy.get(date) ?? null,
        workouts: workoutLogs.filter((w) => w.date === date),
        history: health.filter((r) => r.date < date),
        sleepHistory: sleepLogs.filter((r) => r.date < date),
        profile,
      });
    };

    const series = keys.map((date) => {
      const computed = scoreOn(date);
      const session = sessionFor(plan ?? [], fromKey(date));
      return {
        date,
        label: DAY_LABELS[fromKey(date).getDay()],
        readiness: computed?.readiness_score ?? null,
        load: computed?.exertion_score ?? null,
        activity: session?.activity ?? null,
        isToday: date === today,
      };
    });

    // Typical range from the wider history, not just this week — a week is far
    // too few points to say what "normal" looks like.
    const recent = health
      .filter((r) => r.date < today)
      .slice(0, 60)
      .map((r) => scoreOn(r.date)?.readiness_score)
      .filter((v) => Number.isFinite(v));

    const avg = mean(recent);
    let spread = null;
    if (avg !== null && recent.length >= 10) {
      spread = Math.sqrt(mean(recent.map((v) => (v - avg) ** 2)));
    }

    return {
      points: series,
      average: avg === null ? null : Math.round(avg),
      band:
        avg === null || spread === null
          ? null
          : [Math.max(0, Math.round(avg - spread)), Math.min(100, Math.round(avg + spread))],
    };
  }, [health, sleepLogs, workoutLogs, journalLogs, plan, profile, days]);

  const scored = points.filter((p) => p.readiness !== null);
  if (scored.length < 2) return null;

  const latest = scored[scored.length - 1];
  const weekAvg = Math.round(mean(scored.map((p) => p.readiness)));

  return (
    <Card delay={30}>
      <CardHeader
        title="This week"
        subtitle={
          band
            ? `Shaded band is your usual range, ${band[0]}–${band[1]}`
            : 'Readiness day by day'
        }
        icon={CalendarRange}
        action={<Badge color={scoreColor(weekAvg)}>avg {weekAvg}</Badge>}
      />
      <CardBody>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 6, bottom: 0, left: -26 }}>
              {band ? (
                <ReferenceArea
                  y1={band[0]}
                  y2={band[1]}
                  fill="var(--viz-1)"
                  fillOpacity={0.09}
                  strokeOpacity={0}
                />
              ) : null}

              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'var(--track)', opacity: 0.35 }}
                contentStyle={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  fontSize: 11,
                }}
                labelStyle={{ color: 'var(--text-muted)' }}
                formatter={(value, name) => [value, name === 'readiness' ? 'Readiness' : 'Load']}
              />

              {/* Load sits behind as bars; readiness is the line you read. */}
              <Bar dataKey="load" radius={[3, 3, 0, 0]} maxBarSize={26} fillOpacity={0.35}>
                {points.map((p) => (
                  <Cell
                    key={p.date}
                    fill={p.activity ? (ACTIVITIES[p.activity]?.color ?? 'var(--viz-2)') : 'var(--viz-2)'}
                  />
                ))}
              </Bar>

              <Line
                type="monotone"
                dataKey="readiness"
                stroke="var(--viz-1)"
                strokeWidth={2.5}
                connectNulls={false}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (cy === null || cy === undefined) return null;
                  return (
                    <circle
                      key={payload.date}
                      cx={cx}
                      cy={cy}
                      r={payload.isToday ? 5 : 3}
                      fill={scoreColor(payload.readiness)}
                      stroke={payload.isToday ? 'var(--bg-elevated)' : 'none'}
                      strokeWidth={payload.isToday ? 2 : 0}
                    />
                  );
                }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 rounded" style={{ background: 'var(--viz-1)' }} aria-hidden="true" />
            <span className="muted">Readiness</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: 'color-mix(in srgb, var(--viz-2) 33%, transparent)' }} aria-hidden="true" />
            <span className="muted">Load, coloured by planned session</span>
          </span>
        </div>

        {average !== null ? (
          <p className="muted mt-2 text-[11px] leading-relaxed">
            {latest.readiness >= (band?.[1] ?? average)
              ? `Today's ${latest.readiness} is above your usual range — this is a day to use.`
              : latest.readiness <= (band?.[0] ?? average)
                ? `Today's ${latest.readiness} sits below your usual range of ${band ? `${band[0]}–${band[1]}` : average}. One day is noise; three in a row is a pattern.`
                : `Today's ${latest.readiness} is an ordinary day for you — your 60-day average is ${average}.`}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
