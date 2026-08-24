import clsx from 'clsx';

export const RANGES = [
  { key: 'week', label: 'Week', days: 7 },
  { key: 'month', label: 'Month', days: 30 },
  { key: 'quarter', label: '3M', days: 90 },
  { key: 'year', label: 'Year', days: 365 },
];

/**
 * How far back a chart looks.
 *
 * Apple's Day/Week/Month/Year, minus the day — a single day of a daily metric
 * is one point, and offering a range that cannot draw a line is worse than not
 * offering it. Quarter takes its place, which is the window most of the trends
 * here actually turn over in.
 */
export default function TimeRange({ value, onChange, options = RANGES, className }) {
  return (
    <div
      className={clsx('flex gap-0.5 rounded-xl p-0.5', className)}
      style={{ background: 'var(--bg-sunken)' }}
      role="tablist"
    >
      {options.map((r) => {
        const active = r.key === value;
        return (
          <button
            key={r.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(r.key)}
            className={clsx(
              'flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors',
              active ? 'text-[color:var(--text)]' : 'muted'
            )}
            style={active ? { background: 'var(--bg-elevated)' } : undefined}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

export const daysFor = (key) => RANGES.find((r) => r.key === key)?.days ?? 30;
