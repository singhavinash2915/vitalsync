import {
  TrendingUp,
  TrendingDown,
  Activity,
  Heart,
  Moon,
  Dumbbell,
  Sparkles,
  Trophy,
  Minus,
} from 'lucide-react';
import clsx from 'clsx';
import { Card, CardHeader, CardBody } from './ui';
import { scoreColor } from '../lib/scores';
import { relativeDay } from '../lib/dates';

const ICONS = {
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  activity: Activity,
  heart: Heart,
  moon: Moon,
  dumbbell: Dumbbell,
  sparkles: Sparkles,
};

const TONES = {
  good: 'text-score-excellent bg-score-excellent/10',
  bad: 'text-score-poor bg-score-poor/10',
  warn: 'text-score-moderate bg-score-moderate/10',
  neutral: 'text-accent bg-accent/10',
};

export function InsightsList({ insights, limit = 3 }) {
  return (
    <Card delay={120}>
      <CardHeader title="Insights" subtitle="What today's numbers are telling you" icon={Sparkles} />
      <CardBody className="space-y-2.5">
        {insights.slice(0, limit).map((insight, i) => {
          const Icon = ICONS[insight.icon] ?? Activity;
          return (
            <div key={`${insight.title}-${i}`} className="flex gap-3">
              <span
                className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-xl', TONES[insight.tone])}
              >
                <Icon size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{insight.title}</p>
                <p className="muted mt-0.5 text-xs leading-relaxed">{insight.body}</p>
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

/**
 * `neutral` is for exertion: a rise in training load is neither good nor bad,
 * so it gets the direction arrow without the green/red judgement.
 */
const DeltaChip = ({ delta, neutral = false }) => {
  if (delta === null || delta === undefined) return <span className="muted text-[10px]">—</span>;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const tone = neutral
    ? 'muted'
    : delta > 0
      ? 'text-score-excellent'
      : delta < 0
        ? 'text-score-poor'
        : 'muted';
  return (
    <span className={clsx('flex items-center gap-0.5 text-[10px] font-semibold', tone)}>
      <Icon size={10} aria-hidden="true" />
      {delta > 0 ? '+' : ''}
      {delta}
    </span>
  );
};

export function WeeklySummaryCard({ summary }) {
  const rows = [
    { key: 'readiness', label: 'Readiness' },
    { key: 'recovery', label: 'Recovery' },
    { key: 'sleep', label: 'Sleep' },
    // Exertion measures load, not quality — it keeps the purple it has on the
    // dashboard ring rather than being scored green-to-red.
    { key: 'exertion', label: 'Exertion', neutral: true, color: '#a855f7' },
  ];

  return (
    <Card delay={160}>
      <CardHeader
        title="This week"
        subtitle={
          summary.days
            ? `${summary.days}-day average vs the week before`
            : 'No scored days yet this week'
        }
        icon={Activity}
      />
      <CardBody className="grid grid-cols-2 gap-2">
        {rows.map(({ key, label, neutral, color }) => {
          const stat = summary[key];
          return (
            <div
              key={key}
              className="rounded-xl border p-3"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
            >
              <p className="muted text-[10px] uppercase tracking-wide">{label}</p>
              <div className="mt-1 flex items-baseline justify-between gap-1">
                <span
                  className="text-xl font-bold tabular-nums"
                  style={{
                    color:
                      stat.value === null
                        ? 'var(--text-muted)'
                        : (color ?? scoreColor(stat.value)),
                  }}
                >
                  {stat.value ?? '—'}
                </span>
                <DeltaChip delta={stat.delta} neutral={neutral} />
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

export function PersonalRecordsCard({ records }) {
  const withValues = records.filter((r) => Number.isFinite(r.value));
  if (!withValues.length) return null;

  return (
    <Card delay={200}>
      <CardHeader title="Personal records" subtitle="Your best days so far" icon={Trophy} />
      <CardBody className="divide-y" style={{ borderColor: 'var(--border)' }}>
        {withValues.map((record) => (
          <div key={record.key} className="flex items-center justify-between gap-3 py-2 first:pt-0">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{record.label}</p>
              <p className="muted text-[10px]">{relativeDay(record.date)}</p>
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-accent">
              {record.key === 'sleep'
                ? record.value.toFixed(1)
                : Math.round(record.value).toLocaleString()}
              <span className="muted ml-0.5 text-[10px] font-normal">{record.unit}</span>
            </span>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
