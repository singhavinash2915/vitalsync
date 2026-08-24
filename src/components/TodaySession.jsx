import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, AlertTriangle, Info, ChevronRight, CircleAlert } from 'lucide-react';
import clsx from 'clsx';

import { useDataStore } from '../store/useDataStore';
import { ACTIVITIES, sessionFor, guidanceFor, consecutiveLowDays } from '../lib/training';
import { detectIllnessSignal } from '../lib/illness';
import { scoreColor, toNumber } from '../lib/scores';
import { todayKey } from '../lib/dates';
import { Card, CardBody, Badge } from './ui';

const FLAG_TONE = {
  bad: { icon: CircleAlert, color: 'var(--status-poor)' },
  warn: { icon: AlertTriangle, color: 'var(--status-moderate)' },
  info: { icon: Info, color: 'var(--viz-1)' },
};

const PART_OF_DAY_LABEL = {
  morning: 'This morning',
  midday: 'Today',
  evening: 'This evening',
};

/** Re-render as the clock moves, so advice opened at 7am is not still showing at 7pm. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return now;
}

/**
 * The one card that answers "what should I do before this session".
 *
 * Everything else on the dashboard reports; this decides. It reads the plan for
 * today, takes the readiness already computed, and produces instructions for
 * the session actually scheduled — which is why gym and cricket give different
 * advice from the same score, and why opening it at 7pm does not give the same
 * answer as opening it at 7am.
 */
export default function TodaySession({ computed, health, sleep }) {
  const plan = useDataStore((s) => s.plan);
  const scores = useDataStore((s) => s.scores);
  const allHealth = useDataStore((s) => s.health);
  const now = useNow();

  const session = useMemo(() => sessionFor(plan ?? [], now), [plan, now]);

  const guidance = useMemo(() => {
    const baselineRhr = computed?.breakdown?.baselines?.restingHr;
    return guidanceFor(computed?.readiness_score, session?.activity ?? 'gym', {
      hour: now.getHours(),
      // Readiness describes the body you woke up in. Exertion is how much of it
      // you have already spent, which is what makes a 7pm session different.
      loadSoFar: computed?.exertion_score,
      sleepHours: sleep?.duration_hours,
      // A missing baseline must stay missing. Coercing it to 0 turns "56 bpm"
      // into "56 above baseline" and fires the illness warning every morning.
      restingHrDelta:
        toNumber(health?.resting_hr) !== null && toNumber(baselineRhr)
          ? toNumber(health.resting_hr) - toNumber(baselineRhr)
          : null,
      consecutiveLowDays: consecutiveLowDays(scores.filter((s) => s.date < todayKey())),
      illness: detectIllnessSignal(allHealth),
    });
  }, [computed, session, sleep, health, scores, now, allHealth]);

  // Without a plan there is nothing to advise on; point at where to make one.
  if (!plan?.length) {
    return (
      <Card delay={20}>
        <CardBody className="flex items-center gap-3 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15">
            <CalendarCheck size={18} className="text-accent" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Set up your training week</p>
            <p className="muted text-xs">
              Tell VitalSync which days are gym and which are cricket, and it will tell you what to
              do with each morning&apos;s readiness.
            </p>
          </div>
          <Link to="/plan" aria-label="Set up plan">
            <ChevronRight size={18} className="muted" />
          </Link>
        </CardBody>
      </Card>
    );
  }

  const activity = ACTIVITIES[session?.activity ?? 'rest'] ?? ACTIVITIES.other;
  const ready = computed?.readiness_score;

  return (
    <Card delay={20} className="overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: `${activity.color}14`, borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-xl" aria-hidden="true">
          {activity.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {PART_OF_DAY_LABEL[guidance.partOfDay] ?? 'Today'}: {activity.label}
            {session?.start_time ? (
              <span className="muted ml-1.5 text-xs font-normal">
                {session.start_time.slice(0, 5)}
              </span>
            ) : null}
          </p>
          {session?.notes ? <p className="muted truncate text-[11px]">{session.notes}</p> : null}
        </div>
        {ready !== null && ready !== undefined ? (
          <Badge color={scoreColor(ready)}>{ready}</Badge>
        ) : null}
        <Link to="/plan" aria-label="Edit plan" className="muted shrink-0 hover:text-accent">
          <ChevronRight size={16} />
        </Link>
      </div>

      <CardBody className="space-y-3 pt-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: activity.color }}>
            {guidance.headline}
          </h2>
          <p className="muted mt-1 text-xs leading-relaxed">{guidance.detail}</p>
        </div>

        {guidance.actions.length ? (
          <ul className="space-y-1.5">
            {guidance.actions.map((action) => (
              <li key={action} className="flex items-start gap-2 text-xs">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: activity.color }}
                  aria-hidden="true"
                />
                <span className="leading-relaxed">{action}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {guidance.flags.map((flag) => {
          const { icon: Icon, color } = FLAG_TONE[flag.tone] ?? FLAG_TONE.info;
          return (
            <p
              key={flag.text}
              className={clsx('flex items-start gap-2 rounded-xl px-2.5 py-2 text-[11px] leading-relaxed')}
              style={{ background: `${color}14`, color }}
            >
              <Icon size={13} className="mt-px shrink-0" aria-hidden="true" />
              {flag.text}
            </p>
          );
        })}
      </CardBody>
    </Card>
  );
}
