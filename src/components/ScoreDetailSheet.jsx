import { HeartPulse, Moon, Flame, Activity, Info } from 'lucide-react';

import { Modal, Badge } from './ui';
import { ScoreRing, ScoreBar } from './ScoreRing';
import { scoreColor, scoreLabel, exertionLabel } from '../lib/scores';
import { readinessAdvice } from '../lib/insights';
import { formatHours } from '../lib/dates';

/**
 * The "why" behind a score.
 *
 * Every number on the dashboard is already derived from a full breakdown —
 * sub-scores, baselines, weights, lifestyle modifiers — but until now none of
 * it was visible, so a score of 49 was something to be believed rather than
 * understood. This shows the arithmetic: what each input contributed, what it
 * was measured against, and what would move it.
 *
 * Kept behind a tap so the dashboard stays calm.
 */

const WEIGHT_NOTE = {
  recovery: 'HRV counts for 60%, resting heart rate for 40%. Lifestyle adjustments are added after.',
  sleep: 'Duration counts for 60%, how rested you felt for 40%.',
  exertion: 'Active calories against your target, plus up to 20 points for workout intensity.',
  readiness: 'Recovery 50%, sleep 30%, and the load you have already spent 20%.',
};

function Row({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="muted text-xs">{label}</span>
      <span className="text-right">
        <span className="text-xs font-semibold tabular-nums">{value}</span>
        {hint ? <span className="muted block text-[10px]">{hint}</span> : null}
      </span>
    </div>
  );
}

