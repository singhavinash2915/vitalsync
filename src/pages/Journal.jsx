import { useEffect, useMemo, useState } from 'react';
import {
  NotebookPen,
  Wine,
  Plane,
  Brain,
  Salad,
  Save,
  Trash2,
  History,
} from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { todayKey, relativeDay, isFutureKey } from '../lib/dates';
import { habitModifiers } from '../lib/scores';
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Input,
  Field,
  TextArea,
  Alert,
  Toggle,
  RatingScale,
  Badge,
  EmptyState,
  Skeleton,
} from '../components/ui';

const STRESS_LABELS = ['Very calm', 'Calm', 'Neutral', 'Stressed', 'Overwhelmed'];
const DIET_LABELS = ['Very poor', 'Poor', 'Average', 'Good', 'Excellent'];

const blank = () => ({
  alcohol: false,
  travel: false,
  meditation: false,
  stress_level: 3,
  diet_quality: 3,
  notes: '',
});

export default function Journal() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const { journal, saveJournal, deleteDaily, saving, loading } = useDataStore();

  const [date, setDate] = useState(todayKey());
  const [form, setForm] = useState(blank);
  const [status, setStatus] = useState({ tone: null, message: '' });

  const existing = journal.find((r) => r.date === date) ?? null;

  useEffect(() => {
    const row = journal.find((r) => r.date === date);
    setForm(
      row
        ? {
            alcohol: !!row.alcohol,
            travel: !!row.travel,
            meditation: !!row.meditation,
            stress_level: row.stress_level ?? 3,
            diet_quality: row.diet_quality ?? 3,
            notes: row.notes ?? '',
          }
        : blank()
    );
    setStatus({ tone: null, message: '' });
  }, [date, journal]);

  const { total, applied } = useMemo(() => habitModifiers(form), [form]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setStatus({ tone: null, message: '' });

    if (isFutureKey(date)) {
      setStatus({ tone: 'error', message: 'You cannot journal for a future date.' });
      return;
    }

    const result = await saveJournal({
      userId: user.id,
      date,
      profile,
      values: {
        alcohol: form.alcohol,
        travel: form.travel,
        meditation: form.meditation,
        stress_level: Number(form.stress_level) || null,
        diet_quality: Number(form.diet_quality) || null,
        notes: form.notes?.trim() || null,
      },
    });

    setStatus(
      result.ok
        ? { tone: 'success', message: 'Journal saved — recovery recalculated.' }
        : { tone: 'error', message: result.message }
    );
  };

  const remove = async () => {
    const result = await deleteDaily('journal_logs', 'journal', { userId: user.id, date, profile });
    if (result.ok) {
      setForm(blank());
      setStatus({ tone: 'success', message: 'Entry deleted.' });
    }
  };

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Daily journal"
          subtitle={relativeDay(date)}
          icon={NotebookPen}
          action={existing ? <Badge color="#22c55e">Logged</Badge> : null}
        />
        <CardBody>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Date">
              <Input
                type="date"
                value={date}
                max={todayKey()}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>

            <div className="space-y-2">
              <p className="muted text-xs font-medium">Yesterday&apos;s habits</p>
              <Toggle
                icon={Wine}
                label="Alcohol"
                description="Any drinks — costs 10 recovery points"
                checked={form.alcohol}
                onChange={set('alcohol')}
              />
              <Toggle
                icon={Plane}
                label="Travel"
                description="Flights or long journeys — costs 4 points"
                checked={form.travel}
                onChange={set('travel')}
              />
              <Toggle
                icon={Brain}
                label="Meditation or breathwork"
                description="Adds 5 recovery points"
                checked={form.meditation}
                onChange={set('meditation')}
              />
            </div>

            <Field label="Stress level" hint={STRESS_LABELS[form.stress_level - 1]}>
              <RatingScale
                value={form.stress_level}
                onChange={(v) => set('stress_level')(v ?? 3)}
                labels={STRESS_LABELS}
                colorRamp
              />
            </Field>

            <Field label="Diet quality" hint={DIET_LABELS[form.diet_quality - 1]}>
              <RatingScale
                value={form.diet_quality}
                onChange={(v) => set('diet_quality')(v ?? 3)}
                labels={DIET_LABELS}
              />
            </Field>

            <Field label="Notes">
              <TextArea
                rows={4}
                value={form.notes}
                onChange={(e) => set('notes')(e.target.value)}
                placeholder="How did the day go? Anything that might explain tomorrow's numbers — late meal, hard meeting, illness…"
              />
            </Field>

            <div
              className="rounded-xl border p-3"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Net effect on recovery</span>
                <span
                  className="text-lg font-bold tabular-nums"
                  style={{ color: total > 0 ? '#22c55e' : total < 0 ? '#ef4444' : 'var(--text-muted)' }}
                >
                  {total > 0 ? '+' : ''}
                  {total}
                </span>
              </div>
              {applied.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {applied.map((m) => (
                    <Badge key={m.label} color={m.value > 0 ? '#22c55e' : '#ef4444'}>
                      {m.label} {m.value > 0 ? '+' : ''}
                      {m.value}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="muted mt-1 text-[11px]">
                  Nothing logged today would move your recovery score.
                </p>
              )}
            </div>

            {status.message ? <Alert tone={status.tone}>{status.message}</Alert> : null}

            <div className="flex gap-2">
              <Button type="submit" size="lg" loading={saving} icon={Save} className="flex-1">
                Save entry
              </Button>
              {existing ? (
                <Button type="button" variant="danger" size="lg" icon={Trash2} onClick={remove}>
                  Delete
                </Button>
              ) : null}
            </div>
          </form>
        </CardBody>
      </Card>

      <Card delay={80}>
        <CardHeader title="Recent entries" icon={History} />
        <CardBody className="space-y-2">
          {journal.length ? (
            journal.slice(0, 10).map((entry) => {
              const { total: entryTotal } = habitModifiers(entry);
              return (
                <button
                  key={entry.id ?? entry.date}
                  onClick={() => setDate(entry.date)}
                  className="w-full rounded-xl border p-3 text-left transition-colors hover:border-accent/60"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{relativeDay(entry.date)}</span>
                    <span
                      className="text-xs font-bold tabular-nums"
                      style={{
                        color:
                          entryTotal > 0 ? '#22c55e' : entryTotal < 0 ? '#ef4444' : 'var(--text-muted)',
                      }}
                    >
                      {entryTotal > 0 ? '+' : ''}
                      {entryTotal}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {entry.alcohol ? <Badge color="#ef4444">Alcohol</Badge> : null}
                    {entry.travel ? <Badge color="#f97316">Travel</Badge> : null}
                    {entry.meditation ? <Badge color="#22c55e">Meditation</Badge> : null}
                    {entry.stress_level >= 4 ? <Badge color="#ef4444">High stress</Badge> : null}
                    {entry.diet_quality >= 4 ? <Badge color="#22c55e">Good diet</Badge> : null}
                  </div>
                  {entry.notes ? (
                    <p className="muted mt-1.5 line-clamp-2 text-xs italic">{entry.notes}</p>
                  ) : null}
                </button>
              );
            })
          ) : (
            <EmptyState
              icon={Salad}
              title="No journal entries yet"
              body="Habits are the part of recovery you actually control. Logging them explains why a score moved."
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
