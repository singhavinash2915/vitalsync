import { useMemo, useState } from 'react';
import {
  Dumbbell, Plus, Trash2, TrendingUp, TrendingDown, Minus, Trophy, Watch,
  AlertTriangle, BarChart3, Search,
} from 'lucide-react';

import { useDataStore } from '../store/useDataStore';
import { useAuthStore } from '../store/useAuthStore';
import { prescribeSession } from '../lib/coach';
import { detectIllnessSignal } from '../lib/illness';
import { useFindings } from '../lib/useFindings';
import {
  setsForDate,
  progressFor,
  exerciseList,
  estimateOneRepMax,
  suggestNextLoad,
  detectStall,
  weeklyVolume,
} from '../lib/strength';
import { BODY_PARTS, exercisesForPart } from '../lib/exercises';
import { proteinTarget } from '../lib/nutrition';
import { latestScan } from '../lib/body';
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
    // Strip the prescription off the movement name: "Box squat to parallel
    // 4×5 @ RPE 7" is a set-and-rep scheme, but the button is a lift. Also
    // drops the trailing punctuation a substituted phrase leaves behind
    // ("Split squat to a pad, 3×10 each leg" -> "Split squat to a pad").
    .map((item) => {
      const trimmed = item
        .replace(/[,–—-]?\s*\d+\s*×.*$/i, '')
        .replace(/[,;:\s]+$/, '')
        .trim();
      // Some lines lead with the number ("6 × 90s bike interval"), where
      // stripping leaves nothing. Keep the original rather than dropping a
      // real prescription off the list.
      return trimmed || item.trim();
    })
    .filter(Boolean);
}

/**
 * Body part, then lift.
 *
 * Typing an exercise name on a phone between sets is friction nobody accepts
 * for long, so the default path is two taps. Lifts already trained come first,
 * because those are the ones likely to recur, and anything missing can still be
 * typed — the catalogue should never be a wall.
 */
