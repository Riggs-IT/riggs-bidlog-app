import {reviewPairFingerprint, REVIEW_PAIR_STATE, verifyReviewPair} from './reviewPairCoordinator.js';
import {recoverableReviewReason} from './reviewCacheRecovery.js';

// Presentation-only grace for an unchanged, already-certified financial cohort.
// NEVER attach its Pending labels to newly fetched financial data. Display the
// original exact response refs until a new complete, validated pair is ready.
// The bridge's normal 120-second TTL is shorter than this 180-second maximum.
export const VERIFIED_COHORT_RETAIN_MS = 180_000;

const REVIEW_FIELDS = new Set([
  'reviewStatus', 'reviewEvidenceState', 'reviewLockMonth', 'reviewPrimarySnapshotId',
]);

function financialContents(current, balance) {
  if (!current || !Array.isArray(current.projects)
      || !Array.isArray(current.monthly?.items) || !Array.isArray(balance)) return null;
  try {
    return JSON.stringify([
      current.projects,
      current.monthly.items,
      balance.map(row => Object.fromEntries(Object.entries(row)
        .filter(([key]) => !REVIEW_FIELDS.has(key)))),
    ]);
  } catch {
    return null;
  }
}

export function createReviewCohortPublisher({
  publish,
  nowMs = Date.now,
  nowUTC = () => new Date().toISOString(),
  maxRetainMs = VERIFIED_COHORT_RETAIN_MS,
}) {
  if (typeof publish !== 'function' || !Number.isFinite(maxRetainMs)
      || maxRetainMs <= 0) throw new TypeError('Invalid review cohort publisher');
  let certified = null;

  function forget() {
    certified = null;
  }

  function verified(pair) {
    // The existing coordinator MUST supply its own validated, fingerprinted
    // certificate. Never create or promote a certificate here.
    let stillVerified = false;
    try {
      stillVerified = pair && typeof pair.fingerprint === 'string'
        && reviewPairFingerprint(pair.current, pair.balance) === pair.fingerprint
        && verifyReviewPair(pair.current, pair.balance, nowUTC()).state === REVIEW_PAIR_STATE.VERIFIED;
    } catch { /* A concurrent mutation cannot inherit review certification. */ }
    if (!stillVerified) {
      forget();
      publish({current: pair?.current || null, balance: pair?.balance || null, acceptedPair: null});
      return 'UNVERIFIED_COHORT';
    }
    certified = {pair, receivedAt: nowMs()};
    publish({current: pair.current, balance: pair.balance, acceptedPair: pair});
    return 'VERIFIED';
  }

  function unavailable({current, balance, reason, passive = false} = {}) {
    let retain = false;
    if (passive && certified && recoverableReviewReason({state: 'UNAVAILABLE', reason})) {
      const age = nowMs() - certified.receivedAt;
      const old = certified.pair;
      const existingContents = financialContents(old.current, old.balance);
      const incomingContents = financialContents(current, balance);
      try {
        retain = Number.isFinite(age) && age >= 0 && age < maxRetainMs
          && existingContents !== null && existingContents === incomingContents
          && reviewPairFingerprint(old.current, old.balance) === old.fingerprint
          && verifyReviewPair(old.current, old.balance, nowUTC()).state === REVIEW_PAIR_STATE.VERIFIED;
      } catch {
        retain = false;
      }
    }
    if (retain) return 'RETAINED_VERIFIED_COHORT';
    forget();
    // Partial financial reads are allowed to retain old NUMBERS, but must not
    // retain an old review certificate. Callers update only supplied halves.
    publish({current, balance, acceptedPair: null});
    return 'UNVERIFIED_COHORT';
  }

  return {verified, unavailable, forget};
}