export default function ScoreDetailSheet({ open, onClose, metric, computed, health, sleep, workouts = [] }) {
  if (!metric || !computed) return null;

  const { breakdown } = computed;
  const score = computed[`${metric}_score`];

  const TITLES = {
    recovery: { title: 'Recovery', icon: HeartPulse, color: scoreColor(score) },
    sleep: { title: 'Sleep', icon: Moon, color: scoreColor(score) },
    exertion: { title: 'Exertion', icon: Flame, color: '#a855f7' },
    readiness: { title: 'Readiness', icon: Activity, color: scoreColor(score) },
  };
  const meta = TITLES[metric];

  const status =
    metric === 'exertion' ? exertionLabel(score) : score === null ? 'Not logged' : scoreLabel(score);

  return (
    <Modal open={open} onClose={onClose} title={meta.title} size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <ScoreRing
            value={score}
            size={92}
            stroke={9}
            color={metric === 'exertion' ? '#a855f7' : undefined}
          />
          <div className="min-w-0 flex-1">
            <Badge color={meta.color}>{status}</Badge>
            <p className="muted mt-2 text-xs leading-relaxed">
              {metric === 'readiness'
                ? readinessAdvice(score)
                : WEIGHT_NOTE[metric]}
            </p>
          </div>
        </div>

        {/* ---- recovery ---- */}
        {metric === 'recovery' ? (
          <div className="space-y-3">
            <ScoreBar label="HRV vs your baseline" value={breakdown.recovery.hrvScore} />
            <ScoreBar label="Resting HR vs your baseline" value={breakdown.recovery.rhrScore} />

            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
              <Row
                label="Your HRV today"
                value={health?.hrv ? `${health.hrv} ms` : '—'}
                hint={
                  breakdown.baselines.hrv
                    ? `60-day baseline ${breakdown.baselines.hrv} ms`
                    : 'baseline still building'
                }
              />
              <Row
                label="Resting heart rate"
                value={health?.resting_hr ? `${health.resting_hr} bpm` : '—'}
                hint={
                  breakdown.baselines.restingHr
                    ? `60-day baseline ${breakdown.baselines.restingHr} bpm`
                    : 'baseline still building'
                }
              />
              <Row label="Weighted base" value={breakdown.recovery.base} />
              {breakdown.recovery.modifier ? (
                <Row
                  label="Lifestyle adjustments"
                  value={`${breakdown.recovery.modifier > 0 ? '+' : ''}${breakdown.recovery.modifier}`}
                />
              ) : null}
            </div>

            {breakdown.recovery.modifiers.length ? (
              <div className="flex flex-wrap gap-1.5">
                {breakdown.recovery.modifiers.map((m) => (
                  <Badge key={m.label} color={m.value > 0 ? '#22c55e' : '#ef4444'}>
                    {m.label} {m.value > 0 ? '+' : ''}
                    {m.value}
                  </Badge>
                ))}
              </div>
            ) : null}

            <p className="muted flex items-start gap-1.5 text-[11px] leading-relaxed">
              <Info size={12} className="mt-px shrink-0" aria-hidden="true" />
              Measured against your own 60-day average, never population norms. Exactly at baseline
              scores 50; HRV saturates at ±25% deviation, resting heart rate at ±10%.
            </p>
          </div>
        ) : null}

        {/* ---- sleep ---- */}
        {metric === 'sleep' ? (
          <div className="space-y-3">
            {breakdown.sleep.logged ? (
              <>
                <ScoreBar label="Duration" value={breakdown.sleep.duration} />
                <ScoreBar label="How rested you felt" value={breakdown.sleep.quality} />
                <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                  <Row
                    label="Time asleep"
                    value={sleep?.duration_hours ? formatHours(sleep.duration_hours) : '—'}
                    hint={
                      breakdown.baselines.sleep
                        ? `recent average ${formatHours(breakdown.baselines.sleep)}`
                        : undefined
                    }
                  />
                  <Row
                    label="Your rating"
                    value={sleep?.quality_rating ? `${sleep.quality_rating} / 5` : 'not rated'}
                    hint={sleep?.quality_rating ? undefined : 'rating it unlocks 40% of this score'}
                  />
                </div>
              </>
            ) : (
              <p className="muted text-xs leading-relaxed">
                Nothing recorded for last night. An unlogged night is left out of readiness
                entirely rather than counted as a bad one — so this shows a dash, not a zero.
              </p>
            )}
            <p className="muted flex items-start gap-1.5 text-[11px] leading-relaxed">
              <Info size={12} className="mt-px shrink-0" aria-hidden="true" />
              Bands: under 6h scores 40, 6–7h scores 60, 7–8h scores 80, over 8h scores 100.
              Clearing 7.5h at a rating of 4+ also adds 10 points to recovery.
            </p>
          </div>
        ) : null}

        {/* ---- exertion ---- */}
        {metric === 'exertion' ? (
          <div className="space-y-3">
            <ScoreBar
              label="Active calories vs target"
              value={breakdown.exertion.calorieScore}
              color="#a855f7"
            />
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
              <Row
                label="Active calories"
                value={health?.active_calories ? `${health.active_calories} kcal` : '—'}
                hint={`target ${breakdown.exertion.target} kcal`}
              />
              <Row
                label="Workouts"
                value={breakdown.exertion.workoutCount || 'none'}
                hint={
                  workouts.length
                    ? workouts.map((w) => `${w.type} ${w.duration_mins}m`).join(' · ')
                    : undefined
                }
              />
              {breakdown.exertion.intensityBonus ? (
                <Row label="Intensity bonus" value={`+${breakdown.exertion.intensityBonus}`} />
              ) : null}
            </div>
            <p className="muted flex items-start gap-1.5 text-[11px] leading-relaxed">
              <Info size={12} className="mt-px shrink-0" aria-hidden="true" />
              High exertion is not good or bad — it is load you have spent. It works
              <em> against </em> readiness, which is why a hard session lowers today&apos;s number.
            </p>
          </div>
        ) : null}

        {/* ---- readiness ---- */}
        {metric === 'readiness' ? (
          <div className="space-y-3">
            <ScoreBar label="Recovery (50%)" value={computed.recovery_score} />
            <ScoreBar label="Sleep (30%)" value={computed.sleep_score} />
            <ScoreBar
              label="Load already spent (20%)"
              value={
                computed.exertion_score === null ? null : 100 - computed.exertion_score
              }
              color="#a855f7"
            />
            <p className="muted flex items-start gap-1.5 text-[11px] leading-relaxed">
              <Info size={12} className="mt-px shrink-0" aria-hidden="true" />
              Anything not logged is dropped and the remaining weights rescaled, so a missing night
              of sleep does not quietly cost you 30 points.
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
