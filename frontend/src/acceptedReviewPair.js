import {indexPortfolioRebalance, NEEDS_REBALANCE} from './portfolioBalance.js';
import {verifyReviewPair, reviewPairFingerprint, REVIEW_PAIR_STATE} from './reviewPairCoordinator.js';

// The coordinator supplies the accepted response certificate; the UI consumes
// it as the sole path for server-owned visible financial review labels.
// The accepted certificate is a single immutable container of exact response
// references. It is usable only while the screen still displays those same
// primary projects, monthly records and portfolio-balance rows. This prevents
// a late/partial/fresh read from making a verified server label appear against
// a different set of displayed financial amounts.
// Returns null on ANY uncertainty; never synthesize "Pending Foundation".
export function acceptedServerReviewIndex(pair, visible, asOfUTC) {
  if (!pair || !visible || !pair.current || !Array.isArray(pair.balance)
      || !Array.isArray(pair.current.projects)
      || !Array.isArray(pair.current.monthly?.items)
      || !(visible.currentMonthly instanceof Map)
      || pair.current.projects !== visible.currentProjects
      || pair.balance !== visible.portfolioBalance
      || typeof pair.primarySnapshotId !== 'string'
      || typeof visible.primarySnapshotId !== 'string'
      || pair.primarySnapshotId !== visible.primarySnapshotId.toLowerCase()) return null;

  const monthly = pair.current.monthly.items;
  if (monthly.length !== visible.currentMonthly.size) return null;
  const seen = new Set();
  for (const row of monthly) {
    const id = row?.jobListId;
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)
        || !Array.isArray(row.items)
        || visible.currentMonthly.get(id) !== row.items) return null;
    seen.add(id);
  }

  // A certified pair cannot be mutated in place to borrow its old identity.
  // This covers review status, amounts, and month evidence without duplicating
  // the server's Pending Foundation financial classifier in React.
  try {
    if (typeof pair.fingerprint !== 'string'
        || reviewPairFingerprint(pair.current, pair.balance) !== pair.fingerprint) return null;
  } catch { return null; }

  // Recheck with the CURRENT clock, not the clock at original acceptance.
  // A day-15 rollover, changed row, PM version or review snapshot revokes it.
  if (verifyReviewPair(pair.current, pair.balance, asOfUTC).state !== REVIEW_PAIR_STATE.VERIFIED) {
    return null;
  }
  try {
    // Authoritative SQL balance fields are unchanged; ONLY this checked
    // cohort supplies server reviewStatus to the visible application.
    return new Map([...indexPortfolioRebalance(pair.balance)].map(([key, row]) => [
      key, Object.freeze({...row, reviewStatusSource: 'VERIFIED_SERVER'}),
    ]));
  } catch {
    return null;
  }
}


// Server-owned review display: use the classification ONLY with the
// accepted exact financial response pair. Otherwise retain SQL's authoritative
// needsRebalance flag and amounts, with a conservative Needs Rebalance label.
// Never borrow a provisional Pending Foundation value from an unverified API
// response, and never run an independent React billing inference for display.
export const VISIBLE_REVIEW_SOURCE = Object.freeze({
  VERIFIED_SERVER: 'VERIFIED_SERVER',
  SQL_REBALANCE_FALLBACK: 'SQL_REBALANCE_FALLBACK',
  BALANCE_UNAVAILABLE: 'BALANCE_UNAVAILABLE',
  DEFERRED_CLASSIFICATION: 'DEFERRED_CLASSIFICATION',
});

export function resolveVisiblePortfolioReviews(pair, visible, asOfUTC,
  {deferUnverified = false} = {}) {
  if (!visible || visible.portfolioBalance === null
      || visible.portfolioBalance === undefined) {
    // Do not misstate a failed balance read as zero reviews.
    return {source: VISIBLE_REVIEW_SOURCE.BALANCE_UNAVAILABLE, rows: new Map()};
  }

  const verified = acceptedServerReviewIndex(pair, visible, asOfUTC);
  if (verified) {
    return {source: VISIBLE_REVIEW_SOURCE.VERIFIED_SERVER, rows: verified};
  }

  // indexPortfolioRebalance throws on invalid/doubled SQL flags; a corrupted
  // response must fail loudly rather than appearing as no projects to review.
  // Shallow-copy each row to preserve all authoritative financial fields.
  const fallback = new Map([...indexPortfolioRebalance(visible.portfolioBalance)]
    .map(([key, row]) => [key, Object.freeze({
      ...row,
      reviewStatus: NEEDS_REBALANCE,
      reviewStatusSource: deferUnverified
        ? VISIBLE_REVIEW_SOURCE.DEFERRED_CLASSIFICATION
        : VISIBLE_REVIEW_SOURCE.SQL_REBALANCE_FALLBACK,
    })]));
  return {source: deferUnverified
    ? VISIBLE_REVIEW_SOURCE.DEFERRED_CLASSIFICATION
    : VISIBLE_REVIEW_SOURCE.SQL_REBALANCE_FALLBACK, rows: fallback};
}
