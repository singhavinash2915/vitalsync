import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { HeartPulse, Activity, Info, TrendingUp, TrendingDown, Minus } from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { summariseBiomarkers } from '../lib/biomarkers';
import { relativeDay } from '../lib/dates';
import { Sparkline } from '../components/Sparkline';
import { Card, CardHeader, CardBody, Badge, EmptyState, Skeleton, Alert } from '../components/ui';

const TREND_ICON = { Rising: TrendingUp, Falling: TrendingDown, Stable: Minus };

/**
 * One biomarker.
 *
 * The rating badge only appears for metrics where a population comparison is
 * legitimate — VO2 max, respiratory rate, blood oxygen, cardio recovery. HRV
 * and resting heart rate deliberately show only a direction of travel, because
 * a "good" HRV number does not exist independent of the person.
 */
function BiomarkerCard({ marker, delay }) {
  const TrendIcon = marker.trend ? (TREND_ICON[marker.trend.label] ?? Minus) : null;
  const accent = marker.rating?.color ?? '#38bdf8';

  return (
    <Card delay={delay} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{marker.label}</h3>
            {marker.rating ? (
              <Badge color={marker.rating.color}>{marker.rating.label}</Badge>
            ) : null}
          </div>

          <p className="mt-1.5 text-2xl font-bold leading-none tabular-nums">
            {marker.latest.toFixed(marker.precision)}
            <span className="muted ml-1 text-xs font-normal">{marker.unit}</span>
          </p>

          <div className="muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
            {marker.trend ? (
              <span className="flex items-center gap-1 font-semibold" style={{ color: marker.trend.color }}>
                <TrendIcon size={11} aria-hidden="true" />
                {marker.trend.label}
                {marker.trend.label !== 'Stable'
                  ? ` ${Math.abs(marker.trend.deltaPct).toFixed(1)}%`
                  : ''}
              </span>
            ) : null}
            {marker.baseline !== null ? (
              <span>60-day avg {marker.baseline.toFixed(marker.precision)}</span>
            ) : null}
            <span>{relativeDay(marker.latestDate)}</span>
          </div>
        </div>

        <div className="shrink-0 pt-1">
          <Sparkline values={marker.series} color={accent} width={72} height={30} />
          <p className="muted mt-1 text-right text-[10px]">{marker.readings} readings</p>
        </div>
      </div>

      <p className="muted mt-2.5 border-t pt-2.5 text-[11px] leading-relaxed" style={{ borderColor: 'var(--border)' }}>
        {marker.note}
      </p>
    </Card>
  );
}

export default function Biomarkers() {
  const profile = useAuthStore((s) => s.profile);
  const loading = useDataStore((s) => s.loading);
  const health = useDataStore((s) => s.health);

  const markers = useMemo(() => summariseBiomarkers(health, profile), [health, profile]);
  const present = markers.filter((m) => m.hasData);
  const missing = markers.filter((m) => !m.hasData);

  const needsSex = present.some((m) => m.key === 'vo2_max' && !m.rating);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15">
            <Activity size={19} className="text-accent" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold">Biology</h1>
            <p className="muted text-xs">
              {present.length} marker{present.length === 1 ? '' : 's'} tracked from{' '}
              {health.length.toLocaleString()} days
            </p>
          </div>
        </div>
      </Card>

      {needsSex ? (
        <Alert tone="info">
          VO₂ max is compared against age and sex reference tables. Set your sex in{' '}
          <Link to="/settings" className="font-semibold underline">
            Settings
          </Link>{' '}
          to see where yours sits — until then it shows your own trend only.
        </Alert>
      ) : null}

      {present.length ? (
        present.map((marker, i) => (
          <BiomarkerCard key={marker.key} marker={marker} delay={i * 40} />
        ))
      ) : (
        <Card>
          <EmptyState
            icon={HeartPulse}
            title="No biomarkers yet"
            body="Import an Apple Health export or let the sync run — VO₂ max, respiratory rate and cardio recovery all come straight from your watch."
          />
        </Card>
      )}

      {missing.length ? (
        <Card delay={240}>
          <CardHeader title="Not being recorded" subtitle="Nothing in your data for these yet" />
          <CardBody>
            <ul className="space-y-1.5">
              {missing.map((marker) => (
                <li key={marker.key} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="muted">{marker.label}</span>
                  <span className="muted text-right text-[10px]">
                    {marker.key === 'weight_kg'
                      ? 'needs a connected scale, or log it in Health'
                      : marker.key === 'spo2'
                        ? 'needs a Watch with a blood oxygen sensor'
                        : 'no readings found'}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <p className="muted flex items-start gap-1.5 px-1 pb-2 text-[11px] leading-relaxed">
        <Info size={12} className="mt-px shrink-0" aria-hidden="true" />
        Ratings appear only where comparing against other people is meaningful. HRV and resting
        heart rate show your own direction of travel instead — there is no universally good HRV,
        only yours moving up or down.
      </p>
    </div>
  );
}
