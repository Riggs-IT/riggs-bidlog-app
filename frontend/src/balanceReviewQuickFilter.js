import {NEEDS_REBALANCE, PENDING_FOUNDATION} from './portfolioBalance.js';

// These are UI-only values in the EXISTING projection-source facet.
// SQL/API owns financial balance and the Pending Foundation decision.
export const BALANCE_REVIEW_FILTER = Object.freeze({
  ALL_REVIEWS: 'rebalance',
  NEEDS_ONLY: 'rebalance-needs',
  PENDING_ONLY: 'rebalance-pending',
});

export function isBalanceReviewFilter(value) {
  return Object.values(BALANCE_REVIEW_FILTER).includes(value);
}

export function safeReviewStatus(review) {
  return review?.reviewStatus === PENDING_FOUNDATION
    && review?.reviewStatusSource === 'VERIFIED_SERVER'
    ? PENDING_FOUNDATION : NEEDS_REBALANCE;
}

export function quickFilterForStatus(reviewStatus) {
  return reviewStatus === PENDING_FOUNDATION ? BALANCE_REVIEW_FILTER.PENDING_ONLY
    : reviewStatus === NEEDS_REBALANCE ? BALANCE_REVIEW_FILTER.NEEDS_ONLY : null;
}

export function toggleExclusiveBalanceReview(current, status, all = '__ALL__') {
  const selection = quickFilterForStatus(status);
  return !selection ? current : current === selection ? all : selection;
}

export function balanceReviewFacetValues(row) {
  if (!row?.needsRebalance) return [];
  // The SQL imbalance is known, but its Foundation timing classification
  // is not. Keep it in All Reviews without inventing a Needs-only facet.
  if (row.reviewStatusSource === 'DEFERRED_CLASSIFICATION') {
    return [BALANCE_REVIEW_FILTER.ALL_REVIEWS];
  }
  return [BALANCE_REVIEW_FILTER.ALL_REVIEWS,
    quickFilterForStatus(safeReviewStatus(row))];
}

export function matchesBalanceReviewFacet(row, selection) {
  if (!row?.needsRebalance) return false;
  if (selection === BALANCE_REVIEW_FILTER.ALL_REVIEWS) return true;
  if (row.reviewStatusSource === 'DEFERRED_CLASSIFICATION') return false;
  return quickFilterForStatus(safeReviewStatus(row)) === selection;
}

// The surrounding project row opens its drawer on click. Delay ONLY badge
// single-click navigation so a native double-click can filter without opening
// the drawer on its first click; other row clicks remain immediate.
export function createBalanceBadgeInteractions({onOpen, onIsolate,
  schedule = setTimeout, cancel = clearTimeout, delayMs = 400}) {
  let timer = null;
  const dispose = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  return {
    click(event) {
      event.stopPropagation();
      if (event.detail !== 1) return; // native double/keyboard click
      dispose();
      timer = schedule(() => {
        timer = null;
        onOpen?.();
      }, delayMs);
    },
    doubleClick(event) {
      event.preventDefault();
      event.stopPropagation();
      dispose();
      onIsolate();
    },
    keyDown(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.stopPropagation(); // don't activate the surrounding row
      event.preventDefault();
      dispose();
      onIsolate();
    },
    dispose,
  };
}
