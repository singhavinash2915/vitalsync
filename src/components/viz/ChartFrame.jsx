import { useTheme } from '../../context/ThemeContext';
import { surface, tooltipStyle, axisProps } from '../../lib/viz';

/**
 * One chart theme, handed to every chart.
 *
 * Before this, each chart repeated its own axis colours, tick sizes and tooltip
 * styling as inline Recharts props, so they drifted apart — different greys,
 * different corner radii, different font sizes on the same screen. A hook
 * rather than a wrapper component, because Recharts wants these props on the
 * individual axis and tooltip elements, not on an ancestor.
 */
export function useChartTheme() {
  const { isDark } = useTheme();
  return {
    isDark,
    axis: axisProps(isDark),
    tooltip: tooltipStyle(isDark),
    grid: surface(isDark).grid,
    track: surface(isDark).track,
  };
}

/**
 * Legend for two or more series.
 *
 * Always present once a chart carries more than one series, so identity is
 * never colour alone — which matters especially here, because the warm end of
 * the status ramp cannot be made fully separable.
 */
export function ChartLegend({ items = [], className = '' }) {
  if (items.length < 2) return null;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {items.map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1.5 text-[10px]">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
          <span className="muted">{label}</span>
        </span>
      ))}
    </div>
  );
}
