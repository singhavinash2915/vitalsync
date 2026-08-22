import { Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import clsx from 'clsx';

import { useFindings } from '../lib/useFindings';
import { Card, CardBody, EmptyState } from '../components/ui';

const TONE = {
  bad: { bar: '#ef4444', chip: 'text-score-poor bg-score-poor/10' },
  warn: { bar: '#f97316', chip: 'text-score-moderate bg-score-moderate/10' },
  good: { bar: '#22c55e', chip: 'text-score-excellent bg-score-excellent/10' },
  info: { bar: '#38bdf8', chip: 'text-accent bg-accent/10' },
};

/**
 * How much weight to put on a finding, said in words rather than a p-value.
 * A number built on nineteen days and one built on nine hundred should not
 * look identical on the page.
 */
const CONFIDENCE = {
  strong: { label: 'Strong evidence', hint: 'Large sample, unlikely to be chance' },
  moderate: { label: 'Moderate evidence', hint: 'Holds up statistically, worth acting on' },
  weak: { label: 'Weak signal', hint: 'Suggestive only — do not rebuild your week around it' },
  insufficient: { label: 'Not enough data', hint: 'Stated so you know it is unanswered, not settled' },
};

/**
 * Small horizontal bar chart for findings that carry a breakdown.
 *
 * The two kinds of series need opposite treatment. Deviations straddle zero,
 * so they grow left or right from a centre line and the direction is the
 * point. Raw series — yearly HRV averages, say — are all large positive
 * numbers clustered together, and scaling those from zero makes four
 * near-identical bars that hide the very difference being reported, so they
 * are scaled across their own range instead.
 */
function MiniTable({ rows }) {
  const values = rows.map((r) => r.value).filter((v) => v !== null);
  if (!values.length) return null;
  const raw = rows.some((r) => r.raw);

  const max = Math.max(...values.map(Math.abs));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;

  return (
    <div className="mt-3 space-y-1">
      {rows.map((row) => {
        const value = row.value ?? 0;
        const positive = value >= 0;
        // Raw bars keep a visible floor so the smallest year is still a bar,
        // while the rest of the width carries the differences between years.
        const width = raw
          ? 15 + ((value - lo) / span) * 85
          : max
            ? (Math.abs(value) / max) * 50
            : 0;

        return (
          <div key={row.label} className="flex items-center gap-2">
            <span className="muted w-20 shrink-0 truncate text-[10px]">{row.label}</span>
            <div
              className="relative h-3 flex-1 overflow-hidden rounded-full"
              style={{ background: 'var(--bg-elevated)' }}
            >
              {!raw ? (
                <span className="absolute inset-y-0 left-1/2 w-px" style={{ background: 'var(--border)' }} />
              ) : null}
              <div
                className="absolute inset-y-0 rounded-full"
                style={{
                  width: `${Math.max(width, 2)}%`,
                  left: raw || positive ? (raw ? 0 : '50%') : undefined,
                  right: !raw && !positive ? '50%' : undefined,
                  background: raw ? '#38bdf8' : positive ? '#22c55e' : '#ef4444',
                }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-[10px] font-semibold tabular-nums">
              {value >= 0 && !raw ? '+' : ''}
              {value.toFixed(1)}
              {raw ? '' : '%'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Insights() {
  const { findings, days, refining } = useFindings();

  if (!findings.length) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Nothing to report yet"
        body="These findings come from comparing your own days against each other, which needs a couple of months of readings before any of it means anything. Import your Apple Health history to get there in one step."
      />
    );
  }

  const grouped = findings.reduce((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <p className="muted text-xs leading-relaxed">
        Everything below was measured from your own {days.toLocaleString()} days of readings
        {refining ? ' (still loading the rest)' : ''}. Where it disagrees with general advice, it is
        describing you and the advice is describing an average — but check the sample size before
        you act on anything.
      </p>

      {Object.entries(grouped).map(([category, items], gi) => (
        <section key={category} className="space-y-2.5">
          <h2 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            {category}
          </h2>

          {items.map((finding, i) => {
            const tone = TONE[finding.tone] ?? TONE.info;
            const conf = CONFIDENCE[finding.confidence] ?? CONFIDENCE.weak;
            // A finding that reports "no meaningful difference" must not wear
            // an arrow — the direction of a null result is not information.
            const negligible =
              finding.confidence === 'weak' ||
              finding.confidence === 'insufficient' ||
              !Number.isFinite(finding.evidence?.effect);
            const Icon = negligible
              ? Minus
              : finding.evidence.effect > 0
                ? TrendingUp
                : TrendingDown;

            return (
              <Card key={finding.id} delay={gi * 40 + i * 30} className="overflow-hidden">
                <div className="h-0.5 w-full" style={{ background: tone.bar }} />
                <CardBody className="space-y-2 pt-3">
                  <div className="flex items-start gap-2">
                    <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-lg', tone.chip)}>
                      <Icon size={14} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold leading-snug">{finding.title}</h3>
                      <p className="mt-0.5 text-xs font-medium" style={{ color: tone.bar }}>
                        {finding.headline}
                      </p>
                    </div>
                  </div>

                  <p className="muted text-xs leading-relaxed">{finding.detail}</p>

                  {finding.table ? <MiniTable rows={finding.table} /> : null}

                  <div
                    className="flex items-start justify-between gap-3 border-t pt-2 text-[10px]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <span className="muted min-w-0">
                      {finding.statusOnly ? (
                        'Today’s reading against your 60-day baseline'
                      ) : (
                        <>
                          <span className="font-semibold">{conf.label}</span> · {conf.hint}
                        </>
                      )}
                    </span>
                    {finding.evidence?.n ? (
                      <span className="muted shrink-0 whitespace-nowrap tabular-nums">
                        n = {finding.evidence.n.toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </section>
      ))}
    </div>
  );
}
