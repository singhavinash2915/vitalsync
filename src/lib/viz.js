/**
 * The one place colour is decided.
 *
 * Before this file there were ten hex values spread across roughly 160
 * hardcoded usages, with `#22c55e` alone doing four unrelated jobs — an
 * excellent score, protein on target, the muscle line on the body chart, and a
 * "good" tone chip. Nothing said which of those meanings it carried, so none of
 * them could be changed safely.
 *
 * Two palettes, because colour does two different jobs here and mixing them is
 * what caused the mess:
 *
 *   CATEGORICAL — identity. Which series is this? Assigned in fixed slot order
 *   and never cycled; the colour follows the thing, not its rank, so filtering a
 *   chart must never repaint the survivors.
 *
 *   STATUS — state. How is this going? Reserved for the score bands and never
 *   borrowed for "series 5".
 *
 * Every value below was checked with the data-viz validator against this app's
 * real surfaces rather than picked by eye.
 */

/**
 * Chart series. Validated on both #0b0f14 and #111820:
 * worst adjacent CVD ΔE 8.4, worst normal-vision ΔE 19.8, all ≥ 3:1 contrast.
 */
export const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500'],
};

/**
 * Score bands, poor → excellent.
 *
 * A four-step red→amber→green ramp cannot be made fully colour-separable — the
 * bands are adjacent hues by construction, and every candidate tested failed the
 * normal-vision floor somewhere along the warm end. Rather than pretend
 * otherwise, this ramp is built so colour is never the only signal:
 *
 *   - lightness is monotone with every adjacent gap ≥ 0.06, so the bands remain
 *     distinguishable in greyscale and under any colour-vision deficiency;
 *   - CVD separation is 11.6 against the previous palette's 4.2, which was a
 *     hard failure — "Good" and "Excellent" were the same colour to a red-green
 *     colourblind reader;
 *   - and the rule in `statusNeedsLabel` below is not optional.
 *
 * The residual: the warm end sits at ΔE 13.6 dark / 12.5 light, under the 15
 * floor. That is the inherent cost of four warm bands — every candidate tried
 * failed somewhere along red→amber→yellow — and the label is what resolves it.
 *
 * Light ramp measured separately against #ffffff: CVD ΔE 10.1, monotone L.
 */
export const STATUS = {
  dark: { poor: '#b83f3f', moderate: '#d1721f', good: '#dfa81a', excellent: '#6fe3ae' },
  light: { poor: '#7d2b2b', moderate: '#bd6a12', good: '#a8ad2e', excellent: '#45c894' },
};

/** Chart furniture, so no component styles its own axes. */
export const SURFACE = {
  light: { grid: '#e6e9ee', axis: '#5b6673', tooltipBg: '#ffffff', tooltipBorder: '#e2e5ea', track: '#e6e9ee' },
  dark: { grid: '#1b2530', axis: '#8494a6', tooltipBg: '#111820', tooltipBorder: '#1e2936', track: '#1b2530' },
};

/**
 * Forms that compare every series against every other — scatter, donut,
 * anything where non-adjacent slices sit side by side — cannot use all four.
 * With all pairs in play the fourth slot puts yellow next to orange and the
 * separation floors fail. Past three, fold the rest into "Other".
 */
export const ALL_PAIRS_CAP = 3;

const modeOf = (isDark) => (isDark ? 'dark' : 'light');

/** Series colour for slot `i`, never cycled past the palette length. */
export function seriesColor(i, isDark = true) {
  const set = CATEGORICAL[modeOf(isDark)];
  return set[Math.min(i, set.length - 1)];
}

/** The whole series palette for a mode. */
export const seriesPalette = (isDark = true) => CATEGORICAL[modeOf(isDark)];

/** Status colour for a band key. */
export const statusColor = (band, isDark = true) =>
  STATUS[modeOf(isDark)][band] ?? STATUS[modeOf(isDark)].moderate;

/** Chart furniture for a mode. */
export const surface = (isDark = true) => SURFACE[modeOf(isDark)];

/**
 * A status colour must never be the only thing carrying the meaning.
 *
 * Exported as a named constant rather than a comment so it is greppable, and so
 * the reason survives being read in isolation: red↔orange are 13.6 apart, which
 * is below the floor at which full-colour vision reliably separates them. A bar
 * coloured "poor" with no label beside it is not communicating anything.
 */
export const STATUS_NEEDS_LABEL =
  'Status colour carries no meaning alone — always render the band label or an icon with it.';

/** Recharts tooltip styling, identical everywhere. */
export const tooltipStyle = (isDark = true) => ({
  background: surface(isDark).tooltipBg,
  border: `1px solid ${surface(isDark).tooltipBorder}`,
  borderRadius: 12,
  fontSize: 11,
  padding: '6px 10px',
});

/** Shared axis props — recessive, per the mark spec. */
export const axisProps = (isDark = true) => ({
  tick: { fontSize: 10, fill: surface(isDark).axis },
  axisLine: false,
  tickLine: false,
});