function ExercisePicker({ open, onClose, onPick, history }) {
  const [part, setPart] = useState(null);
  const [custom, setCustom] = useState('');

  const known = new Set(history.map((h) => h.exercise.toLowerCase()));
  const list = part ? exercisesForPart(part) : [];
  const mine = part
    ? history.filter((h) => !exercisesForPart(part).some((e) => e.name.toLowerCase() === h.exercise.toLowerCase()))
    : history;

  return (
    <Modal open={open} onClose={onClose} title={part ? 'Pick a lift' : 'What did you train?'} size="lg">
      <div className="space-y-3">
        {!part ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {BODY_PARTS.map((b) => (
                <button
                  key={b.key}
                  onClick={() => setPart(b.key)}
                  className="flex items-center gap-2 rounded-xl border px-3 py-3 text-left transition-colors hover:border-accent"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span aria-hidden="true">{b.emoji}</span>
                  <span className="text-sm font-medium">{b.label}</span>
                </button>
              ))}
            </div>
            {mine.length ? (
              <div>
                <p className="muted mb-1.5 text-[10px] font-semibold uppercase tracking-wider">Recently trained</p>
                <div className="flex flex-wrap gap-1.5">
                  {mine.slice(0, 8).map((h) => (
                    <button
                      key={h.exercise}
                      onClick={() => onPick(h.exercise)}
                      className="rounded-full border px-2.5 py-1.5 text-[11px] hover:border-accent hover:text-accent"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      {h.exercise}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <button onClick={() => setPart(null)} className="muted text-[11px] hover:text-accent">
              ← all body parts
            </button>
            <div className="space-y-1">
              {list.map((e) => (
                <button
                  key={e.name}
                  onClick={() => onPick(e.name)}
                  className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors hover:border-accent"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="text-xs font-medium">{e.name}</span>
                  <span className="muted text-[10px]">
                    {known.has(e.name.toLowerCase()) ? 'logged before' : e.muscles.join(', ')}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <p className="muted mb-1.5 text-[10px] font-semibold uppercase tracking-wider">Something else</p>
          <div className="flex gap-2">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Name the exercise"
              className="flex-1"
            />
            <Button icon={Search} disabled={!custom.trim()} onClick={() => onPick(custom.trim())}>
              Add
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function SetForm({ open, onClose, onSave, exercise, lastSession, suggestion }) {
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [rpe, setRpe] = useState('');

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
        {lastSession?.best ? (
          <p className="muted rounded-xl px-2.5 py-2 text-[11px]" style={{ background: 'var(--bg-elevated)' }}>
            Last time: <strong>{toNumber(lastSession.best.weight_kg)} kg × {toNumber(lastSession.best.reps)}</strong>
            {lastSession.date ? ` (${relativeDay(lastSession.date)})` : ''}
          </p>
        ) : null}

        {suggestion ? (
          <button
            type="button"
            onClick={() => { setWeight(String(suggestion.weight)); setReps(String(suggestion.reps)); }}
            className="w-full rounded-xl px-2.5 py-2 text-left text-[11px] leading-relaxed"
            style={{ background: '#38bdf814', color: '#38bdf8' }}
          >
            <strong>Suggested: {suggestion.weight} kg × {suggestion.reps}</strong>
            {suggestion.change ? ` (${suggestion.change > 0 ? '+' : ''}${suggestion.change} kg)` : ''}
            <span className="block opacity-80">{suggestion.reason} Tap to use.</span>
          </button>
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
  const { strengthSets, workouts, plan, scores, health, meals, bodyComposition, addStrengthSet, deleteStrengthSet } =
    useDataStore();
  const { user, profile } = useAuthStore();
  const canEdit = useCanEdit();
  const { findings } = useFindings();
  const [active, setActive] = useState(null);
  const [picking, setPicking] = useState(false);

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
  const volume = useMemo(() => weeklyVolume(strengthSets), [strengthSets]);

  // Stalls are diagnosed against nutrition and readiness, so a flat lift is
  // reported with a cause rather than left as a shrug.
  const target = useMemo(
    () => proteinTarget({ profile, latestScan: latestScan(bodyComposition) }),
    [profile, bodyComposition]
  );
  const stalls = useMemo(
    () =>
      exerciseList(strengthSets)
        .map(({ exercise }) =>
          detectStall(strengthSets, exercise, { nutrition: meals, scores, proteinTarget: target.grams })
        )
        .filter(Boolean),
    [strengthSets, meals, scores, target.grams]
  );
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

      {canEdit ? (
        <Button size="lg" icon={Plus} className="w-full" onClick={() => setPicking(true)}>
          Log a lift
        </Button>
      ) : null}

      {stalls.map((stall) => (
        <Card key={stall.exercise} delay={150}>
          <CardBody className="flex items-start gap-3 p-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: '#f9731614', color: '#f97316' }}>
              <AlertTriangle size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">{stall.exercise} has stopped moving</p>
              <p className="muted mt-0.5 text-[11px] leading-relaxed">
                Estimated max {stall.from} → {stall.to} kg across {stall.sessions} sessions. {stall.detail}
              </p>
            </div>
          </CardBody>
        </Card>
      ))}

      {volume.length ? (
        <Card delay={160}>
          <CardHeader
            title="This week's volume"
            subtitle="Working sets per muscle — about 10 holds muscle in a deficit"
            icon={BarChart3}
          />
          <CardBody className="space-y-1.5">
            {volume.map((v) => (
              <div key={v.muscle} className="flex items-center gap-2">
                <span className="muted w-20 shrink-0 truncate text-[10px] capitalize">{v.muscle}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--track)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (v.sets / v.target) * 100)}%`,
                      background: v.enough ? '#22c55e' : '#f97316',
                    }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-[10px] font-semibold tabular-nums">
                  {v.sets}/{v.target}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

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

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(name) => { setPicking(false); setActive(name); }}
        history={history}
      />

      <SetForm
        open={Boolean(active)}
        onClose={() => setActive(null)}
        onSave={save}
        exercise={active}
        lastSession={active ? progressFor(strengthSets, active)?.last : null}
        suggestion={active ? suggestNextLoad(strengthSets, active) : null}
      />
    </div>
  );
}
