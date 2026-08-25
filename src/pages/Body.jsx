import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Scale, Plus, Trash2, TrendingDown, AlertTriangle, Info, Check } from 'lucide-react';

import { useDataStore } from '../store/useDataStore';
import { useAuthStore } from '../store/useAuthStore';
import { bodySummary, latestScan } from '../lib/body';
import { cutCheck } from '../lib/cutcheck';
import { proteinSummary, proteinTarget } from '../lib/nutrition';
import { toNumber } from '../lib/scores';
import { todayKey, shortDate, prettyDate } from '../lib/dates';
import EditGate, { useCanEdit } from '../components/EditGate';
import ScanDetail from '../components/viz/ScanDetail';
import { Card, CardHeader, CardBody, Button, Input, Field, Modal, EmptyState, Badge } from '../components/ui';

/**
 * Fields in the order they appear on the InBody printout.
 *
 * Transcribing a sheet of paper is error-prone, and the fastest way to make it
 * survivable is to stop asking the reader to hunt: same order, same wording,
 * same units as the page in their hand.
 */
const FIELDS = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', step: '0.1', primary: true },
  { key: 'body_fat_pct', label: 'Percent body fat (PBF)', unit: '%', step: '0.1', primary: true },
  { key: 'skeletal_muscle_kg', label: 'Skeletal muscle mass (SMM)', unit: 'kg', step: '0.1', primary: true },
  { key: 'body_fat_mass_kg', label: 'Body fat mass', unit: 'kg', step: '0.1', primary: true },
  { key: 'fat_free_mass_kg', label: 'Fat free mass', unit: 'kg', step: '0.1' },
  { key: 'bmi', label: 'BMI', unit: '', step: '0.1' },
  { key: 'total_body_water_l', label: 'Total body water', unit: 'L', step: '0.1' },
  { key: 'protein_kg', label: 'Protein', unit: 'kg', step: '0.1' },
  { key: 'mineral_kg', label: 'Mineral', unit: 'kg', step: '0.01' },
  { key: 'visceral_fat_level', label: 'Visceral fat level', unit: '', step: '1' },
  { key: 'waist_hip_ratio', label: 'Waist-hip ratio', unit: '', step: '0.01' },
  { key: 'bmr_kcal', label: 'Basal metabolic rate', unit: 'kcal', step: '1' },
  { key: 'smi', label: 'SMI', unit: 'kg/m²', step: '0.1' },
  { key: 'inbody_score', label: 'InBody score', unit: '/100', step: '1' },
  { key: 'target_weight_kg', label: 'Target weight', unit: 'kg', step: '0.1' },
  // Not on the InBody printout — this one comes off a tape measure, and it is
  // the field the weekly check-in actually exists for.
  { key: 'waist_cm', label: 'Waist (at the navel)', unit: 'cm', step: '0.5', weekly: true },
];

/** The two-field weekly ritual, as opposed to transcribing a scan printout. */
const WEEKLY_FIELDS = FIELDS.filter((f) => f.key === 'weight_kg' || f.weekly);

const TONE = { good: 'var(--status-excellent)', bad: 'var(--status-poor)', warn: 'var(--status-moderate)', info: 'var(--viz-1)' };

