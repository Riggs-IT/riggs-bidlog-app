import {reviewPairFingerprint, REVIEW_PAIR_STATE, verifyReviewPair} from './reviewPairCoordinator.js';
import {recoverableReviewReason} from './reviewCacheRecovery.js';

// Keep the ORIGINAL certified financial response during an incomplete refresh.
// No arbitrary 180-second timer should replace a valid on-screen balance with
// a temporary status. New identity/version/eligibility evidence and Arizona
// day-15 revalidation still revoke it; no Pending label is ever borrowed.

// A newer partial response may contain changed dollar amounts; publishing
// those amounts with the old Pending badge is forbidden. Holding the ORIGINAL
// pair instead is safe only while no newer evidence revokes the job/PM version,
// the active-project identity, or the set of SQL rebalance flags.
function knownIdentityOrVersionChange(old, current, balance) {
  try {
    const oldRows = old.balance;
    if (!Array.isArray(oldRows)) return true;
    if (current) {
      if (!Array.isArray(current.projects) || !Array.isArray(current.monthly?.items)) return true;
      const projects = new Map(current.projects.map(row => [String(row.jobListId), row]));
      for (const oldRow of oldRows) {
        const project = projects.get(String(oldRow.jobListId));
        if (!project || project.projectCompleted === true || project.hasPmForecast !== true
            || project.jobNumber !== oldRow.jobNumber
            || Number(project.latestForecastVersionId) !== Number(oldRow.forecastVersionId)) return true;
        // A newly observed locked-month eligibility/version change is an
        // explicit invalidation, not an excuse to display stale Pending.
        const oldMonthly = old.current.monthly.items.find(
          row => String(row.jobListId) === String(oldRow.jobListId));
        const newMonthly = current.monthly.items.find(
          row => String(row.jobListId) === String(oldRow.jobListId));
        if (!oldMonthly || !newMonthly || !Array.isArray(newMonthly.items)) return true;
        const lock = oldRow.reviewLockMonth;
        const wasLocked = oldMonthly.items.find(row => row.monthStart === lock);
        const nowLocked = newMonthly.items.find(row => row.monthStart === lock);
        if (Boolean(wasLocked) !== Boolean(nowLocked)) return true;
        if (wasLocked && (Number(nowLocked.latestForecastVersionId) !== Number(wasLocked.latestForecastVersionId)
            || nowLocked.monthEditState !== wasLocked.monthEditState
            || nowLocked.isEditable !== wasLocked.isEditable
            || nowLocked.primaryProjectionSource !== wasLocked.primaryProjectionSource)) return true;
      }
    }
    if (balance) {
      if (!Array.isArray(balance) || balance.length !== oldRows.length) return true;
      const rows = new Map(balance.map(row => [String(row.jobListId), row]));
      if (rows.size !== oldRows.length) return true;
      for (const oldRow of oldRows) {
        const newer = rows.get(String(oldRow.jobListId));
        if (!newer || newer.needsRebalance !== true
            || newer.jobNumber !== oldRow.jobNumber
            || Number(newer.forecastVersionId) !== Number(oldRow.forecastVersionId)) return true;
      }
    }
    return false;
  } catch { return true; }
}

export function createReviewCohortPublisher({
  publish,
  nowUTC = () => new Date().toISOString(),
}) {
  if (typeof publish !== 'function') throw new TypeError('Invalid review cohort publisher');
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
    certified = {pair};
    publish({current: pair.current, balance: pair.balance, acceptedPair: pair});
    return 'VERIFIED';
  }

  function unavailable({current, balance, reason} = {}) {
    let retain = false;
    // An incomplete read is not an atomic replacement. Keep OLD response
    // objects, including the original amounts. Never attach its Pending label
    // to the changed newer rows. A known new PM version, job departure or
    // changed SQL flag set revokes immediately, as does day-15 revalidation.
    const incomplete = reason === 'PARTIAL_REFRESH'
      || recoverableReviewReason({state: 'UNAVAILABLE', reason});
    if (certified && incomplete) {
      const old = certified.pair;
      try {
        retain = !knownIdentityOrVersionChange(old, current, balance)
          && reviewPairFingerprint(old.current, old.balance) === old.fingerprint
          && verifyReviewPair(old.current, old.balance, nowUTC()).state === REVIEW_PAIR_STATE.VERIFIED;
      } catch { retain = false; }
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
