// Shared metric labels in Projected Billings / Values -> All.
// Keep these widths synchronized with .pivot-metric-labels-column in styles.css.
export const METRIC_EXPANDED_WIDTH = 128;
export const METRIC_COMPACT_WIDTH = 63;
const METRIC_WIDTH_SAVED = METRIC_EXPANDED_WIDTH - METRIC_COMPACT_WIDTH;
const PIN_ENTER_MARGIN = 2;
const PIN_EXIT_HYSTERESIS = 20;
const PIN_SCROLL_RESERVE = 16;

/**
 * Natural scroll distance between the last frozen identity column and Metric.
 * These intervening widths do not change when Metric itself narrows.
 * In contrast, metricColumn.getBoundingClientRect().left does change after
 * sticky positioning and MUST NOT be used as the state-transition threshold.
 */
export function metricPinThreshold(metricColumn, frozenColumn) {
  const columns = Array.from(metricColumn?.parentElement?.children ?? []);
  const metricIndex = columns.indexOf(metricColumn);
  const frozenIndex = columns.indexOf(frozenColumn);
  if (frozenIndex < 0 || metricIndex <= frozenIndex) return null;
  return columns.slice(frozenIndex + 1, metricIndex)
    .reduce((sum, cell) => sum + cell.getBoundingClientRect().width, 0);
}

/**
 * Compact as the Metric lane reaches the frozen identity columns. Allow a
 * 20px return buffer, and do not compact when the 65px width reduction would
 * remove the scroll position needed to keep the labels pinned. This prevents
 * the far-right Total column and the month slider from oscillating.
 */
export function shouldPinMetricLabels({scrollLeft, maxScroll, pinThreshold, isPinned}) {
  if (![scrollLeft, maxScroll, pinThreshold].every(Number.isFinite)) return false;
  const compactMaxScroll = maxScroll - (isPinned ? 0 : METRIC_WIDTH_SAVED);
  if (compactMaxScroll < pinThreshold + PIN_SCROLL_RESERVE) return false;
  return isPinned
    ? scrollLeft >= Math.max(1, pinThreshold - PIN_EXIT_HYSTERESIS)
    : scrollLeft >= pinThreshold + PIN_ENTER_MARGIN;
}
