import { prettyDate } from '../lib/dates';

/**
 * Shared Recharts tooltip. Recharts injects `active`, `payload` and `label`.
 *
 * @param {object}  formatters  per-dataKey value formatter
 * @param {object}  labels      per-dataKey display name override
 */
export default function ChartTooltip({ active, payload, formatters = {}, labels = {} }) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  const rows = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (!rows.length) return null;

  return (
    <div
      className="rounded-xl border px-3 py-2 text-xs shadow-card"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
    >
      <p className="mb-1 font-semibold">{point.date ? prettyDate(point.date) : ''}</p>
      {rows.map((row) => {
        const format = formatters[row.dataKey];
        const value = format ? format(row.value) : row.value;
        return (
          <p key={row.dataKey} className="flex items-center gap-2 leading-relaxed">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: row.color ?? row.stroke ?? row.fill }}
              aria-hidden="true"
            />
            <span className="muted">{labels[row.dataKey] ?? row.name ?? row.dataKey}</span>
            <span className="ml-auto font-semibold tabular-nums">{value}</span>
          </p>
        );
      })}
    </div>
  );
}
