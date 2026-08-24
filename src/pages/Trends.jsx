import { useMemo, useState } from 'react';
import WorkoutMix from '../components/viz/WorkoutMix';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { LineChart as LineIcon, HeartPulse, Heart, Moon, Flame, Activity } from 'lucide-react';

import { useDataStore } from '../store/useDataStore';
import { chartTick, formatHours } from '../lib/dates';
import { scoreColor, mean } from '../lib/scores';
import { Card, CardHeader, CardBody, Segmented, EmptyState, Skeleton, Badge } from '../components/ui';
import ChartTooltip from '../components/ChartTooltip';

const RANGES = [
  { value: 7, label: 'Week' },
  { value: 30, label: 'Month' },
  { value: 90, label: '3M' },
  { value: 365, label: 'Year' },
];

const AXIS = {
  tick: { fontSize: 10, fill: 'var(--text-muted)' },
  axisLine: false,
  tickLine: false,
};

const GRID = <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />;

/** Wraps a chart with a title, an average badge and an empty state. */
function ChartCard({ title, subtitle, icon, delay, hasData, average, children, emptyBody }) {
  return (
    <Card delay={delay}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        action={
          average !== null && average !== undefined ? (
            <Badge color="var(--viz-1)">avg {average}</Badge>
          ) : null
        }
      />
      <CardBody>
        {hasData ? (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {children}
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon={icon} title="Not enough data yet" body={emptyBody} />
        )}
      </CardBody>
    </Card>
  );
}

