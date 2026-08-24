import { useMemo, useState } from 'react';
import { Dumbbell, Plus, Trash2, TrendingUp, TrendingDown, Minus, Trophy, Watch } from 'lucide-react';

import { useDataStore } from '../store/useDataStore';
import { useAuthStore } from '../store/useAuthStore';
import { prescribeSession } from '../lib/coach';
import { detectIllnessSignal } from '../lib/illness';
import { useFindings } from '../lib/useFindings';
import { setsForDate, progressFor, exerciseList, estimateOneRepMax } from '../lib/strength';
import { toNumber } from '../lib/scores';
import { todayKey, prettyDate, relativeDay } from '../lib/dates';
import EditGate, { useCanEdit } from '../components/EditGate';
import { Card, CardHeader, CardBody, Button, Input, Field, Modal, Badge } from '../components/ui';

/** Pulls the movement names out of a prescribed session's Main/Support blocks. */
function plannedLifts(session) {
  if (!session?.blocks) return [];
  return session.blocks
    .filter((b) => ['Main', 'Support', 'Skill'].includes(b.name))
    .flatMap((b) => b.items)
    .map((item) => item.replace(/\s+\d+×.*$/, '').trim())
    .filter(Boolean);
}

function SetForm({ open, onClose, onSave, exercise, lastSession }) {
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [rpe, setRpe] = useState('');

  const suggestion = lastSession?.best;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={exercise || 'Log a set'}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={!reps || !weight}
            onClick={() => {
              onSave({ reps: Number(reps), weight_kg: Number(weight), rpe: rpe ? Number(rpe) : null });
              setReps('');
              setWeight('');
              setRpe('');
            }}
          >
            Add set
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {suggestion ? (
          <p className="muted rounded-xl px-2.5 py-2 text-[11px]" style={{ background: 'var(--bg-elevated)' }}>
            Last time: <strong>{toNumber(suggestion.weight_kg)} kg × {toNumber(suggestion.reps)}</strong>
            {lastSession.date ? ` (${relativeDay(lastSession.date)})` : ''}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Weight">
            <Input type="number" inputMode="decimal" step="0.5" unit="kg" value={weight} onChange={(e) => setWeight(e.target.value)} autoFocus />
          </Field>
          <Field label="Reps">
            <Input type="number" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
          </Field>
        </div>
        <Field label="RPE" hint="optional — how hard it felt, 1 to 10">
          <Input type="number" inputMode="decimal" step="0.5" value={rpe} onChange={(e) => setRpe(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export default function Strength() {
  const { strengthSets, workouts, plan, scores, health, addStrengthSet, deleteStrengthSet } = useDataStore();
  const { user, profile } = useAuthStore();
  const canEdit = useCanEdit();
  const { findings } = useFindings();
  const [active, setActive] = useState(null);

  const date = todayKey();

  // The watch already recorded that a session happened. Attach to it rather
  // than creating a second row that says the same thing.
  const syncedSession = useMemo(
    () => workouts.find((w) => w.date === date && /strength|functional|traditional/i.test(w.type ?? '')) ?? null,
    [workouts, date]
  );

  const ordered = useMemo(() => [...scores].sort((a, b) => (a.date < b.date ? -1 : 1)), [scores]);
  const prescription = useMemo(
    () =>
      prescribeSession({
        readiness: ordered.at(-1)?.readiness_score,
        trend: ordered.slice(-7).map((s) => s.readiness_score),
        plan,
        findings,
        profile,
        illness: detectIllnessSignal(health),
      }),
    [ordered, plan, findings, profile, health]
  );

  const logged = useMemo(() => setsForDate(strengthSets, date), [strengthSets, date]);
  const loggedNames = new Set(logged.map((g) => g.exercise.toLowerCase()));
  const suggestions = plannedLifts(prescription).filter((n) => !loggedNames.has(n.toLowerCase()));
  const history = useMemo(() => exerciseList(strengthSets), [strengthSets]);

  const save = async (entry) => {
    const existing = logged.find((g) => g.exercise === active)?.sets ?? [];
    await addStrengthSet({
      userId: user.id,
      date,
      workoutId: syncedSession?.id ?? null,
      set: { ...entry, exercise: active, set_index: existing.length + 1 },
    });
    setActive(null);
  };

  return (
    <div className="space-y-4">
      <EditGate />

      <Card delay={0}>
        <CardHeader
          title={prescription.title}
          subtitle={prettyDate(date)}
          icon={Dumbbell}
          action={syncedSession ? <Badge color="#22c55e">synced</Badge> : null}
        />
        <CardBody className="space-y-2">
          {syncedSession ? (
            <p className="muted flex items-center gap-1.5 text-[11px]">
              <Watch size={12} aria-hidden="true" />
              Your watch logged {syncedSession.duration_mins} min ·{' '}
              {syncedSession.calories_burned} kcal. Sets below attach to it.
            </p>
          ) : (
            <p className="muted text-[11px]">
              No session synced from your watch yet today — sets you log now will stand on their own.
            </p>
          )}

          {prescription.substitutions?.length ? (
            <div className="space-y-1 pt-1">
              {prescription.substitutions.map((s) => (
                <p
                  key={s.replaced}
                  className="rounded-xl px-2.5 py-1.5 text-[10px] leading-relaxed"
                  style={{ background: '#f9731614', color: '#f97316' }}
                >
                  <s>{s.replaced}</s> → <strong>{s.text}</strong> ({s.why})
                </p>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {logged.map((group, i) => {
        const progress = progressFor(strengthSets, group.exercise);
        const Icon =
          progress?.direction === 'up' ? TrendingUp : progress?.direction === 'down' ? TrendingDown : Minus;
        return (
          <Card key={group.exercise} delay={40 + i * 20}>
            <CardHeader
              title={group.exercise}
              subtitle={
                progress?.estimatedMax
                  ? `est. 1RM ${progress.estimatedMax} kg${progress.delta ? ` (${progress.delta > 0 ? '+' : ''}${progress.delta.toFixed(1)} vs last)` : ''}`
                  : `${group.sets.length} set${group.sets.length > 1 ? 's' : ''}`
              }
              icon={progress?.isPersonalBest ? Trophy : Icon}
              action={
                canEdit ? (
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => setActive(group.exercise)}>
                    Set
                  </Button>
                ) : null
              }
            />
            <CardBody className="space-y-1">
              {group.sets.map((set) => (
                <div key={set.id} className="flex items-center gap-2 text-xs">
                  <span className="muted w-6 shrink-0 tabular-nums">#{set.set_index}</span>
                  <span className="flex-1 font-medium tabular-nums">
                    {toNumber(set.weight_kg)} kg × {toNumber(set.reps)}
                    {set.rpe ? <span className="muted font-normal"> @ RPE {toNumber(set.rpe)}</span> : null}
                  </span>
                  <span className="muted shrink-0 text-[10px] tabular-nums">
                    {estimateOneRepMax(set.weight_kg, set.reps) ?? '—'} e1RM
                  </span>
                  {canEdit ? (
                    <button
                      onClick={() => deleteStrengthSet({ id: set.id })}
                      className="muted shrink-0 hover:text-score-poor"
                      aria-label="Delete set"
                    >
                      <Trash2 size={12} />
                    </button>
                  ) : null}
                </div>
              ))}
            </CardBody>
          </Card>
        );
      })}

      {suggestions.length && canEdit ? (
        <Card delay={140}>
          <CardHeader title="Today's programme" subtitle="Tap to start logging a lift" icon={Dumbbell} />
          <CardBody className="flex flex-wrap gap-1.5">
            {suggestions.map((name) => (
              <button
                key={name}
                onClick={() => setActive(name)}
                className="rounded-full border px-2.5 py-1.5 text-[11px] transition-colors hover:border-accent hover:text-accent"
                style={{ borderColor: 'var(--border)' }}
              >
                + {name}
              </button>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {history.length ? (
        <Card delay={180}>
          <CardHeader title="Your lifts" subtitle="Most recently trained first" icon={TrendingUp} />
          <CardBody className="space-y-1.5">
            {history.slice(0, 10).map(({ exercise, lastDate }) => {
              const p = progressFor(strengthSets, exercise);
              return (
                <button
                  key={exercise}
                  onClick={() => canEdit && setActive(exercise)}
                  className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition-colors hover:border-accent"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{exercise}</span>
                  <span className="muted shrink-0 text-[10px]">{relativeDay(lastDate)}</span>
                  {p?.estimatedMax ? (
                    <span className="shrink-0 font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                      {p.estimatedMax} kg
                    </span>
                  ) : null}
                </button>
              );
            })}
          </CardBody>
        </Card>
      ) : null}

      <SetForm
        open={Boolean(active)}
        onClose={() => setActive(null)}
        onSave={save}
        exercise={active}
        lastSession={active ? progressFor(strengthSets, active)?.last : null}
      />
    </div>
  );
}
