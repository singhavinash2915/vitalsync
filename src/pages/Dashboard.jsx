import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  HeartPulse,
  Heart,
  Footprints,
  Flame,
  Droplets,
  Thermometer,
  Moon,
  Dumbbell,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { computeDailyScores, scoreColor, scoreLabel, exertionLabel } from '../lib/scores';
import { buildInsights, readinessAdvice, weeklySummary, personalRecords } from '../lib/insights';
import { todayKey, prettyDateLong, formatHours } from '../lib/dates';
import { ScoreRing, ScoreBar } from '../components/ScoreRing';
import { Card, CardHeader, CardBody, Button, Skeleton, EmptyState, Badge } from '../components/ui';
import { InsightsList, WeeklySummaryCard, PersonalRecordsCard } from '../components/InsightsPanel';
import { SyncStrip } from '../components/SyncStatus';

/** Small metric tile used in the "Today" grid. */
function MetricTile({ icon: Icon, label, value, unit, hint, tone = 'accent' }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon
          size={13}
          aria-hidden="true"
          className={tone === 'accent' ? 'text-accent' : 'text-score-poor'}
        />
        <span className="muted text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-bold leading-none tabular-nums">
        {empty ? <span className="muted text-base">—</span> : value}
        {!empty && unit ? <span className="muted ml-0.5 text-[11px] font-normal">{unit}</span> : null}
      </p>
      {hint ? <p className="muted mt-1 text-[10px]">{hint}</p> : null}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export default function Dashboard() {
  const profile = useAuthStore((s) => s.profile);
  const loading = useDataStore((s) => s.loading);
  const health = useDataStore((s) => s.health);
  const sleepLogs = useDataStore((s) => s.sleep);
  const workoutLogs = useDataStore((s) => s.workouts);
  const journalLogs = useDataStore((s) => s.journal);
  const scores = useDataStore((s) => s.scores);

  const date = todayKey();

  // Recompute live from the store rather than reading the persisted `scores`
  // row, so edits reflect instantly even before the upsert round-trips.
  const bundle = useMemo(() => {
    const dayHealth = health.find((r) => r.date === date) ?? null;
    const daySleep = sleepLogs.find((r) => r.date === date) ?? null;
    const dayJournal = journalLogs.find((r) => r.date === date) ?? null;
    const dayWorkouts = workoutLogs.filter((r) => r.date === date);
    const history = health.filter((r) => r.date < date);
    const sleepHistory = sleepLogs.filter((r) => r.date < date);

    return {
      dayHealth,
      daySleep,
      dayJournal,
      dayWorkouts,
      history,
      sleepHistory,
      computed: computeDailyScores({
        health: dayHealth,
        sleep: daySleep,
        journal: dayJournal,
        workouts: dayWorkouts,
        history,
        sleepHistory,
        profile,
      }),
    };
  }, [health, sleepLogs, workoutLogs, journalLogs, date, profile]);

  const { computed, dayHealth, daySleep, dayWorkouts, history, sleepHistory } = bundle;

  const insights = useMemo(
    () =>
      buildInsights({
        today: dayHealth,
        history,
        sleepToday: daySleep,
        sleepHistory,
        workouts: workoutLogs.filter((w) => w.date > todayKeyMinus7(date)),
      }),
    [dayHealth, history, daySleep, sleepHistory, workoutLogs, date]
  );

  const summary = useMemo(
    () => weeklySummary([...scores].sort((a, b) => (a.date > b.date ? 1 : -1))),
    [scores]
  );

  const records = useMemo(
    () => personalRecords({ health, sleep: sleepLogs, workouts: workoutLogs, scores }),
    [health, sleepLogs, workoutLogs, scores]
  );

  if (loading) return <DashboardSkeleton />;

  const readiness = computed.readiness_score;
  const firstName = profile?.name?.split(' ')[0];

  return (
    <div className="space-y-4">
      <SyncStrip />

      {/* ---------------- Hero: readiness ---------------- */}
      <Card className="overflow-hidden">
        <div className="flex flex-col items-center px-4 pb-5 pt-6">
          <div className="mb-4 text-center">
            <p className="muted flex items-center justify-center gap-1.5 text-[11px]">
              <CalendarDays size={12} aria-hidden="true" />
              {prettyDateLong(date)}
            </p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight">
              {firstName ? `Good day, ${firstName}` : 'Your readiness'}
            </h1>
          </div>

          <ScoreRing
            value={readiness}
            size={172}
            stroke={14}
            sublabel="Readiness"
          />

          <p
            className="mt-3 max-w-xs text-center text-xs leading-relaxed"
            style={{ color: computed.hasData ? 'var(--text)' : 'var(--text-muted)' }}
          >
            {computed.hasData
              ? readinessAdvice(readiness)
              : 'Nothing logged today yet. Add your morning numbers to generate today’s scores.'}
          </p>

          {!computed.hasData ? (
            <Link to="/log" className="mt-4">
              <Button size="sm" icon={Plus}>
                Log today’s data
              </Button>
            </Link>
          ) : (
            <Badge color={scoreColor(readiness)} className="mt-3">
              {scoreLabel(readiness)}
            </Badge>
          )}
        </div>

        {/* ---------------- Three supporting rings ---------------- */}
        <div
          className="grid grid-cols-3 gap-2 border-t px-3 py-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <ScoreRing value={computed.recovery_score} size={82} stroke={8} label="Recovery" />
          <ScoreRing value={computed.sleep_score} size={82} stroke={8} label="Sleep" />
          <ScoreRing
            value={computed.exertion_score}
            size={82}
            stroke={8}
            label="Exertion"
            color="#a855f7"
            statusLabel={exertionLabel(computed.exertion_score)}
          />
        </div>
      </Card>

      {/* ---------------- Today's raw numbers ---------------- */}
      <Card delay={60}>
        <CardHeader
          title="Today"
          subtitle="Tap any value to edit"
          icon={HeartPulse}
          action={
            <Link to="/log">
              <Button size="sm" variant="secondary" icon={Plus}>
                Log
              </Button>
            </Link>
          }
        />
        <CardBody className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricTile
            icon={HeartPulse}
            label="HRV"
            value={dayHealth?.hrv ?? null}
            unit="ms"
            hint={
              computed.breakdown.baselines.hrv
                ? `7d avg ${computed.breakdown.baselines.hrv}`
                : 'building baseline'
            }
          />
          <MetricTile
            icon={Heart}
            label="Resting HR"
            value={dayHealth?.resting_hr ?? null}
            unit="bpm"
            tone="poor"
            hint={
              computed.breakdown.baselines.restingHr
                ? `7d avg ${computed.breakdown.baselines.restingHr}`
                : 'building baseline'
            }
          />
          <MetricTile
            icon={Moon}
            label="Sleep"
            value={daySleep?.duration_hours ? formatHours(daySleep.duration_hours) : null}
            hint={daySleep?.quality_rating ? `quality ${daySleep.quality_rating}/5` : 'not logged'}
          />
          <MetricTile
            icon={Flame}
            label="Active cal"
            value={dayHealth?.active_calories?.toLocaleString() ?? null}
            unit="kcal"
            hint={`target ${computed.breakdown.exertion.target}`}
          />
          <MetricTile
            icon={Footprints}
            label="Steps"
            value={dayHealth?.steps?.toLocaleString() ?? null}
          />
          <MetricTile icon={Droplets} label="SpO₂" value={dayHealth?.spo2 ?? null} unit="%" />
          <MetricTile
            icon={Thermometer}
            label="Body temp"
            value={dayHealth?.body_temp ?? null}
            unit="°C"
          />
          <MetricTile
            icon={Dumbbell}
            label="Workouts"
            value={dayWorkouts.length || null}
            hint={
              dayWorkouts.length
                ? `${dayWorkouts.reduce((s, w) => s + (w.duration_mins || 0), 0)} min total`
                : 'rest day'
            }
          />
        </CardBody>
      </Card>

      {/* ---------------- Score breakdown ---------------- */}
      {computed.hasData ? (
        <Card delay={90}>
          <CardHeader
            title="How today was calculated"
            subtitle="Each component before weighting"
          />
          <CardBody className="space-y-3">
            <ScoreBar
              label="HRV vs baseline (60% of recovery)"
              value={computed.breakdown.recovery.hrvScore}
            />
            <ScoreBar
              label="Resting HR vs baseline (40% of recovery)"
              value={computed.breakdown.recovery.rhrScore}
            />
            <ScoreBar
              label="Sleep duration (60% of sleep)"
              value={computed.breakdown.sleep.duration}
            />
            <ScoreBar
              label="Sleep quality (40% of sleep)"
              value={computed.breakdown.sleep.quality}
            />
            <ScoreBar
              label="Active calories vs target"
              value={computed.breakdown.exertion.calorieScore}
              color="#a855f7"
            />

            {computed.breakdown.recovery.modifiers.length ? (
              <div className="pt-1">
                <p className="muted mb-1.5 text-[10px] uppercase tracking-wide">
                  Lifestyle adjustments
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {computed.breakdown.recovery.modifiers.map((m) => (
                    <Badge
                      key={m.label}
                      color={m.value > 0 ? '#22c55e' : '#ef4444'}
                    >
                      {m.label} {m.value > 0 ? '+' : ''}
                      {m.value}
                    </Badge>
                  ))}
                  {computed.breakdown.exertion.intensityBonus ? (
                    <Badge color="#a855f7">
                      Workout intensity +{computed.breakdown.exertion.intensityBonus}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <InsightsList insights={insights} />
      <WeeklySummaryCard summary={summary} />
      <PersonalRecordsCard records={records} />

      {/* ---------------- Quick actions ---------------- */}
      <Card delay={240}>
        <CardBody className="space-y-1 p-2">
          {[
            { to: '/log', label: 'Log health metrics', icon: HeartPulse },
            { to: '/workouts', label: 'Add a workout', icon: Dumbbell },
            { to: '/sleep', label: 'Log last night’s sleep', icon: Moon },
            { to: '/trends', label: 'See your trends', icon: Flame },
          ].map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Icon size={16} className="text-accent" aria-hidden="true" />
              <span className="flex-1 text-sm font-medium">{label}</span>
              <ChevronRight size={15} className="muted" aria-hidden="true" />
            </Link>
          ))}
        </CardBody>
      </Card>

      {!health.length && !sleepLogs.length ? (
        <Card delay={280}>
          <EmptyState
            icon={HeartPulse}
            title="No history yet"
            body="Recovery gets meaningful after about a week of HRV and resting heart rate readings. Log manually, or wire up the Apple Watch sync from Settings."
            action={
              <Link to="/log">
                <Button size="sm" icon={Plus}>
                  Log your first day
                </Button>
              </Link>
            }
          />
        </Card>
      ) : null}
    </div>
  );
}

/** Local helper: the day-key 7 days before `date`. */
function todayKeyMinus7(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
