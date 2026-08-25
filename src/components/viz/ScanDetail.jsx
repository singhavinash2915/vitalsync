import { useState } from 'react';
import { ChevronDown, ChevronUp, Check, AlertTriangle, Info, ArrowUp, ArrowDown } from 'lucide-react';

import { BODY_METRICS, GROUPS, bandFor, verdictFor, positionIn, deltaFor } from '../../lib/bodyMetrics';
import { toNumber, hasNumber } from '../../lib/scores';
import { relativeDay } from '../../lib/dates';

const TONE = { good: 'var(--status-excellent)', bad: 'var(--status-poor)', note: 'var(--status-moderate)' };

/**
 * Every reading on the scan, explained, with its reference band drawn.
 *
 * The printout hands back fifteen numbers and explains almost none of them, so
 * most go unread — "SMI 8.4 kg/m²" is not information until someone says what
 * it is for. Each row shows the value against the band the machine prints, a
 * marker for where it falls, and two sentences: what the number is, and why it
 * is worth watching.
 *
 * When a previous scan exists the change appears beside each value, judged by
 * direction — fat mass falling is good, muscle falling is not, and a metric with
 * no better direction (water, mineral) is reported without a verdict.
 */
function MetricRow({ metric, scan, previous, open, onToggle }) {
  const value = toNumber(scan[metric.key]);
  const band = bandFor(metric, value);
  const verdict = verdictFor(metric, value);
  const pos = positionIn(metric, value);
  const delta = previous ? deltaFor(metric, scan, previous) : null;
  const [lo, hi] = metric.range ?? [];

  const Icon = verdict === 'good' ? Check : verdict === 'bad' ? AlertTriangle : Info;

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 py-2.5 text-left"
        aria-expanded={open}
      >
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${TONE[verdict] ?? 'var(--viz-1)'} 14%, transparent)`, color: TONE[verdict] ?? 'var(--viz-1)' }}
        >
          <Icon size={12} aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium">{metric.label}</span>
          {band ? (
            <span className="muted block text-[10px]">
              normal {lo}–{hi}
              {metric.unit ? ` ${metric.unit}` : ''}
            </span>
          ) : null}
        </span>

        {delta && delta.change !== 0 ? (
          <span
            className="flex shrink-0 items-center gap-0.5 text-[10px] font-semibold tabular-nums"
            style={{ color: TONE[delta.tone] ?? 'var(--text-muted)' }}
          >
            {delta.change > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
            {Math.abs(delta.change)}
          </span>
        ) : null}

        <span className="shrink-0 text-right">
          <span className="text-sm font-bold tabular-nums" style={{ color: TONE[verdict] ?? undefined }}>
            {value}
          </span>
          <span className="muted ml-0.5 text-[10px]">{metric.unit}</span>
        </span>

        {open ? <ChevronUp size={13} className="muted shrink-0" /> : <ChevronDown size={13} className="muted shrink-0" />}
      </button>

      {open ? (
        <div className="pb-3 pl-8.5 pr-1">
          {pos !== null ? (
            <div className="mb-2.5">
              <div className="relative h-1.5 rounded-full" style={{ background: 'var(--track)' }}>
                {/* The band itself, so "normal" is a place rather than a number. */}
                <span
                  className="absolute inset-y-0 rounded-full"
                  style={{ left: '10%', right: '10%', background: 'color-mix(in srgb, var(--status-excellent) 28%, transparent)' }}
                />
                <span
                  className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2"
                  style={{
                    left: `calc(${10 + Math.max(-0.12, Math.min(1.12, pos)) * 80}% - 6px)`,
                    background: TONE[verdict] ?? 'var(--viz-1)',
                    borderColor: 'var(--bg-elevated)',
                  }}
                />
              </div>
              <div className="muted mt-1 flex justify-between text-[9px] tabular-nums">
                <span>{lo}</span>
                <span>{hi}</span>
              </div>
            </div>
          ) : null}

          <p className="text-[11px] leading-relaxed">{metric.what}</p>
          <p className="muted mt-1 text-[11px] leading-relaxed">{metric.why}</p>

          {delta ? (
            <p className="mt-1.5 text-[10px]" style={{ color: TONE[delta.tone] ?? 'var(--text-muted)' }}>
              {delta.change === 0
                ? `Unchanged since ${relativeDay(previous.date)}.`
                : `${delta.change > 0 ? '+' : ''}${delta.change} ${metric.unit} since ${relativeDay(previous.date)}.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ScanDetail({ scan, previous = null }) {
  const [open, setOpen] = useState(null);
  if (!scan) return null;

  return (
    <div className="space-y-4">
      {!previous ? (
        <p className="muted rounded-xl px-2.5 py-2 text-[11px] leading-relaxed" style={{ background: 'var(--bg-sunken)' }}>
          One scan, so there is nothing to compare against yet. Add the next one and every row below
          grows a change figure — which is the part that is actually about you, since the ranges here
          describe the population rather than you.
        </p>
      ) : null}

      {GROUPS.map((group) => {
        const rows = BODY_METRICS.filter((m) => m.group === group.key && hasNumber(scan[m.key]));
        if (!rows.length) return null;
        return (
          <div key={group.key}>
            <h3 className="muted mb-1 text-[10px] font-bold uppercase tracking-wider">{group.label}</h3>
            <div className="rounded-xl px-3" style={{ background: 'var(--bg-sunken)' }}>
              {rows.map((m) => (
                <MetricRow
                  key={m.key}
                  metric={m}
                  scan={scan}
                  previous={previous}
                  open={open === m.key}
                  onToggle={() => setOpen(open === m.key ? null : m.key)}
                />
              ))}
            </div>
          </div>
        );
      })}

      <p className="muted text-[10px] leading-relaxed">
        Ranges are InBody&apos;s own reference bands for an adult male, matching the printout. They
        describe where most people sit, not where you should be — everywhere else this app measures
        you against your own history, and between two scans that is what to read here too.
      </p>
    </div>
  );
}
