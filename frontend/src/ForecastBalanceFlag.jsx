import React from 'react';
import {balanceReviewLabel, PENDING_FOUNDATION} from './portfolioBalance.js';

// Consistent treatment across overview, project directory, pivot and drawer.
export default function ForecastBalanceFlag({review, className = '', onClick}) {
  if (!review) return null;
  const pending = review.reviewStatus === PENDING_FOUNDATION;
  const label = balanceReviewLabel(review);
  const title = pending
    ? 'Recently locked billing is awaiting Foundation reconciliation. The underlying balance gap is still tracked.'
    : 'PM Projection Out of Balance — review billing projections';
  const classes = [
    'needs-rebalance-flag',
    pending && 'pending-foundation-flag',
    onClick && 'needs-rebalance-action',
    className,
  ].filter(Boolean).join(' ');
  return onClick ? (
    <button type="button" className={classes} data-needs-rebalance title={title}
      onClick={onClick} onKeyDown={event => event.stopPropagation()}>
      {label}
    </button>
  ) : (
    <span className={classes} data-needs-rebalance title={title}>{label}</span>
  );
}
