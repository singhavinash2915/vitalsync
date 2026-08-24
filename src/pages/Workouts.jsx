import { useMemo, useState } from 'react';
import {
  Dumbbell,
  Plus,
  Trash2,
  Clock,
  Flame,
  Pencil,
  Bike,
  Waves,
  Footprints,
  HeartPulse,
  Mountain,
} from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { todayKey, relativeDay } from '../lib/dates';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Field,
  Select,
  TextArea,
  Alert,
  Modal,
  RatingScale,
  EmptyState,
  Badge,
  Skeleton,
} from '../components/ui';
import EditGate, { useCanEdit } from '../components/EditGate';
import { calcExertionScore } from '../lib/scores';

const TYPES = [
  { value: 'run', label: 'Run', icon: Footprints, met: 9.8 },
  { value: 'cycle', label: 'Cycling', icon: Bike, met: 8.0 },
  { value: 'swim', label: 'Swimming', icon: Waves, met: 7.0 },
  { value: 'strength', label: 'Strength training', icon: Dumbbell, met: 5.0 },
  { value: 'hiit', label: 'HIIT', icon: HeartPulse, met: 10.0 },
  { value: 'walk', label: 'Walk / hike', icon: Mountain, met: 4.3 },
  { value: 'yoga', label: 'Yoga / mobility', icon: Waves, met: 2.5 },
  { value: 'sport', label: 'Sport', icon: Dumbbell, met: 7.5 },
  { value: 'other', label: 'Other', icon: Dumbbell, met: 6.0 },
];

const typeMeta = (value) => TYPES.find((t) => t.value === value) ?? TYPES[TYPES.length - 1];

/**
 * MET-based calorie estimate: kcal = MET × weight(kg) × hours, scaled by how
 * hard the session felt relative to a "typical" 6/10 effort.
 */
function estimateCalories({ type, durationMins, intensity, weightKg }) {
  const weight = Number(weightKg) > 0 ? Number(weightKg) : 70;
  const mins = Number(durationMins) || 0;
  const met = typeMeta(type).met;
  const intensityFactor = 0.7 + (Number(intensity) || 6) * 0.05; // 6/10 → 1.0
  return Math.round(met * weight * (mins / 60) * intensityFactor);
}

const blankWorkout = () => ({
  date: todayKey(),
  type: 'run',
  duration_mins: 45,
  intensity: 6,
  calories_burned: '',
  notes: '',
});

