import { useEffect, useMemo, useState } from 'react';
import { Moon, Sunrise, Save, Trash2, BedDouble } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';

import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { todayKey, relativeDay, formatHours, hoursBetween, isFutureKey, chartTick } from '../lib/dates';
import { calcSleepScore, scoreColor, mean } from '../lib/scores';
import { ScoreRing } from '../components/ScoreRing';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Field,
  Alert,
  RatingScale,
  Badge,
  EmptyState,
  Skeleton,
} from '../components/ui';
import EditGate, { useCanEdit } from '../components/EditGate';
import ChartTooltip from '../components/ChartTooltip';
import SleepStages from '../components/SleepStages';

const QUALITY_LABELS = ['Terrible', 'Poor', 'OK', 'Good', 'Excellent'];

export default function Sleep() {
  const user = useAuthStore((s) => s.user);
  const canEdit = useCanEdit();
  const profile = useAuthStore((s) => s.profile);
  const { sleep, saveSleep, deleteDaily, saving, loading, series } = useDataStore();
  // Needed in the chart memo below — `series` itself is a stable method and
  // would otherwise freeze the chart at whatever the store held on first render.
  const scores = useDataStore((s) => s.scores);

  const [date, setDate] = useState(todayKey());
  const [form, setForm] = useState({
    bedtime: '23:00',
    wake_time: '07:00',
    duration_hours: '',
    quality_rating: 3,
  });
  const [status, setStatus] = useState({ tone: null, message: '' });

  const existing = sleep.find((r) => r.date === date) ?? null;

  useEffect(() => {
    const row = sleep.find((r) => r.date === date);
    setForm({
      bedtime: row?.bedtime?.slice(0, 5) ?? '23:00',
      wake_time: row?.wake_time?.slice(0, 5) ?? '07:00',
      duration_hours: row?.duration_hours ?? '',
      quality_rating: row?.quality_rating ?? 3,
    });
    setStatus({ tone: null, message: '' });
  }, [date, sleep]);

  // Duration is derived from bed/wake times unless the user overrides it.
  const derivedHours = hoursBetween(form.bedtime, form.wake_time);
  const effectiveHours = form.duration_hours === '' ? derivedHours : Number(form.duration_hours);

  const preview = calcSleepScore({
    durationHours: effectiveHours,
    qualityRating: form.quality_rating,
    stages: existing
      ? { deep_hours: existing.deep_hours, rem_hours: existing.rem_hours, awake_hours: existing.awake_hours }
      : null,
  });

  const chartData = useMemo(
    () =>
      series(14)
        .map((d) => ({ ...d, tick: chartTick(d.date) }))
        .filter((d) => d.sleep_hours !== null || d.date <= todayKey()),
    // series() reads `sleep` and `scores` off the store; the lint rule cannot
    // see through the call, but without them the chart never updates after
    // data loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, sleep, scores]
  );

  const avgHours = useMemo(() => mean(sleep.slice(0, 7).map((r) => r.duration_hours)), [sleep]);

  const submit = async (e) => {
    e.preventDefault();
    setStatus({ tone: null, message: '' });

    if (isFutureKey(date)) {
      setStatus({ tone: 'error', message: 'You cannot log sleep for a future date.' });
      return;
    }
    if (!Number.isFinite(effectiveHours) || effectiveHours <= 0 || effectiveHours > 24) {
      setStatus({ tone: 'error', message: 'Sleep duration must be between 0 and 24 hours.' });
      return;
    }

    const result = await saveSleep({
      userId: user.id,
      date,
      profile,
      values: {
        duration_hours: Number(effectiveHours.toFixed(2)),
        quality_rating: Number(form.quality_rating) || null,
        bedtime: form.bedtime || null,
        wake_time: form.wake_time || null,
      },
    });

    setStatus(
      result.ok
        ? { tone: 'success', message: 'Sleep saved — scores recalculated.' }
        : { tone: 'error', message: result.message }
    );
  };

  const remove = async () => {
    const result = await deleteDaily('sleep_logs', 'sleep', { userId: user.id, date, profile });
    if (result.ok) setStatus({ tone: 'success', message: 'Entry deleted.' });
  };

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-5 p-5">
          <ScoreRing value={preview.score} size={104} stroke={10} sublabel="Sleep" />
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold tabular-nums">{formatHours(effectiveHours)}</p>
            <p className="muted text-xs">
              {relativeDay(date)} ·{' '}
              {QUALITY_LABELS[(Number(form.quality_rating) || 3) - 1] ?? 'OK'} quality
            </p>
            {Number.isFinite(avgHours) ? (
              <p className="muted mt-2 text-[11px]">
                7-night average <strong>{formatHours(avgHours)}</strong>
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge color={scoreColor(preview.breakdown.duration)}>
                Duration {preview.breakdown.duration}
              </Badge>
              <Badge color={scoreColor(preview.breakdown.quality)}>
                Quality {preview.breakdown.quality}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      <SleepStages night={existing} />

      <Card delay={60}>
        <CardHeader title="Log sleep" subtitle="Last night, or any past night" icon={BedDouble} />
        <CardBody>
          <EditGate className="mb-3" />
          <form onSubmit={submit} className="space-y-4">
            <Field label="Night of" hint="the morning you woke up">
              <Input
                type="date"
                value={date}
                max={todayKey()}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Bedtime">
                <div className="relative">
                  <Moon
                    size={15}
                    className="muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <Input
                    className="pl-9"
                    type="time"
                    value={form.bedtime}
                    onChange={(e) => setForm((f) => ({ ...f, bedtime: e.target.value }))}
                  />
                </div>
              </Field>
              <Field label="Wake time">
                <div className="relative">
                  <Sunrise
                    size={15}
                    className="muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <Input
                    className="pl-9"
                    type="time"
                    value={form.wake_time}
                    onChange={(e) => setForm((f) => ({ ...f, wake_time: e.target.value }))}
                  />
                </div>
              </Field>
            </div>

            <Field
              label="Duration"
              hint={
                derivedHours
                  ? `auto: ${formatHours(derivedHours)} — leave blank to use it`
                  : 'hours slept'
              }
            >
              <Input
                type="number"
                step="0.25"
                min="0"
                max="24"
                inputMode="decimal"
                value={form.duration_hours}
                onChange={(e) => setForm((f) => ({ ...f, duration_hours: e.target.value }))}
                placeholder={derivedHours ? String(derivedHours) : '7.5'}
                unit="h"
              />
            </Field>

            <Field label="How rested do you feel?" hint={`${form.quality_rating}/5`}>
              <RatingScale
                value={form.quality_rating}
                onChange={(v) => setForm((f) => ({ ...f, quality_rating: v ?? 3 }))}
                labels={QUALITY_LABELS}
              />
            </Field>

            {status.message ? <Alert tone={status.tone}>{status.message}</Alert> : null}

            <div className="flex gap-2">
              <Button type="submit" size="lg" loading={saving} icon={Save} className="flex-1" disabled={!canEdit}>
                Save
              </Button>
              {existing ? (
                <Button type="button" variant="danger" size="lg" icon={Trash2} onClick={remove} disabled={!canEdit}>
                  Delete
                </Button>
              ) : null}
            </div>
          </form>
        </CardBody>
      </Card>

      <Card delay={120}>
        <CardHeader title="Last 14 nights" subtitle="Bars are coloured by sleep score" icon={Moon} />
        <CardBody>
          {chartData.some((d) => d.sleep_hours) ? (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                  <XAxis
                    dataKey="tick"
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, 12]}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--track)', opacity: 0.4 }}
                    content={
                      <ChartTooltip
                        formatters={{ sleep_hours: (v) => formatHours(v) }}
                        labels={{ sleep_hours: 'Sleep', sleep_score: 'Sleep score' }}
                      />
                    }
                  />
                  <ReferenceLine
                    y={8}
                    stroke="var(--text-muted)"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                    label={{ value: '8h', position: 'right', fontSize: 9, fill: 'var(--text-muted)' }}
                  />
                  <Bar dataKey="sleep_hours" radius={[4, 4, 0, 0]} maxBarSize={22}>
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.date}
                        fill={
                          entry.sleep_score !== null
                            ? scoreColor(entry.sleep_score)
                            : 'var(--track)'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={Moon}
              title="No sleep logged yet"
              body="Log a few nights and the chart will fill in. Sleep is 30% of your readiness score."
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
