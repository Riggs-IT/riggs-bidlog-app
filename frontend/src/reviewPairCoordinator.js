import { indexedBalanceReviews, SERVER_REVIEW_AUDIT } from './portfolioBalance.js';

// Stage 3G4: observational, in-memory acceptance of a COORDINATED pair of
// reads. This does not change React's visible financial classification, trigger
// SQL reads, or provide transactional isolation from Foundation updates.
// A manual refresh cannot certify a pairing before the entire refresh succeeds.
export const REVIEW_PAIR_STATE = Object.freeze({
  WAITING: 'WAITING',
  VERIFIED: 'VERIFIED',
  UNAVAILABLE: 'UNAVAILABLE',
  SUPERSEDED: 'SUPERSEDED',
});

const isSnapshotId = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

// Validate the SAME React reconciliation contract used in the visible screen,
// not only equality of UUIDs. A missing/invalid/unavailable row prevents
// certification of the whole cohort; no status can silently become "Pending".
export function verifyReviewPair(current, balance, asOfUTC) {
  if (!current || !Array.isArray(current.projects)
      || !Array.isArray(current.monthly?.items) || !Array.isArray(balance)
      || !isSnapshotId(current.primarySnapshotId)) {
    return {state: REVIEW_PAIR_STATE.UNAVAILABLE, reason: 'MISSING_PRIMARY'};
  }
  const months = new Map();
  for (const item of current.monthly.items) {
    if (!Number.isSafeInteger(item?.jobListId) || item.jobListId <= 0
        || !Array.isArray(item.items) || months.has(item.jobListId)) {
      return {state: REVIEW_PAIR_STATE.UNAVAILABLE, reason: 'INVALID_MONTHS'};
    }
    months.set(item.jobListId, item.items);
  }
  try {
    const audited = indexedBalanceReviews(balance, current.projects, months,
      asOfUTC, current.primarySnapshotId);
    if (!audited.size) {
      // An empty balance response has no row-level review snapshot identity;
      // do not certify it as belonging to this primary read.
      return {state: REVIEW_PAIR_STATE.UNAVAILABLE, reason: 'NO_REVIEW_ROWS'};
    }
    for (const row of audited.values()) {
      if (row.reviewEvidenceAudit !== SERVER_REVIEW_AUDIT.SNAPSHOT_PARITY) {
        return {state: REVIEW_PAIR_STATE.UNAVAILABLE,
          reason: row.reviewEvidenceAudit};
      }
    }
    return {state: REVIEW_PAIR_STATE.VERIFIED,
      primarySnapshotId: current.primarySnapshotId.toLowerCase(),
      flaggedCount: audited.size};
  } catch {
    return {state: REVIEW_PAIR_STATE.UNAVAILABLE, reason: 'INVALID_REVIEW_RESPONSE'};
  }
}

export function createReviewPairCoordinator({onChange = () => {}, now = () => new Date().toISOString()} = {}) {
  let epoch = 0;
  let stage = null;
  let published = {state: REVIEW_PAIR_STATE.UNAVAILABLE, reason: 'NOT_LOADED'};
  const report = data => {
    published = Object.freeze({...data});
    onChange(published);
    return published;
  };

  return {
    get evidence() { return published; },
    begin(kind = 'BATCH') {
      ++epoch;
      stage = {kind, current: null, balance: null, finished: false};
      report({state: REVIEW_PAIR_STATE.WAITING, kind});
      return epoch;
    },
    offerCurrent(token, value) {
      if (token !== epoch || !stage || stage.finished) return false;
      stage.current = value;
      return true;
    },
    offerBalance(token, value) {
      if (token !== epoch || !stage || stage.finished) return false;
      stage.balance = value;
      return true;
    },
    finish(token, {successful = false} = {}) {
      if (token !== epoch || !stage || stage.finished) {
        return {state: REVIEW_PAIR_STATE.SUPERSEDED};
      }
      stage.finished = true;
      if (!successful || !stage.current || !stage.balance) {
        return report({state: REVIEW_PAIR_STATE.UNAVAILABLE, reason: 'PARTIAL_REFRESH'});
      }
      const verdict = verifyReviewPair(stage.current, stage.balance, now());
      return report(verdict);
    },
    invalidate(reason = 'UNPAIRED_READ') {
      ++epoch;
      stage = null;
      return report({state: REVIEW_PAIR_STATE.UNAVAILABLE, reason});
    },
  };
}
