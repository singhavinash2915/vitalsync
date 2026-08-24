import { useMemo, useState } from 'react';
import { Beef, Pill, Plus, Minus, Check } from 'lucide-react';
import clsx from 'clsx';

import { useDataStore } from '../store/useDataStore';
import { useAuthStore } from '../store/useAuthStore';
import { latestScan } from '../lib/body';
import { proteinTarget, dayEntry, proteinSummary, QUICK_ADDS, WHEY_PROTEIN_G } from '../lib/nutrition';
import { todayKey, shortDate } from '../lib/dates';
import EditGate, { useCanEdit } from '../components/EditGate';
import { Card, CardHeader, CardBody, Button } from '../components/ui';

/**
 * Protein, in about three taps.
 *
 * Built deliberately thin. This app has recorded two journal entries and one
 * manual sleep entry in its entire life, against thousands of synced rows —
 * the evidence that a multi-field daily form goes unused here is already in.
 * So: one number that matters, two big buttons, two toggles, and nothing that
 * punishes a missed day.
 */
export default function Nutrition() {
  const { nutrition, bodyComposition, saveNutrition } = useDataStore();
  const { user, profile } = useAuthStore();
  const canEdit = useCanEdit();
  const [busy, setBusy] = useState(false);

  const date = todayKey();
  const scan = latestScan(bodyComposition);
  const target = useMemo(() => proteinTarget({ profile, latestScan: scan }), [profile, scan]);
  const today = useMemo(() => dayEntry(nutrition, date), [nutrition, date]);
  const summary = useMemo(
    () => proteinSummary(nutrition, target.grams, 7),
    [nutrition, target.grams]
  );

  const pct = Math.min(100, Math.round((today.protein_g / target.grams) * 100));
  const remaining = Math.max(0, target.grams - today.protein_g);

  const patch = async (changes) => {
    if (!canEdit) return;
    setBusy(true);
    await saveNutrition({ userId: user.id, date, patch: changes });
    setBusy(false);
  };

  const addProtein = (grams) => patch({ protein_g: Math.max(0, today.protein_g + grams) });

  const week = [...nutrition]
    .filter((r) => r.date <= date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 7)
    .reverse();

  return (
    <div className="space-y-4">
      <EditGate />

      <Card delay={0}>
        <CardBody className="space-y-4 pt-5">
          <div className="text-center">
            <p className="text-4xl font-bold tabular-nums" style={{ color: pct >= 90 ? '#22c55e' : '#f97316' }}>
              {today.protein_g}
              <span className="ml-1 text-lg font-semibold" style={{ color: 'var(--text-muted)' }}>
                / {target.grams} g
              </span>
            </p>
            <p className="muted mt-1 text-xs">
              {remaining > 0 ? `${remaining} g to go today` : 'Target hit'} · from {target.basis}
            </p>
          </div>

          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--track)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: pct >= 90 ? '#22c55e' : '#f97316' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {QUICK_ADDS.map((grams) => (
              <Button
                key={grams}
                size="lg"
                icon={Plus}
                disabled={!canEdit || busy}
                onClick={() => addProtein(grams)}
              >
                {grams} g
              </Button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => addProtein(-QUICK_ADDS[0])}
              disabled={!canEdit || busy || today.protein_g === 0}
              className="muted flex items-center gap-1 text-[11px] hover:text-accent disabled:opacity-40"
            >
              <Minus size={12} /> undo {QUICK_ADDS[0]} g
            </button>
            <button
              onClick={() => patch({ protein_g: 0, whey_scoops: 0, creatine_taken: false })}
              disabled={!canEdit || busy}
              className="muted text-[11px] hover:text-accent disabled:opacity-40"
            >
              Reset day
            </button>
          </div>
        </CardBody>
      </Card>

      <Card delay={40}>
        <CardHeader title="Supplements" subtitle="One tap each" icon={Pill} />
        <CardBody className="grid grid-cols-2 gap-2">
          <button
            disabled={!canEdit || busy}
            onClick={() =>
              patch({
                whey_scoops: today.whey_scoops + 1,
                protein_g: today.protein_g + WHEY_PROTEIN_G,
              })
            }
            className="flex flex-col items-center gap-1 rounded-xl border px-3 py-3 transition-colors disabled:opacity-50"
            style={{
              borderColor: today.whey_scoops ? '#22c55e' : 'var(--border)',
              background: today.whey_scoops ? '#22c55e14' : 'transparent',
            }}
          >
            <Beef size={17} style={{ color: today.whey_scoops ? '#22c55e' : 'var(--text-muted)' }} />
            <span className="text-xs font-semibold">Whey</span>
            <span className="muted text-[10px]">
              {today.whey_scoops ? `${today.whey_scoops} scoop${today.whey_scoops > 1 ? 's' : ''} · +${today.whey_scoops * WHEY_PROTEIN_G} g` : `adds ${WHEY_PROTEIN_G} g`}
            </span>
          </button>

          <button
            disabled={!canEdit || busy}
            onClick={() => patch({ creatine_taken: !today.creatine_taken })}
            className="flex flex-col items-center gap-1 rounded-xl border px-3 py-3 transition-colors disabled:opacity-50"
            style={{
              borderColor: today.creatine_taken ? '#22c55e' : 'var(--border)',
              background: today.creatine_taken ? '#22c55e14' : 'transparent',
            }}
          >
            {today.creatine_taken ? <Check size={17} style={{ color: '#22c55e' }} /> : <Pill size={17} className="muted" />}
            <span className="text-xs font-semibold">Creatine</span>
            <span className="muted text-[10px]">{today.creatine_taken ? 'taken' : 'not yet'}</span>
          </button>
        </CardBody>
      </Card>

      <Card delay={80}>
        <CardHeader title="This week" subtitle={summary.coverage} icon={Beef} />
        <CardBody className="space-y-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="muted">Average on logged days</span>
            <span className="font-semibold tabular-nums">
              {summary.average === null ? '—' : `${summary.average} g`}
            </span>
          </div>
          {summary.hitRate !== null ? (
            <div className="flex items-baseline justify-between text-xs">
              <span className="muted">Days at or near target</span>
              <span className="font-semibold tabular-nums">
                {summary.onTarget} of {summary.loggedDays} ({summary.hitRate}%)
              </span>
            </div>
          ) : null}

          {week.length ? (
            <div className="flex items-end gap-1.5 pt-1">
              {week.map((r) => {
                const g = Number(r.protein_g ?? 0);
                const h = Math.max(6, Math.min(100, (g / target.grams) * 100));
                return (
                  <div key={r.date} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-16 w-full items-end">
                      <div
                        className={clsx('w-full rounded-t')}
                        style={{ height: `${h}%`, background: g >= target.grams * 0.9 ? '#22c55e' : '#f97316' }}
                      />
                    </div>
                    <span className="muted text-[9px]">{shortDate(r.date).split(' ')[0]}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted text-[11px]">
              Nothing logged yet this week. Unlogged days are left out of the average rather than
              counted as zero — the number should describe your eating, not your logging.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
