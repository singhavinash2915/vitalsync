import { toNumber, hasNumber } from '../../lib/scores';
import { useChartTheme } from './ChartFrame';

/**
 * What actually fed a score, each part labelled with its weight.
 *
 * The previous breakdown printed a row of bare percentages, which told you the
 * numbers without telling you which of them mattered — a 40% sleep-quality
 * component and a 60% HRV component looked identical. Naming the weight beside
 * each bar is the whole point of the pattern.
 *
 * An absent component shows a dash rather than an empty bar. A zero-width bar
 * and a genuinely zero score are indistinguishable otherwise, and this codebase
 * has already shipped six bugs from treating missing as nought.
 */
export default function ContributorBars({ items = [] }) {
  const theme = useChartTheme();

  return (
    <div className="space-y-2.5">
      {items.map(({ label, value, weight, color }) => {
        const known = hasNumber(value);
        const pct = known ? Math.max(0, Math.min(100, toNumber(value))) : 0;

        return (
          <div key={label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
              <span className="muted min-w-0 truncate">
                {label}
                {weight ? <span className="opacity-60"> · {weight}</span> : null}
              </span>
              <span className="shrink-0 font-semibold tabular-nums" style={{ color: known ? color : undefined }}>
                {known ? `${Math.round(pct)}%` : '—'}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ background: theme.track }}>
              {known ? (
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.max(pct, 1.5)}%`,
                    background: color,
                    // 4px rounded data-end anchored to the baseline.
                    borderRadius: '9999px',
                  }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
