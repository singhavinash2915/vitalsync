import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HeartPulse,
  Heart,
  Footprints,
  Flame,
  Droplets,
  Thermometer,
  Save,
  Trash2,
  Watch,
} from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { todayKey, isFutureKey, relativeDay } from '../lib/dates';
import { Card, CardHeader, CardBody, Button, Input, Field, Alert, Badge } from '../components/ui';
import EditGate, { useCanEdit } from '../components/EditGate';
import { mean } from '../lib/scores';

const FIELDS = [
  {
    key: 'hrv',
    label: 'Heart rate variability',
    unit: 'ms',
    icon: HeartPulse,
    step: '0.1',
    min: 1,
    max: 400,
    hint: 'Apple Health: HRV (SDNN), overnight average',
  },
  {
    key: 'resting_hr',
    label: 'Resting heart rate',
    unit: 'bpm',
    icon: Heart,
    step: '1',
    min: 25,
    max: 150,
    hint: 'Apple Health: Resting Heart Rate',
  },
  {
    key: 'active_calories',
    label: 'Active calories',
    unit: 'kcal',
    icon: Flame,
    step: '1',
    min: 0,
    max: 10000,
    hint: 'Move ring total',
  },
  { key: 'steps', label: 'Steps', unit: '', icon: Footprints, step: '1', min: 0, max: 200000 },
  {
    key: 'spo2',
    label: 'Blood oxygen',
    unit: '%',
    icon: Droplets,
    step: '0.1',
    min: 50,
    max: 100,
  },
  {
    key: 'body_temp',
    label: 'Wrist temperature',
    unit: '°C',
    icon: Thermometer,
    step: '0.1',
    min: 30,
    max: 45,
  },
];

const emptyForm = () =>
  FIELDS.reduce((acc, f) => {
    acc[f.key] = '';
    return acc;
  }, {});

export default function LogHealth() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const canEdit = useCanEdit();
  const profile = useAuthStore((s) => s.profile);
  const { saveHealth, deleteDaily, healthFor, saving, health } = useDataStore();

  const [date, setDate] = useState(todayKey());
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState({ tone: null, message: '' });

  const existing = healthFor(date);

  // Reload the form whenever the selected day changes.
  useEffect(() => {
    const row = health.find((r) => r.date === date);
    setForm(
      FIELDS.reduce((acc, f) => {
        acc[f.key] = row?.[f.key] ?? '';
        return acc;
      }, {})
    );
    setStatus({ tone: null, message: '' });
  }, [date, health]);

  const baselines = useMemo(() => {
    const prior = health.filter((r) => r.date < date).slice(0, 7);
    return {
      hrv: mean(prior.map((r) => r.hrv)),
      resting_hr: mean(prior.map((r) => r.resting_hr)),
    };
  }, [health, date]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setStatus({ tone: null, message: '' });

    if (isFutureKey(date)) {
      setStatus({ tone: 'error', message: 'You cannot log data for a future date.' });
      return;
    }

    // Reject out-of-range values before they poison the rolling baselines.
    for (const field of FIELDS) {
      const raw = form[field.key];
      if (raw === '' || raw === null) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < field.min || value > field.max) {
        setStatus({
          tone: 'error',
          message: `${field.label} must be between ${field.min} and ${field.max}${field.unit ? ` ${field.unit}` : ''}.`,
        });
        return;
      }
    }

    const values = FIELDS.reduce((acc, f) => {
      acc[f.key] = form[f.key] === '' ? null : Number(form[f.key]);
      return acc;
    }, {});

    if (Object.values(values).every((v) => v === null)) {
      setStatus({ tone: 'error', message: 'Enter at least one measurement.' });
      return;
    }

    const result = await saveHealth({ userId: user.id, date, values, profile });
    if (result.ok) {
      setStatus({ tone: 'success', message: 'Saved — your scores have been recalculated.' });
      if (date === todayKey()) setTimeout(() => navigate('/'), 700);
    } else {
      setStatus({ tone: 'error', message: result.message });
    }
  };

  const remove = async () => {
    const result = await deleteDaily('health_logs', 'health', { userId: user.id, date, profile });
    if (result.ok) {
      setForm(emptyForm());
      setStatus({ tone: 'success', message: 'Entry deleted.' });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Health metrics"
          subtitle={relativeDay(date)}
          icon={HeartPulse}
          action={existing ? <Badge color="#22c55e">Logged</Badge> : null}
        />
        <CardBody>
          <Field label="Date" className="mb-4">
            <Input
              type="date"
              value={date}
              max={todayKey()}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          <EditGate className="mb-3" />
          <form onSubmit={submit} className="space-y-3">
            {FIELDS.map((field) => {
              const baseline = baselines[field.key];
              return (
                <Field
                  key={field.key}
                  label={field.label}
                  hint={
                    Number.isFinite(baseline)
                      ? `7-day avg ${baseline.toFixed(field.key === 'hrv' ? 1 : 0)}${field.unit}`
                      : field.hint
                  }
                >
                  <div className="relative">
                    <field.icon
                      size={15}
                      className="muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <Input
                      className="pl-9"
                      type="number"
                      inputMode="decimal"
                      step={field.step}
                      min={field.min}
                      max={field.max}
                      value={form[field.key]}
                      onChange={set(field.key)}
                      placeholder="—"
                      unit={field.unit || undefined}
                    />
                  </div>
                </Field>
              );
            })}

            {status.message ? <Alert tone={status.tone}>{status.message}</Alert> : null}

            <div className="flex gap-2 pt-1">
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

      <Card delay={80}>
        <CardHeader title="Sync from Apple Watch" icon={Watch} />
        <CardBody>
          <p className="muted text-xs leading-relaxed">
            A browser cannot read Apple Health directly — iOS keeps HealthKit off-limits to web
            apps. Push the data in instead: the <strong>Health Auto Export</strong> app or a free
            iOS Shortcut can POST to your <code>/health-sync</code> Edge Function on a schedule.
            Setup instructions and your endpoint URL are in Settings.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
