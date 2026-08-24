import { useMemo, useId } from 'react';

/**
 * A number on its own says almost nothing — 51 ms of HRV is excellent for one
 * person and a warning for another, and even for the same person it depends
 * entirely on where it has been sitting. These put the last two weeks behind
 * every value so the direction is readable without opening a chart.
 *
 * Deliberately tiny and axis-free: it is a shape, not a chart. Gaps in the
 * data break the line rather than being interpolated over, because a
 * straight line across a week you didn't wear the watch is a lie.
 */
export function Sparkline({
  values = [],
  width = 64,
  height = 20,
  color = 'var(--text-muted)',
  fill = true,
  invert = false,
}) {
  const gradientId = useId();

  const geometry = useMemo(() => {
    const points = values
      .map((v, i) => ({ i, v: Number(v) }))
      .filter((p) => Number.isFinite(p.v));

    if (points.length < 2) return null;

    const xs = values.length - 1 || 1;
    const ys = points.map((p) => p.v);
    let min = Math.min(...ys);
    let max = Math.max(...ys);
    // A perfectly flat series would divide by zero; give it a little room so
    // it renders as a line through the middle.
    if (max - min < 1e-6) {
      min -= 1;
      max += 1;
    }

    const pad = 2;
    const px = (i) => (i / xs) * (width - pad * 2) + pad;
    const py = (v) => {
      const t = (v - min) / (max - min);
      const norm = invert ? t : 1 - t;
      return norm * (height - pad * 2) + pad;
    };

    // Split into runs of consecutive readings so gaps stay gaps.
    const runs = [];
    let run = [];
    let expected = null;
    for (const p of points) {
      if (expected !== null && p.i !== expected) {
        if (run.length) runs.push(run);
        run = [];
      }
      run.push(p);
      expected = p.i + 1;
    }
    if (run.length) runs.push(run);

    const paths = runs
      .filter((r) => r.length > 1)
      .map((r) => r.map((p, k) => `${k ? 'L' : 'M'}${px(p.i).toFixed(1)},${py(p.v).toFixed(1)}`).join(' '));

    const last = points[points.length - 1];
    const longest = runs.reduce((a, b) => (b.length > a.length ? b : a), runs[0] ?? []);
    const area =
      fill && longest.length > 1
        ? `${longest.map((p, k) => `${k ? 'L' : 'M'}${px(p.i).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ')} L${px(longest[longest.length - 1].i).toFixed(1)},${height} L${px(longest[0].i).toFixed(1)},${height} Z`
        : null;

    return { paths, area, dot: { x: px(last.i), y: py(last.v) } };
  }, [values, width, height, invert, fill]);

  if (!geometry) {
    return <div style={{ width, height }} aria-hidden="true" />;
  }

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {geometry.area ? <path d={geometry.area} fill={`url(#${gradientId})`} /> : null}
      {geometry.paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <circle cx={geometry.dot.x} cy={geometry.dot.y} r="2" fill={color} />
    </svg>
  );
}

/**
 * "+13% vs 60-day" — the interpretation, not the number.
 *
 * `goodDirection` matters: a resting heart rate going *down* is the good news,
 * so the colour cannot simply follow the sign.
 */
export function TrendDelta({ value, baseline, unit = '%', goodDirection = 'up', precision = 0 }) {
  if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(baseline)) || !baseline) {
    return null;
  }

  const pct = ((Number(value) - Number(baseline)) / Number(baseline)) * 100;
  const flat = Math.abs(pct) < 1.5;
  const isGood = goodDirection === 'up' ? pct > 0 : pct < 0;

  const color = flat ? 'var(--text-muted)' : isGood ? 'var(--status-excellent)' : 'var(--status-moderate)';
  const arrow = flat ? '→' : pct > 0 ? '↑' : '↓';

  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold" style={{ color }}>
      {arrow}
      {Math.abs(pct).toFixed(precision)}
      {unit}
    </span>
  );
}