export default function Trends() {
  const [range, setRange] = useState(30);
  const loading = useDataStore((s) => s.loading);
  const series = useDataStore((s) => s.series);

  // `series` is a stable store method, so it can never be the thing that
  // invalidates the memo. The raw slices it reads have to be in the deps or
  // the charts render once against an empty store and never update.
  const health = useDataStore((s) => s.health);
  const sleepLogs = useDataStore((s) => s.sleep);
  const workoutLogs = useDataStore((s) => s.workouts);
  const scores = useDataStore((s) => s.scores);

  const data = useMemo(
    () => series(range).map((d) => ({ ...d, tick: chartTick(d.date) })),
    // series() reads these slices off the store, which the lint rule cannot see
    // through. Drop them and the charts freeze at whatever the store held on
    // first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, range, health, sleepLogs, workoutLogs, scores]
  );

  const has = (key) => data.some((d) => d[key] !== null && d[key] !== undefined);
  const avg = (key) => {
    const v = mean(data.map((d) => d[key]));
    return v === null ? null : Math.round(v * 10) / 10;
  };

  // The HRV baseline line gives every point something to be read against.
  const hrvBaseline = useMemo(() => {
    const v = mean(health.slice(0, 7).map((r) => r.hrv));
    return v === null ? null : Math.round(v * 10) / 10;
  }, [health]);

  const rhrBaseline = useMemo(() => {
    const v = mean(health.slice(0, 7).map((r) => r.resting_hr));
    return v === null ? null : Math.round(v * 10) / 10;
  }, [health]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const anyData = ['recovery', 'hrv', 'resting_hr', 'sleep_hours', 'exertion'].some(has);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-semibold">Trends</h1>
        <Segmented value={range} onChange={setRange} options={RANGES} />
      </div>

      <Card delay={10}>
        <CardHeader
          title="Where the training went"
          subtitle={`Sessions in the last ${range} days`}
          icon={LineIcon}
        />
        <CardBody>
          <WorkoutMix workouts={workoutLogs} days={range} />
        </CardBody>
      </Card>

      {!anyData ? (
        <Card>
          <EmptyState
            icon={LineIcon}
            title="No data in this range"
            body="Log health metrics, sleep and workouts for a few days and every chart here will start filling in."
          />
        </Card>
      ) : null}

      {/* --------- Recovery score trend --------- */}
      <ChartCard
        title="Recovery score"
        subtitle="Higher means better recovered"
        icon={Activity}
        delay={0}
        hasData={has('recovery')}
        average={avg('recovery')}
        emptyBody="Recovery needs both HRV and resting heart rate logged."
      >
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -24 }}>
          {GRID}
          <XAxis dataKey="tick" {...AXIS} interval="preserveStartEnd" minTickGap={18} />
          <YAxis domain={[0, 100]} {...AXIS} />
          <Tooltip content={<ChartTooltip labels={{ recovery: 'Recovery' }} />} />
          <ReferenceLine y={66} stroke="var(--status-excellent)" strokeDasharray="3 3" strokeOpacity={0.4} />
          <ReferenceLine y={33} stroke="var(--status-poor)" strokeDasharray="3 3" strokeOpacity={0.4} />
          <Line
            type="monotone"
            dataKey="recovery"
            name="Recovery"
            stroke="var(--viz-1)"
            strokeWidth={2.5}
            dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--viz-1)' }}
            activeDot={{ r: 5 }}
            connectNulls={false}
            animationDuration={700}
          />
        </LineChart>
      </ChartCard>

      {/* --------- HRV --------- */}
      <ChartCard
        title="Heart rate variability"
        subtitle={hrvBaseline ? `7-day baseline ${hrvBaseline} ms` : 'milliseconds (SDNN)'}
        icon={HeartPulse}
        delay={40}
        hasData={has('hrv')}
        average={avg('hrv')}
        emptyBody="Log your morning HRV to see how it drifts week to week."
      >
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -24 }}>
          <defs>
            <linearGradient id="hrvFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--viz-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {GRID}
          <XAxis dataKey="tick" {...AXIS} interval="preserveStartEnd" minTickGap={18} />
          <YAxis {...AXIS} domain={['dataMin - 8', 'dataMax + 8']} />
          <Tooltip content={<ChartTooltip labels={{ hrv: 'HRV (ms)' }} />} />
          {hrvBaseline ? (
            <ReferenceLine
              y={hrvBaseline}
              stroke="var(--text-muted)"
              strokeDasharray="4 4"
              // insideTopLeft keeps the label inside the plot area; `right`
              // pushes it past the chart edge and gets clipped on mobile.
              label={{
                value: 'baseline',
                position: 'insideTopLeft',
                fontSize: 9,
                fill: 'var(--text-muted)',
              }}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="hrv"
            stroke="none"
            fill="url(#hrvFill)"
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="hrv"
            name="HRV"
            stroke="var(--viz-1)"
            strokeWidth={2.5}
            dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--viz-1)' }}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
        </ComposedChart>
      </ChartCard>

      {/* --------- Resting heart rate --------- */}
      <ChartCard
        title="Resting heart rate"
        subtitle={rhrBaseline ? `7-day baseline ${rhrBaseline} bpm — lower is better` : 'lower is better'}
        icon={Heart}
        delay={80}
        hasData={has('resting_hr')}
        average={avg('resting_hr')}
        emptyBody="Resting HR is the second half of your recovery score."
      >
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -24 }}>
          {GRID}
          <XAxis dataKey="tick" {...AXIS} interval="preserveStartEnd" minTickGap={18} />
          <YAxis {...AXIS} domain={['dataMin - 4', 'dataMax + 4']} />
          <Tooltip content={<ChartTooltip labels={{ resting_hr: 'Resting HR (bpm)' }} />} />
          {rhrBaseline ? (
            <ReferenceLine y={rhrBaseline} stroke="var(--text-muted)" strokeDasharray="4 4" />
          ) : null}
          <Line
            type="monotone"
            dataKey="resting_hr"
            name="Resting HR"
            stroke="var(--viz-2)"
            strokeWidth={2.5}
            dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--viz-2)' }}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
        </LineChart>
      </ChartCard>

      {/* --------- Sleep duration --------- */}
      <ChartCard
        title="Sleep duration"
        subtitle="Bars coloured by that night's sleep score"
        icon={Moon}
        delay={120}
        hasData={has('sleep_hours')}
        average={avg('sleep_hours')}
        emptyBody="Log a few nights on the Sleep tab."
      >
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -24 }}>
          {GRID}
          <XAxis dataKey="tick" {...AXIS} interval="preserveStartEnd" minTickGap={18} />
          <YAxis domain={[0, 12]} {...AXIS} />
          <Tooltip
            cursor={{ fill: 'var(--track)', opacity: 0.4 }}
            content={
              <ChartTooltip
                labels={{ sleep_hours: 'Sleep' }}
                formatters={{ sleep_hours: (v) => formatHours(v) }}
              />
            }
          />
          <ReferenceLine y={8} stroke="var(--status-excellent)" strokeDasharray="3 3" strokeOpacity={0.5} />
          <Bar dataKey="sleep_hours" name="Sleep" radius={[3, 3, 0, 0]} maxBarSize={18}>
            {data.map((entry) => (
              <Cell
                key={entry.date}
                fill={entry.sleep_score !== null ? scoreColor(entry.sleep_score) : 'var(--track)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartCard>

      {/* --------- Exertion vs Recovery --------- */}
      <ChartCard
        title="Exertion vs recovery"
        subtitle="Load you applied against capacity you had"
        icon={Flame}
        delay={160}
        hasData={has('exertion') || has('recovery')}
        emptyBody="Needs at least one day with both a workout or calorie figure and a recovery score."
      >
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -24 }}>
          <defs>
            <linearGradient id="exertionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-2)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--viz-2)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {GRID}
          <XAxis dataKey="tick" {...AXIS} interval="preserveStartEnd" minTickGap={18} />
          <YAxis domain={[0, 100]} {...AXIS} />
          <Tooltip content={<ChartTooltip labels={{ exertion: 'Exertion', recovery: 'Recovery' }} />} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
            iconType="circle"
            iconSize={7}
          />
          <Area
            type="monotone"
            dataKey="exertion"
            name="Exertion"
            stroke="var(--viz-4)"
            strokeWidth={2}
            fill="url(#exertionFill)"
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="recovery"
            name="Recovery"
            stroke="var(--viz-1)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
        </ComposedChart>
      </ChartCard>

      {/* --------- Readiness --------- */}
      <ChartCard
        title="Readiness"
        subtitle="The combined score, day by day"
        icon={Activity}
        delay={200}
        hasData={has('readiness')}
        average={avg('readiness')}
        emptyBody="Readiness appears once recovery, sleep or exertion has data."
      >
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -24 }}>
          <defs>
            <linearGradient id="readyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--viz-1)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--viz-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {GRID}
          <XAxis dataKey="tick" {...AXIS} interval="preserveStartEnd" minTickGap={18} />
          <YAxis domain={[0, 100]} {...AXIS} />
          <Tooltip content={<ChartTooltip labels={{ readiness: 'Readiness' }} />} />
          <Area
            type="monotone"
            dataKey="readiness"
            name="Readiness"
            stroke="var(--viz-1)"
            strokeWidth={2.5}
            fill="url(#readyFill)"
            connectNulls={false}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ChartCard>

      {/* --------- Steps & calories --------- */}
      <ChartCard
        title="Steps & active calories"
        subtitle="Daily movement volume"
        icon={Flame}
        delay={240}
        hasData={has('steps') || has('active_calories')}
        emptyBody="Sync from Apple Watch or enter these manually on the Log screen."
      >
        {/* Two axes and five-digit step counts need real gutters on both sides. */}
        <ComposedChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: -8 }}>
          {GRID}
          <XAxis dataKey="tick" {...AXIS} interval="preserveStartEnd" minTickGap={18} />
          <YAxis
            yAxisId="left"
            {...AXIS}
            width={38}
            tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
          />
          <YAxis yAxisId="right" orientation="right" {...AXIS} width={34} />
          <Tooltip
            content={
              <ChartTooltip
                labels={{ steps: 'Steps', active_calories: 'Active kcal' }}
                formatters={{ steps: (v) => v.toLocaleString() }}
              />
            }
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} iconType="circle" iconSize={7} />
          <Bar
            yAxisId="left"
            dataKey="steps"
            name="Steps"
            fill="var(--viz-1)"
            fillOpacity={0.45}
            radius={[3, 3, 0, 0]}
            maxBarSize={16}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="active_calories"
            name="Active kcal"
            stroke="var(--viz-4)"
            strokeWidth={2.5}
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ChartCard>
    </div>
  );
}