export default function Workouts() {
  const user = useAuthStore((s) => s.user);
  const canEdit = useCanEdit();
  const profile = useAuthStore((s) => s.profile);
  const { workouts, saveWorkout, deleteWorkout, saving, loading } = useDataStore();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(blankWorkout);
  const [error, setError] = useState('');

  const autoCalories = estimateCalories({
    type: draft.type,
    durationMins: draft.duration_mins,
    intensity: draft.intensity,
    weightKg: profile?.weight,
  });

  const exertionPreview = calcExertionScore({
    activeCalories: draft.calories_burned || autoCalories,
    workouts: [{ intensity: draft.intensity, duration_mins: draft.duration_mins }],
    calorieTarget: profile?.calorie_target,
  });

  const grouped = useMemo(() => {
    const map = new Map();
    workouts.forEach((w) => {
      if (!map.has(w.date)) map.set(w.date, []);
      map.get(w.date).push(w);
    });
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [workouts]);

  const weekStats = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const key = cutoff.toISOString().slice(0, 10);
    const recent = workouts.filter((w) => w.date >= key);
    return {
      sessions: recent.length,
      minutes: recent.reduce((s, w) => s + (Number(w.duration_mins) || 0), 0),
      calories: recent.reduce((s, w) => s + (Number(w.calories_burned) || 0), 0),
    };
  }, [workouts]);

  const openNew = () => {
    setDraft(blankWorkout());
    setError('');
    setOpen(true);
  };

  const openEdit = (workout) => {
    setDraft({ ...workout, calories_burned: workout.calories_burned ?? '' });
    setError('');
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    const duration = Number(draft.duration_mins);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) {
      setError('Duration must be between 1 and 1440 minutes.');
      return;
    }

    const result = await saveWorkout({
      userId: user.id,
      profile,
      workout: {
        ...(draft.id ? { id: draft.id } : {}),
        date: draft.date,
        type: draft.type,
        duration_mins: duration,
        intensity: Number(draft.intensity) || 5,
        calories_burned: draft.calories_burned === '' ? autoCalories : Number(draft.calories_burned),
        notes: draft.notes?.trim() || null,
      },
    });

    if (result.ok) setOpen(false);
    else setError(result.message);
  };

  const remove = async (workout) => {
    await deleteWorkout({ userId: user.id, id: workout.id, date: workout.date, profile });
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="grid grid-cols-3 gap-2 p-4">
          {[
            { label: 'Sessions', value: weekStats.sessions, unit: '' },
            { label: 'Minutes', value: weekStats.minutes, unit: '' },
            { label: 'Calories', value: weekStats.calories.toLocaleString(), unit: 'kcal' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-2xl font-bold tabular-nums text-accent">{stat.value}</p>
              <p className="muted text-[10px] uppercase tracking-wide">
                {stat.label} {stat.unit}
              </p>
            </div>
          ))}
          <p className="muted col-span-3 text-center text-[10px]">Last 7 days</p>
        </CardBody>
      </Card>

      <EditGate />
      <Button size="lg" icon={Plus} className="w-full" onClick={openNew} disabled={!canEdit}>
        Log a workout
      </Button>

      {!grouped.length ? (
        <Card delay={60}>
          <EmptyState
            icon={Dumbbell}
            title="No workouts logged"
            body="Sessions feed your exertion score, which in turn pulls down readiness — that is how the app knows when you need a rest day."
            action={
              <Button size="sm" icon={Plus} onClick={openNew} disabled={!canEdit}>
                Log your first workout
              </Button>
            }
          />
        </Card>
      ) : (
        grouped.map(([date, items], groupIndex) => (
          <Card key={date} delay={60 + groupIndex * 30}>
            <CardHeader
              title={relativeDay(date)}
              subtitle={`${items.length} session${items.length > 1 ? 's' : ''} · ${items.reduce(
                (s, w) => s + (Number(w.duration_mins) || 0),
                0
              )} min`}
            />
            <CardBody className="space-y-2">
              {items.map((workout) => {
                const meta = typeMeta(workout.type);
                return (
                  <div
                    key={workout.id}
                    className="flex items-start gap-3 rounded-xl border p-3"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15">
                      <meta.icon size={16} className="text-accent" aria-hidden="true" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{meta.label}</p>
                        <Badge
                          color={
                            workout.intensity >= 8
                              ? 'var(--status-poor)'
                              : workout.intensity >= 6
                                ? 'var(--status-moderate)'
                                : 'var(--status-excellent)'
                          }
                        >
                          {workout.intensity}/10
                        </Badge>
                      </div>
                      <p className="muted mt-0.5 flex flex-wrap items-center gap-x-3 text-xs">
                        <span className="flex items-center gap-1">
                          <Clock size={11} aria-hidden="true" />
                          {workout.duration_mins} min
                        </span>
                        {workout.calories_burned ? (
                          <span className="flex items-center gap-1">
                            <Flame size={11} aria-hidden="true" />
                            {workout.calories_burned} kcal
                          </span>
                        ) : null}
                      </p>
                      {workout.notes ? (
                        <p className="muted mt-1 text-xs italic">{workout.notes}</p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => openEdit(workout)}
                        aria-label="Edit workout"
                        className="muted grid h-8 w-8 place-items-center rounded-lg hover:bg-black/5 hover:text-accent dark:hover:bg-white/5"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => remove(workout)}
                        aria-label="Delete workout"
                        className="muted grid h-8 w-8 place-items-center rounded-lg hover:bg-score-poor/10 hover:text-score-poor"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        ))
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={draft.id ? 'Edit workout' : 'Log a workout'}
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required>
              <Input
                type="date"
                required
                max={todayKey()}
                value={draft.date}
                onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
              />
            </Field>
            <Field label="Duration" required>
              <Input
                type="number"
                required
                min="1"
                max="1440"
                inputMode="numeric"
                value={draft.duration_mins}
                onChange={(e) => setDraft((d) => ({ ...d, duration_mins: e.target.value }))}
                unit="min"
              />
            </Field>
          </div>

          <Field label="Type" required>
            <Select
              value={draft.type}
              onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Intensity" hint={`${draft.intensity}/10`}>
            <RatingScale
              max={10}
              value={draft.intensity}
              onChange={(v) => setDraft((d) => ({ ...d, intensity: v ?? 5 }))}
              labels={['Very easy', 'Max effort']}
            />
          </Field>

          <Field
            label="Calories burned"
            hint={`auto-estimate ${autoCalories} kcal`}
          >
            <Input
              type="number"
              min="0"
              max="10000"
              inputMode="numeric"
              value={draft.calories_burned}
              onChange={(e) => setDraft((d) => ({ ...d, calories_burned: e.target.value }))}
              placeholder={String(autoCalories)}
              unit="kcal"
            />
          </Field>

          <Field label="Notes">
            <TextArea
              value={draft.notes ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="How did it feel? Anything worth remembering."
            />
          </Field>

          <Alert tone="info">
            This session alone would put exertion at about{' '}
            <strong>{exertionPreview.score}%</strong> of your daily target.
          </Alert>

          {error ? <Alert tone="error">{error}</Alert> : null}

          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} className="flex-1">
              {draft.id ? 'Update' : 'Save workout'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
