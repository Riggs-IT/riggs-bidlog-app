import {indexPortfolioRebalance, verifyServerReviewRow, SERVER_REVIEW_VALIDATION} from './portfolioBalance.js';

// In-memory acceptance of a coordinated pair of reads.
// Visible labels can use server statuses only through this gate. This does
// not trigger SQL reads or provide transactional isolation from Foundation.
// A manual refresh cannot certify a pairing before the entire refresh succeeds.
export const REVIEW_PAIR_STATE = Object.freeze({
  WAITING: 'WAITING',
  VERIFIED: 'VERIFIED',
  UNAVAILABLE: 'UNAVAILABLE',
  SUPERSEDED: 'SUPERSEDED',
});

const isSnapshotId = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

// Verify server-owned status against the exact displayed snapshot and PM-month
// identity. No client-side amount arithmetic or duplicate financial classifier.
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
    const indexed = indexPortfolioRebalance(balance);
    if (!indexed.size) {
      // No row-level snapshot identity is available for an empty cohort.
      return {state: REVIEW_PAIR_STATE.UNAVAILABLE, reason: 'NO_REVIEW_ROWS'};
    }
    const projects = new Map();
    for (const item of current.projects) {
      const id = item?.jobListId;
      if (!Number.isSafeInteger(id) || id <= 0 || projects.has(String(id))) {
        return {state: REVIEW_PAIR_STATE.UNAVAILABLE, reason: 'INVALID_PROJECTS'};
      }
      projects.set(String(id), item);
    }
    for (const [key, row] of indexed) {
      const verdict = verifyServerReviewRow(row, projects.get(key),
        months.get(Number(key)), asOfUTC, current.primarySnapshotId);
      if (verdict !== SERVER_REVIEW_VALIDATION.VERIFIED) {
        return {state: REVIEW_PAIR_STATE.UNAVAILABLE, reason: verdict};
      }
    }
    return {state: REVIEW_PAIR_STATE.VERIFIED,
      primarySnapshotId: current.primarySnapshotId.toLowerCase(),
      flaggedCount: indexed.size};
  } catch {
    return {state: REVIEW_PAIR_STATE.UNAVAILABLE, reason: 'INVALID_REVIEW_RESPONSE'};
  }
}

// Capture the exact accepted read contents as well as array identities.
// Existing responses are JSON-serializable; any in-place mutation of status,
// PM evidence or financial amounts revokes certification. This is provenance
// guarding, NOT a financial recomputation or an extra API/SQL read.
export function reviewPairFingerprint(current, balance) {
  return JSON.stringify([current.projects, current.monthly.items, balance]);
}

export function createReviewPairCoordinator({onChange = () => {}, now = () => new Date().toISOString()} = {}) {
  let epoch = 0;
  let stage = null;
  let published = {state: REVIEW_PAIR_STATE.UNAVAILABLE, reason: 'NOT_LOADED'};
  // One callback publishes BOTH the certificate and the exact response pair.
  // A WAITING/UNAVAILABLE/SUPERSEDED epoch publishes no paired financial data.
  const report = (data, acceptedPair = null) => {
    published = Object.freeze({...data});
    onChange(published, acceptedPair);
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
      const asOfUTC = now();
      const verdict = verifyReviewPair(stage.current, stage.balance, asOfUTC);
      if (verdict.state !== REVIEW_PAIR_STATE.VERIFIED) return report(verdict);
      // Keep exact object references, not an independently refreshed copy.
      // React can reject the pair if either displayed dataset changes.
      // Preserve a byte-stable JSON fingerprint of the certified contents;
      // object references alone cannot detect in-place record mutation.
      let fingerprint;
      try { fingerprint = reviewPairFingerprint(stage.current, stage.balance); }
      catch { return report({state: REVIEW_PAIR_STATE.UNAVAILABLE, reason: 'INVALID_PAIR_DATA'}); }
      return report(verdict, Object.freeze({
        current: stage.current, balance: stage.balance,
        primarySnapshotId: verdict.primarySnapshotId, verifiedAtUTC: asOfUTC,
        fingerprint,
      }));
    },
    invalidate(reason = 'UNPAIRED_READ') {
      ++epoch;
      stage = null;
      return report({state: REVIEW_PAIR_STATE.UNAVAILABLE, reason});
    },
  };
}


// A focus/pageshow check can be a no-op when BOTH existing reads are still
// inside their browser max-age window. Do not start a new review certification
// epoch just to receive two `recent` results and discard an already validated
// certificate for the unchanged on-screen financial rows. A one-second safety
// margin protects against crossing max-age between preflight and load().
// This never certifies new evidence or extends the original lock-month window.
export function canReuseVerifiedReviewPair(evidence, current, balance, options, nowMs = Date.now()) {
  const maxAgeMs = options?.maxAgeMs;
  if (evidence?.state !== REVIEW_PAIR_STATE.VERIFIED || !Number.isFinite(maxAgeMs)
      || maxAgeMs <= 1000 || !Number.isFinite(nowMs)
      || current?.pending || balance?.pending
      || !Number.isFinite(current?.lastSuccessAt)
      || !Number.isFinite(balance?.lastSuccessAt)) return false;
  const ageCurrent = nowMs - current.lastSuccessAt;
  const ageBalance = nowMs - balance.lastSuccessAt;
  return ageCurrent >= 0 && ageBalance >= 0
    && ageCurrent < maxAgeMs - 1000 && ageBalance < maxAgeMs - 1000;
}


// An initial screen load and the visibility watcher can call batch() in the
// same React effect turn. The underlying latest-read owners already share
// their in-flight HTTP requests; the review CERTIFICATION must share the
// same epoch as well. Otherwise the second batch supersedes the first token,
// and both finish without a verified review pair until manual Refresh.
// An explicit replace:true is still allowed to supersede an older batch.
export function coalesceReviewBatches(run) {
  if (typeof run !== 'function') throw new TypeError('A review batch reader is required');
  let inFlight = null;
  const load = (config = {}) => {
    if (inFlight !== null && config?.replace !== true) return inFlight;
    const task = Promise.resolve().then(() => run(config));
    inFlight = task;
    const clear = () => {
      if (inFlight === task) inFlight = null;
    };
    // Both settlement paths clear the slot; this handler never swallows a
    // rejected batch or creates an unobserved rejection from finally().
    void task.then(clear, clear);
    return task;
  };
  // A screen/user change cancels the underlying requests; the next mount must
  // never rejoin the canceled, old screen's promise. Reset does not authorize
  // publication: read generation tokens and the review epoch still guard it.
  load.reset = () => { inFlight = null; };
  return load;
}
