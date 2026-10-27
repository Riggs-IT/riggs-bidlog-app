import React from 'react';
import {balanceReviewLabel} from './portfolioBalance.js';
import {safeReviewStatus} from './balanceReviewQuickFilter.js';

// These are presentation-only transformations. The SQL/Data API own the
// difference, status, and remaining-contract calculation.
function amount(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function balanceReviewMoney(value) {
  const number = amount(value);
  if (number === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

// Exact whole-dollar amounts don't need visual .00; fractional cents remain
// visible. This is not a shortened/millions approximation of financial data.
export function balanceReviewCompactMoney(value) {
  return balanceReviewMoney(value).replace(/\.00$/, '');
}

export function signedBalanceGap(review) {
  if (review?.needsRebalance !== true) return null;
  const value = amount(review.rebalanceVarianceAmount);
  if (value === null || Math.abs(value) < 0.005) return null;
  return {
    value,
    text: `${value < 0 ? '−' : '+'}${balanceReviewMoney(Math.abs(value))}`,
    direction: value < 0 ? 'short' : 'over',
  };
}

// Whole-dollar presentation for compact *table* flags only. The original SQL
// variance, full-precision hover text, and drawer amounts are unchanged.
// Sub-half-dollar nonzero gaps show '<$1' instead of misleading '$0'.
export function balanceReviewTableMoney(value) {
  const number = amount(value);
  if (number === null) return '—';
  const absolute = Math.abs(number);
  if (absolute > 0 && absolute < 0.5) return '<$1';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(absolute);
}

// This line is rendered directly UNDER its existing status pill. It is not
// shown for Pending Foundation or an unverified cold-start classification.
export function BalanceReviewAmount({review}) {
  if (review?.reviewStatusSource === 'DEFERRED_CLASSIFICATION'
      || safeReviewStatus(review) !== 'NEEDS_REBALANCE') return null;
  const gap = signedBalanceGap(review);
  if (!gap) return null;
  return (
    <span className="balance-review-amount-line"
      aria-label={`PM projection is ${balanceReviewMoney(Math.abs(gap.value))} ${gap.direction} the remaining contract target`}
      title={`Editable PM projection is ${balanceReviewMoney(Math.abs(gap.value))} ${gap.direction} the remaining contract target.`}>
      {`${balanceReviewTableMoney(gap.value)} ${gap.direction}`}
    </span>
  );
}

// One visible gap; two supporting totals. The card delegates click behavior
// to the existing billing drawer. It never edits or recalculates PM projections.
// For read-only rendering it remains a section, not a fake clickable control.
export default function BalanceReviewSummary({review, onAction, actionLabel = 'View Billing Projections'}) {
  const gap = signedBalanceGap(review);
  if (!gap || review?.reviewStatusSource === 'DEFERRED_CLASSIFICATION') return null;
  const status = safeReviewStatus(review);
  const pending = status === 'PENDING_FOUNDATION';
  const actionable = typeof onAction === 'function';
  const Container = actionable ? 'button' : 'section';
  const statusLabel = balanceReviewLabel({reviewStatus: status});
  return (
    <Container type={actionable ? 'button' : undefined}
      className={`balance-review-detail ${pending ? 'is-pending' : ''} ${actionable ? 'is-actionable' : ''}`}
      aria-label={actionable
        ? `Projection balance, ${statusLabel}, ${balanceReviewMoney(Math.abs(gap.value))} ${gap.direction}. ${actionLabel}`
        : 'PM projection balance difference'}
      title={actionable ? actionLabel : undefined}
      onClick={actionable ? onAction : undefined}>
      <span className="balance-review-detail-heading">
        <span className="balance-review-detail-title">
          <span className="section-kicker">PROJECTION BALANCE</span>
          <strong>{statusLabel}</strong>
        </span>
        <span className="balance-review-detail-amount">
          <strong>{gap.text}</strong>
        </span>
      </span>
      <span className="balance-review-detail-values">
        <span>
          <span>Remaining contract</span>
          <strong title={balanceReviewMoney(review.projectionTargetAmount)}>
            {balanceReviewCompactMoney(review.projectionTargetAmount)}
          </strong>
        </span>
        <span>
          <span>PM projection</span>
          <strong title={balanceReviewMoney(review.editablePmProjectionTotal)}>
            {balanceReviewCompactMoney(review.editablePmProjectionTotal)}
          </strong>
        </span>
      </span>
      {pending ? (
        <span className="balance-review-detail-note">Foundation timing pending reconciliation; PM revision is not required.</span>
      ) : review.reviewStatusSource === 'SQL_REBALANCE_FALLBACK' ? (
        <span className="balance-review-detail-note">Foundation timing unavailable; SQL gap confirmed.</span>
      ) : null}
    </Container>
  );
}
