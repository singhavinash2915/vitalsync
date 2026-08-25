import { useMemo } from 'react';
import { CalendarCheck, Target } from 'lucide-react';

import { useDataStore } from '../store/useDataStore';
import { useAuthStore } from '../store/useAuthStore';
import { weeklyReview } from '../lib/weekly';
import { shortDate } from '../lib/dates';
import { Card, CardHeader, CardBody } from './ui';

/**
 * The week in one card, ending in the single thing worth changing.
 *
 * Deliberately one recommendation rather than a list. Six things to fix is a
 * list nobody acts on; the ordering in weekly.js puts consequence first, so a
 * developing infection outranks a training tweak and a training tweak outranks
 * a nag about logging.
 */
export default function WeeklyReview() {
  const { scores, health, sleep, meals, workouts, strengthSets, bodyComposition } = useDataStore();
  const profile = useAuthStore((s) => s.profile);

  const review = useMemo(
    () => weeklyReview({ scores, health, sleep, meals, workouts, strengthSets, bodyComposition, profile }),
    [scores, health, sleep, meals, workouts, strengthSets, bodyComposition, profile]
  );

  const stats = [
    {
      label: 'Readiness',
      value: review.readiness ? review.readiness.value : null,
      suffix: '',
      note:
        review.readiness?.delta === null || review.readiness?.delta === undefined
          ? null
          : `${review.readiness.delta > 0 ? '+' : ''}${review.readiness.delta} vs last week`,
      color: 'var(--viz-1)',
    },
    { label: 'Sleep', value: review.sleep?.value ?? null, suffix: 'h', color: 'var(--viz-3)' },
    {
      label: 'Protein',
      value: review.protein.average,
      suffix: 'g',
      note: `target ${review.protein.target}`,
      color: 'var(--viz-4)',
    },
    {
      label: 'Sessions',
      value: review.sessions,
      suffix: '',
      note: review.strengthSets ? `${review.strengthSets} sets` : null,
      color: 'var(--viz-2)',
    },
  ];

  return (
    <Card delay={150}>
      <CardHeader
        title="Your week"
        subtitle={`${shortDate(review.from)} – ${shortDate(review.to)} · ${review.coverage.scored}/${review.coverage.of} days scored, ${review.coverage.food}/${review.coverage.of} with food`}
        icon={CalendarCheck}
      />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-4 gap-1.5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl px-1 py-2 text-center" style={{ background: 'var(--bg-sunken)' }}>
              <p className="text-base font-bold tabular-nums" style={{ color: s.value === null ? 'var(--text-muted)' : s.color }}>
                {/* A dash, never a zero — an unlogged week is not a week of nothing. */}
                {s.value === null ? '—' : s.value}
                {s.value !== null && s.suffix ? <span className="text-[10px] font-semibold">{s.suffix}</span> : null}
              </p>
              <p className="muted text-[9px]">{s.label}</p>
              {s.note ? <p className="muted text-[8px] leading-tight">{s.note}</p> : null}
            </div>
          ))}
        </div>

        {review.volume.length ? (
          <div>
            <p className="muted mb-1 text-[10px] font-semibold uppercase tracking-wider">Sets per muscle</p>
            <div className="flex flex-wrap gap-1">
              {review.volume.slice(0, 8).map((v) => (
                <span
                  key={v.muscle}
                  className="rounded-full px-2 py-0.5 text-[10px] capitalize"
                  style={{
                    background: v.enough
                      ? 'color-mix(in srgb, var(--status-excellent) 14%, transparent)'
                      : 'var(--bg-sunken)',
                    color: v.enough ? 'var(--status-excellent)' : 'var(--text-muted)',
                  }}
                >
                  {v.muscle} {v.sets}/{v.target}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {review.cut ? (
          <p className="muted text-[11px] leading-relaxed">
            <strong style={{ color: 'var(--text)' }}>{review.cut.headline}.</strong> {review.cut.detail}
          </p>
        ) : null}

        <div
          className="flex items-start gap-2 rounded-xl px-2.5 py-2"
          style={{ background: 'color-mix(in srgb, var(--viz-1) 12%, transparent)' }}
        >
          <Target size={13} className="mt-px shrink-0" style={{ color: 'var(--viz-1)' }} aria-hidden="true" />
          <p className="text-[11px] leading-relaxed">{review.focus}</p>
        </div>
      </CardBody>
    </Card>
  );
}
