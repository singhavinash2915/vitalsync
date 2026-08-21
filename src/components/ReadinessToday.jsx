import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Info } from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { computeDailyScores } from '../lib/scores';
import { todayKey } from '../lib/dates';
import { Card, CardHeader, CardBody, Badge } from './ui';

/**
 * Today's load, against the readiness you started with.
 *
 * Now that readiness is pure recovery it is fixed by the morning's HRV and
 * resting heart rate — plotting it alone would draw a permanently flat line.
 * What actually moves through the day is load: active calories accumulate,
 * so the purple area climbs while the blue line stays put.
 *
 * The gap between them is the useful part. A high line with a low area means
 * capacity you have not spent; the area closing on the line means you have
 * used up the day you were given.
 *
 * Each point is recomputed from the raw inputs captured at that moment with
 * the same scoring code as everything else, so there is one implementation of
 * the algorithm and old points re-score correctly when it changes.
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
  const loadGained = (last.exertion ?? 0) - (first.exertion ?? 0);
  const headroom = (last.readiness ?? 0) - (last.exertion ?? 0);

  return (
    <Card delay={30}>
      <CardHeader
        title="Today's load against your readiness"
        subtitle={`${points.length} readings · ${first.label} to ${last.label}`}
        icon={Activity}
        action={<Badge color="#a855f7">+{loadGained} load</Badge>}
      />
      <CardBody>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -26 }}>
              <defs>
                <linearGradient id="loadToday" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0.02} />
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
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  fontSize: 11,
                }}
                labelStyle={{ color: 'var(--text-muted)' }}
                formatter={(value, name) => [
                  value,
                  name === 'readiness' ? 'Readiness' : 'Load spent',
                ]}
              />
              {/* Load climbs; readiness is level because it was set overnight. */}
              <Area
                type="monotone"
                dataKey="exertion"
                stroke="#a855f7"
                strokeWidth={2.5}
                fill="url(#loadToday)"
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="readiness"
                stroke="#38bdf8"
                strokeWidth={2}
                fill="none"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <p className="muted mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed">
          <Info size={12} className="mt-px shrink-0" aria-hidden="true" />
          {headroom > 15
            ? `Readiness ${last.readiness} against ${last.exertion} spent — you still have room today.`
            : headroom > -10
              ? `Load has caught up with your readiness (${last.exertion} against ${last.readiness}). Keep anything further easy.`
              : `You have spent more than today gave you (${last.exertion} against ${last.readiness}). Expect tomorrow's HRV to show it.`}
        </p>
      </CardBody>
    </Card>
  );
}
