import {indexPortfolioRebalance} from './portfolioBalance.js';
import {verifyReviewPair, REVIEW_PAIR_STATE} from './reviewPairCoordinator.js';

// Stage 3G5: prepare, but DO NOT ENABLE, server-owned review presentation.
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

  // Recheck with the CURRENT clock, not the clock at original acceptance.
  // A day-15 rollover, changed row, PM version or review snapshot revokes it.
  if (verifyReviewPair(pair.current, pair.balance, asOfUTC).state !== REVIEW_PAIR_STATE.VERIFIED) {
    return null;
  }
  try {
    // Authoritative financial/NeedsRebalance fields are unchanged. A future
    // cutover may read reviewStatus ONLY from this already-verified map.
    return new Map([...indexPortfolioRebalance(pair.balance)].map(([key, row]) => [
      key, Object.freeze({...row, reviewStatusSource: 'VERIFIED_SERVER'}),
    ]));
  } catch {
    return null;
  }
}