function ScanForm({ open, onClose, onSave, saving }) {
  const [date, setDate] = useState(todayKey());
  const [values, setValues] = useState({});
  const [showAll, setShowAll] = useState(false);
  /*
   * Weekly is the default because it is what happens weekly.
   *
   * A scan is occasional and a tape measure is every Sunday, so opening
   * straight into a 20-field printout transcription would put the frequent
   * task behind the rare one. Both write to the same table — every column is
   * nullable, so a weight-and-waist row is a valid row, not a partial scan.
   */
  const [mode, setMode] = useState('weekly');
  const weekly = mode === 'weekly';

  const shown = weekly ? WEEKLY_FIELDS : showAll ? FIELDS : FIELDS.filter((f) => f.primary);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={weekly ? 'Weekly check-in' : 'Add an InBody scan'}
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            loading={saving}
            onClick={() => onSave({ date, ...values })}
            disabled={!values.weight_kg}
          >
            {weekly ? 'Save' : 'Save scan'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1.5 rounded-xl p-1" style={{ background: 'var(--bg-elevated)' }}>
          {[
            { key: 'weekly', label: 'Weekly check-in', hint: 'weight + waist' },
            { key: 'scan', label: 'InBody scan', hint: 'full printout' },
          ].map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className="rounded-lg px-2 py-1.5 text-[11px] leading-tight transition-colors"
              style={{
                background: mode === m.key ? 'var(--viz-1)' : 'transparent',
                color: mode === m.key ? '#fff' : 'var(--text-muted)',
              }}
            >
              <span className="block font-medium">{m.label}</span>
              <span className="block opacity-80">{m.hint}</span>
            </button>
          ))}
        </div>

        <Field label={weekly ? 'Date' : 'Scan date'}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        {shown.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              type="number"
              inputMode="decimal"
              step={f.step}
              unit={f.unit || undefined}
              value={values[f.key] ?? ''}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }))
              }
            />
          </Field>
        ))}

        {weekly ? (
          <p className="muted text-[11px] leading-relaxed">
            Measure at the navel, standing relaxed, first thing in the morning. Waist is the
            indicator that matters most — it moves when the scale is sitting still.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="muted w-full text-center text-[11px] hover:text-accent"
          >
            {showAll ? 'Show fewer fields' : `Show all ${FIELDS.length} fields from the printout`}
          </button>
        )}
      </div>
    </Modal>
  );
}

