import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity, Info } from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { computeDailyScores, scoreColor } from '../lib/scores';
import { todayKey } from '../lib/dates';
import { Card, CardHeader, CardBody, Badge } from './ui';

/**
 * Readiness across today.
 *
 * It is a genuinely moving number, not a once-a-morning verdict: active
 * calories accumulate through the day, and the load you have already spent
 * counts against readiness. So the line falls as you use yourself up, and a
 * hard afternoon shows up as a step down.
 *
 * Each point is recomputed from the raw inputs captured at that moment using
 * the same scoring code as everything else, rather than reading back a stored
 * score. That keeps one implementation of the algorithm and means old points
 * re-score correctly whenever it changes.
 */
export default function ReadinessToday() {
  const profile = useAuthStore((s) => s.profile);
  const snapshots = useDataStore((s) => s.snapshots);
  const health = useDataStore((s) => s.health);
  const sleepLogs = useDataStore((s) => s.sleep);
  const workoutLogs = useDataStore((s) => s.workouts);
  const journalLogs = useDataStore((s) => s.journal);

  const date = todayKey();

  const points = useMemo(() => {
    const today = (snapshots ?? []).filter((s) => s.date === date);
    if (today.length < 2) return [];

    const history = health.filter((r) => r.date < date);
    const sleepHistory = sleepLogs.filter((r) => r.date < date);
    const daySleep = sleepLogs.find((r) => r.date === date) ?? null;
    const dayJournal = journalLogs.find((r) => r.date === date) ?? null;

    return today.map((snap) => {
      const at = new Date(snap.captured_at);
      // Only the workouts finished by this point in the day count towards the
      // load spent so far.
      const workoutsSoFar = workoutLogs.filter((w) => w.date === date);

      const computed = computeDailyScores({
        health: {
          hrv: snap.hrv,
          resting_hr: snap.resting_hr,
          active_calories: snap.active_calories,
          steps: snap.steps,
        },
        sleep: daySleep,
        journal: dayJournal,
        workouts: workoutsSoFar,
        history,
        sleepHistory,
        profile,
      });

      return {
        t: at.getTime(),
        label: at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        readiness: computed.readiness_score,
        recovery: computed.recovery_score,
        exertion: computed.exertion_score,
        calories: snap.active_calories,
      };
    });
  }, [snapshots, health, sleepLogs, workoutLogs, journalLogs, profile, date]);

  if (points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const drop = first.readiness - last.readiness;

  return (
    <Card delay={30}>
      <CardHeader
        title="Readiness through today"
        subtitle={`${points.length} readings · ${first.label} to ${last.label}`}
        icon={Activity}
        action={
          <Badge color={scoreColor(last.readiness)}>
            {drop > 0 ? `−${drop}` : drop < 0 ? `+${Math.abs(drop)}` : 'flat'}
          </Badge>
        }
      />
      <CardBody>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -26 }}>
              <defs>
                <linearGradient id="readyToday" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine y={66} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.35} />
              <ReferenceLine y={33} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.35} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  fontSize: 11,
                }}
                labelStyle={{ color: 'var(--text-muted)' }}
                formatter={(value, name) => [value, name === 'readiness' ? 'Readiness' : name]}
              />
              <Area
                type="monotone"
                dataKey="readiness"
                stroke="#38bdf8"
                strokeWidth={2.5}
                fill="url(#readyToday)"
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <p className="muted mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed">
          <Info size={12} className="mt-px shrink-0" aria-hidden="true" />
          {drop > 3
            ? `Down ${drop} points since this morning — that is the ${last.calories ?? 0} kcal you have spent working against you.`
            : 'Recovery and sleep are fixed by the morning; what moves through the day is the load you spend.'}
        </p>
      </CardBody>
    </Card>
  );
}
