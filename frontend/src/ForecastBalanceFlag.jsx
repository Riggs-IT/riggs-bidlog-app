import React, {useEffect, useMemo, useRef} from 'react';
import {balanceReviewLabel, PENDING_FOUNDATION} from './portfolioBalance.js';
import {createBalanceBadgeInteractions, quickFilterForStatus,
  safeReviewStatus} from './balanceReviewQuickFilter.js';

// The badges stay read-only outside Projected Billings. A single-click of a
// quick-filter badge still opens projections; native double-click or Enter/Space
// toggles the shared exclusive facet without opening the project drawer.
export default function ForecastBalanceFlag({review, className = '', onClick,
  onQuickFilter, selectedQuickFilter}) {
  const status = safeReviewStatus(review);
  // Inline parent callbacks may change while a badge is awaiting its second
  // click. Preserve the timer across rerenders, but use the latest callbacks.
  const latest = useRef({onClick, onQuickFilter, status});
  latest.current = {onClick, onQuickFilter, status};
  const interactions = useMemo(() => createBalanceBadgeInteractions({
    onOpen: () => latest.current.onClick?.(),
    onIsolate: () => latest.current.onQuickFilter?.(latest.current.status),
  }), []);
  useEffect(() => () => interactions.dispose(), [interactions]);

  // A cold load/recovery must not briefly claim Needs Rebalance when the
  // Data API may soon verify this same SQL gap as Pending Foundation.
  // The numeric SQL gap remains visible in the table during this interval.
  if (!review || review.reviewStatusSource === 'DEFERRED_CLASSIFICATION') return null;
  const pending = status === PENDING_FOUNDATION;
  const label = balanceReviewLabel({reviewStatus: status});
  const title = pending
    ? 'Recently locked billing is awaiting Foundation reconciliation. The underlying balance gap is still tracked.'
    : 'PM Projection Out of Balance — review the remaining contract difference';
  const classes = [
    'needs-rebalance-flag',
    pending && 'pending-foundation-flag',
    (onClick || onQuickFilter) && 'needs-rebalance-action',
    onQuickFilter && selectedQuickFilter === quickFilterForStatus(status) && 'balance-review-quick-selected',
    className,
  ].filter(Boolean).join(' ');
  return onClick || onQuickFilter ? (
    <button type="button" className={classes} data-needs-rebalance
      title={onQuickFilter ? `${title} Click to review. Double-click or press Enter/Space to filter to ${label}.` : title}
      aria-pressed={onQuickFilter ? selectedQuickFilter === quickFilterForStatus(status) : undefined}
      aria-label={onQuickFilter ? `${label}: double-click or press Enter to toggle exclusive filter; single-click to review project` : undefined}
      onClick={onQuickFilter ? interactions.click : onClick}
      onDoubleClick={onQuickFilter ? interactions.doubleClick : undefined}
      onKeyDown={onQuickFilter ? interactions.keyDown : event => event.stopPropagation()}>
      {label}
    </button>
  ) : (
    <span className={classes} data-needs-rebalance title={title}>{label}</span>
  );
}