export default function Body() {
  const { bodyComposition, strengthSets, meals, saveBodyScan, deleteBodyScan, saving } = useDataStore();
  const { user, profile } = useAuthStore();
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);

  const summary = useMemo(
    () => bodySummary(bodyComposition, profile?.goal_weight_kg),
    [bodyComposition, profile]
  );
  const last = latestScan(bodyComposition);

  // The verdict that needs both halves: strength held while fat falls is the
  // only combination that means the cut is doing what the scan asked for.
  const cut = useMemo(() => {
    const target = proteinTarget({ profile, latestScan: last });
    const protein = proteinSummary(meals, target.grams, 28);
    return cutCheck({
      scans: bodyComposition,
      sets: strengthSets,
      proteinAverage: protein.average,
      proteinTarget: target.grams,
    });
  }, [bodyComposition, strengthSets, meals, profile, last]);

  const chart = useMemo(
    () =>
      [...bodyComposition]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((r) => ({
          date: r.date,
          label: shortDate(r.date),
          weight: toNumber(r.weight_kg),
          fat: toNumber(r.body_fat_mass_kg),
          muscle: toNumber(r.skeletal_muscle_kg),
        })),
    [bodyComposition]
  );

  const save = async (scan) => {
    const clean = Object.fromEntries(Object.entries(scan).filter(([, v]) => v !== undefined && v !== ''));
    const result = await saveBodyScan({ userId: user.id, scan: clean });
    if (result.ok) setOpen(false);
    else setError(result.message);
  };

  if (!bodyComposition.length) {
    return (
      <div className="space-y-4">
        <EditGate />
        <EmptyState
          icon={Scale}
          title="No scans yet"
          body="Add an InBody scan and this starts tracking the only thing that matters in a cut — whether the weight coming off is fat or muscle."
          action={
            canEdit ? <Button icon={Plus} onClick={() => setOpen(true)}>Add a scan</Button> : null
          }
        />
        <ScanForm open={open} onClose={() => setOpen(false)} onSave={save} saving={saving} />
      </div>
    );
  }

  const goal = summary?.goal;

  return (
    <div className="space-y-4">
      <EditGate />
      {error ? <p className="text-xs text-score-poor">{error}</p> : null}

      {summary ? (
        <Card delay={0} className="overflow-hidden">
          <div className="h-0.5 w-full" style={{ background: TONE[summary.tone] }} />
          <CardBody className="space-y-2 pt-3">
            <div className="flex items-start gap-2">
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
                style={{ background: `${TONE[summary.tone]}1a`, color: TONE[summary.tone] }}
              >
                {summary.tone === 'bad' ? <AlertTriangle size={15} /> : summary.tone === 'good' ? <Check size={15} /> : <Info size={15} />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">{summary.headline}</h2>
                <p className="muted mt-0.5 text-xs leading-relaxed">{summary.detail}</p>
              </div>
            </div>

            {goal ? (
              <div className="pt-1">
                <div className="mb-1 flex items-baseline justify-between text-[11px]">
                  <span className="muted">
                    {goal.current} kg now · {goal.goal} kg goal
                  </span>
                  <span className="font-semibold" style={{ color: TONE.info }}>
                    {goal.toGo > 0 ? `${goal.toGo} kg to go` : 'goal reached'}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--track)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${goal.pct ?? 0}%`, background: TONE.info }}
                  />
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {cut ? (
        <Card delay={20} className="overflow-hidden">
          <div className="h-0.5 w-full" style={{ background: TONE[cut.tone] }} />
          <CardBody className="flex items-start gap-2 pt-3">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
              style={{ background: `${TONE[cut.tone]}1a`, color: TONE[cut.tone] }}
            >
              {cut.tone === 'bad' ? <AlertTriangle size={15} /> : cut.tone === 'good' ? <Check size={15} /> : <Info size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">{cut.headline}</h2>
              <p className="muted mt-0.5 text-xs leading-relaxed">{cut.detail}</p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {chart.length > 1 ? (
        <Card delay={40}>
          <CardHeader title="Weight, fat and muscle" subtitle="The split is the point" icon={TrendingDown} />
          <CardBody>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 6, right: 8, bottom: 0, left: -22 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} domain={['dataMin - 3', 'dataMax + 3']} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 11 }}
                    labelStyle={{ color: 'var(--text-muted)' }}
                  />
                  {goal?.goal ? (
                    <ReferenceLine y={goal.goal} stroke="var(--viz-1)" strokeDasharray="4 4" label={{ value: 'goal', fontSize: 9, fill: 'var(--viz-1)' }} />
                  ) : null}
                  <Line type="monotone" dataKey="weight" name="Weight" stroke="var(--viz-1)" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="fat" name="Fat mass" stroke="var(--viz-2)" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="muscle" name="Muscle" stroke="var(--viz-3)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/*
        Every reading explained, with its band drawn and — once a second scan
        exists — the change beside it. The printout gives fifteen numbers and
        explains none of them.
      */}
      <Card delay={70}>
        <CardHeader
          title="Your readings, explained"
          subtitle={
            bodyComposition.length > 1
              ? `${prettyDate(last.date)}, against the scan before it`
              : `${prettyDate(last.date)} · tap any row`
          }
          icon={Info}
        />
        <CardBody>
          <ScanDetail
            scan={last}
            previous={
              [...bodyComposition].sort((a, b) => (a.date < b.date ? 1 : -1))[1] ?? null
            }
          />
        </CardBody>
      </Card>

      <Card delay={80}>
        <CardHeader
          title="Scans"
          subtitle={`${bodyComposition.length} recorded`}
          icon={Scale}
          action={
            canEdit ? (
              <Button size="sm" icon={Plus} onClick={() => setOpen(true)}>
                Add
              </Button>
            ) : null
          }
        />
        <CardBody className="space-y-2">
          {[...bodyComposition]
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .map((scan) => (
              <div
                key={scan.id ?? scan.date}
                className="flex items-center gap-3 rounded-xl border px-3 py-2"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold">{prettyDate(scan.date)}</p>
                  <p className="muted text-[11px]">
                    {toNumber(scan.weight_kg)} kg · {toNumber(scan.body_fat_pct)}% fat ·{' '}
                    {toNumber(scan.skeletal_muscle_kg)} kg muscle
                    {scan.visceral_fat_level ? ` · visceral ${scan.visceral_fat_level}` : ''}
                  </p>
                </div>
                {scan.inbody_score ? <Badge color="var(--viz-1)">{scan.inbody_score}</Badge> : null}
                {canEdit ? (
                  <button
                    onClick={() => deleteBodyScan({ userId: user.id, date: scan.date })}
                    className="muted shrink-0 hover:text-score-poor"
                    aria-label={`Delete scan from ${scan.date}`}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            ))}
        </CardBody>
      </Card>

      {last?.bmr_kcal ? (
        <p className="muted px-1 text-[11px] leading-relaxed">
          Your last scan put basal metabolic rate at {toNumber(last.bmr_kcal)} kcal. The app&apos;s
          calorie target is a different number — it is how much you aim to <em>burn</em> in activity,
          used for the load score, not how much to eat.
        </p>
      ) : null}

      <ScanForm open={open} onClose={() => setOpen(false)} onSave={save} saving={saving} />
    </div>
  );
}
