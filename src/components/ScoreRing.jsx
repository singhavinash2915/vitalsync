import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { scoreColor, scoreLabel } from '../lib/scores';

/**
 * Counts from the previous value to the next one with an ease-out curve.
 * Honours prefers-reduced-motion by snapping straight to the target.
 */
export function useAnimatedNumber(target, duration = 900) {
  const [value, setValue] = useState(0);
  const frame = useRef();
  const from = useRef(0);

  useEffect(() => {
    const end = Number(target) || 0;
    const start = from.current;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (reduced || start === end) {
      from.current = end;
      setValue(end);
      return undefined;
    }

    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      const current = start + (end - start) * eased;
      setValue(current);
      if (p < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        from.current = end;
      }
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return value;
}

/**
 * Apple-Fitness-style SVG progress ring.
 *
 * The arc is drawn with stroke-dasharray on a circle rotated -90° so it
 * starts at 12 o'clock, and the sweep is driven by the animated value rather
 * than a CSS transition so the number and the arc stay in lockstep.
 */
export function ScoreRing({
  value = 0,
  size = 120,
  stroke = 10,
  label,
  sublabel,
  color,
  showValue = true,
  suffix = '%',
  /** Overrides the band name under the label — exertion needs load wording. */
  statusLabel,
  className,
  children,
}) {
  const animated = useAnimatedNumber(value);
  const pct = Math.max(0, Math.min(100, animated));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  const ringColor = color ?? scoreColor(value);
  const gradientId = `ring-${label ?? 'score'}-${size}`.replace(/\s+/g, '-');

  return (
    <div className={clsx('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${label ?? 'Score'}: ${Math.round(value)} out of 100, ${
            statusLabel ?? scoreLabel(value)
          }`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={ringColor} stopOpacity="0.75" />
              <stop offset="100%" stopColor={ringColor} stopOpacity="1" />
            </linearGradient>
          </defs>

          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--track)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ filter: `drop-shadow(0 0 ${stroke / 2}px ${ringColor}55)` }}
          />
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {children ?? (
            <>
              {showValue ? (
                <span
                  className="font-semibold leading-none tracking-tight tabular-nums"
                  style={{ fontSize: size * 0.27, color: ringColor }}
                >
                  {Math.round(animated)}
                  <span style={{ fontSize: size * 0.13 }}>{suffix}</span>
                </span>
              ) : null}
              {sublabel ? (
                <span className="muted mt-1" style={{ fontSize: size * 0.1 }}>
                  {sublabel}
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>

      {label ? (
        <div className="mt-2 text-center">
          <p className="text-xs font-semibold">{label}</p>
          <p className="text-[10px]" style={{ color: ringColor }}>
            {statusLabel ?? scoreLabel(value)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Compact linear variant used inside breakdown lists. */
export function ScoreBar({ value = 0, label, color, unit = '%' }) {
  const animated = useAnimatedNumber(value, 700);
  const barColor = color ?? scoreColor(value);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="muted">{label}</span>
        <span className="font-semibold tabular-nums" style={{ color: barColor }}>
          {Math.round(animated)}
          {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--track)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(100, animated))}%`,
            background: barColor,
            transition: 'background-color .3s',
          }}
        />
      </div>
    </div>
  );
}

export default ScoreRing;
