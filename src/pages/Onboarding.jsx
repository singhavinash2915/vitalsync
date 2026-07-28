import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Flame, HeartPulse, Scale } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { Button, Input, Field, Select, Alert, Card } from '../components/ui';
import { DEFAULT_CALORIE_TARGET } from '../lib/scores';

const GOALS = [
  { value: 'performance', label: 'Athletic performance', hint: 'Train hard, recover harder' },
  { value: 'endurance', label: 'Endurance', hint: 'Running, cycling, aerobic base' },
  { value: 'strength', label: 'Strength & muscle', hint: 'Lifting and hypertrophy' },
  { value: 'weight_loss', label: 'Body composition', hint: 'Fat loss with recovery intact' },
  { value: 'longevity', label: 'Health & longevity', hint: 'Sleep, stress and steady activity' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { profile, updateProfile } = useAuthStore();

  const [form, setForm] = useState({
    name: profile?.name ?? '',
    age: profile?.age ?? '',
    weight: profile?.weight ?? '',
    height: profile?.height ?? '',
    fitness_goal: profile?.fitness_goal ?? 'performance',
    calorie_target: profile?.calorie_target ?? DEFAULT_CALORIE_TARGET,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    const age = Number(form.age);
    const weight = Number(form.weight);
    if (!Number.isFinite(age) || age < 10 || age > 120) {
      setError('Enter an age between 10 and 120.');
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      setError('Enter your weight in kilograms.');
      return;
    }

    setBusy(true);
    const result = await updateProfile({
      name: form.name.trim() || null,
      age,
      weight,
      height: form.height ? Number(form.height) : null,
      fitness_goal: form.fitness_goal,
      calorie_target: Number(form.calorie_target) || DEFAULT_CALORIE_TARGET,
    });
    setBusy(false);

    if (!result.ok) setError(result.message);
    else navigate('/', { replace: true });
  };

  return (
    <div className="safe-top safe-bottom mx-auto min-h-screen w-full max-w-sm px-5 py-10">
      <div className="mb-6">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent/15">
          <Target size={22} className="text-accent" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Set up your profile</h1>
        <p className="muted mt-1 text-sm">
          Your age and weight refine calorie estimates; the goal tunes the advice you see each
          morning.
        </p>
      </div>

      <Card className="p-5">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name">
            <Input value={form.name} onChange={set('name')} placeholder="Your name" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Age" required>
              <Input
                type="number"
                required
                min="10"
                max="120"
                inputMode="numeric"
                value={form.age}
                onChange={set('age')}
                placeholder="32"
                unit="yrs"
              />
            </Field>
            <Field label="Weight" required>
              <Input
                type="number"
                required
                min="20"
                max="400"
                step="0.1"
                inputMode="decimal"
                value={form.weight}
                onChange={set('weight')}
                placeholder="72"
                unit="kg"
              />
            </Field>
          </div>

          <Field label="Height" hint="optional">
            <Input
              type="number"
              min="80"
              max="250"
              inputMode="numeric"
              value={form.height}
              onChange={set('height')}
              placeholder="175"
              unit="cm"
            />
          </Field>

          <Field label="Primary goal" required>
            <Select value={form.fitness_goal} onChange={set('fitness_goal')}>
              {GOALS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label} — {g.hint}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Daily active calorie target"
            hint="drives your exertion score"
          >
            <Input
              type="number"
              min="100"
              max="3000"
              step="25"
              inputMode="numeric"
              value={form.calorie_target}
              onChange={set('calorie_target')}
              unit="kcal"
            />
          </Field>

          {error ? <Alert tone="error">{error}</Alert> : null}

          <Button type="submit" size="lg" loading={busy} className="w-full">
            Start tracking
          </Button>
        </form>
      </Card>

      <div className="muted mt-6 space-y-2 text-xs">
        <p className="flex items-start gap-2">
          <HeartPulse size={14} className="mt-px shrink-0 text-accent" aria-hidden="true" />
          Recovery compares today&apos;s HRV and resting heart rate against your own 7-day
          baseline — expect the first week to read neutral while it learns.
        </p>
        <p className="flex items-start gap-2">
          <Flame size={14} className="mt-px shrink-0 text-accent" aria-hidden="true" />
          Exertion is measured against the calorie target above. You can change it any time in
          Settings.
        </p>
        <p className="flex items-start gap-2">
          <Scale size={14} className="mt-px shrink-0 text-accent" aria-hidden="true" />
          Nothing here leaves your Supabase project. Row-level security keeps every row scoped to
          your user id.
        </p>
      </div>
    </div>
  );
}
