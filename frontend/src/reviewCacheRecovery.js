// Recover a review certificate after the shared API finishes a cache rebuild.
// Polls only the authenticated cache STATUS GET (no SQL reader, fresh=true or POST).
// React still validates a new paired primary/balance GET before showing Pending.
const REVIEW_DATASETS = [
  'current_project_primary_projection',
  'portfolio_balance',
];

export function reviewCacheReady(status) {
  return status?.status === 'COMPLETE'
    && REVIEW_DATASETS.every(key => status.datasets?.[key]?.state === 'FRESH');
}

export function recoverableReviewReason(evidence) {
  return evidence?.state === 'UNAVAILABLE' && [
    'UNAVAILABLE', 'SNAPSHOT_MISMATCH', 'SNAPSHOT_UNAVAILABLE', 'MISSING_PRIMARY',
  ].includes(evidence.reason);
}

export function createReviewCacheRecovery({
  readStatus,
  recertify,
  allowed,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  pollMs = 4000,
  maxChecks = 23,
}) {
  if (typeof readStatus !== 'function' || typeof recertify !== 'function'
      || typeof allowed !== 'function') {
    throw new TypeError('Review recovery requires status, recertification and visibility guards.');
  }
  let epoch = 0;
  let inFlight = null;
  let lastAttemptedRefreshId = null;

  function cancel() {
    epoch++;
    inFlight = null;
  }

  function start() {
    if (inFlight) return inFlight;
    const token = ++epoch;
    const task = (async () => {
      for (let check = 0; check < maxChecks; check++) {
        // Delay first, so the triggering paired batch has fully settled.
        await sleep(pollMs);
        if (token !== epoch || !allowed()) return 'CANCELLED';
        let status;
        try { status = await readStatus(); }
        catch { status = null; } // Metadata failure is not a financial-data success.
        if (token !== epoch || !allowed()) return 'CANCELLED';
        if (status?.status === 'FAILED' || status?.status === 'PARTIAL') {
          return 'REFRESH_INCOMPLETE';
        }
        if (!reviewCacheReady(status)) continue;

        // Never loop through the same complete generation after a rejected
        // version/identity check; a later user action or NEW generation can retry.
        const id = status.refreshId;
        if (typeof id !== 'string' || !id || id === lastAttemptedRefreshId) {
          return 'ALREADY_ATTEMPTED';
        }
        lastAttemptedRefreshId = id;
        try { await recertify(); }
        catch { return 'RECERTIFICATION_FAILED'; }
        return 'RECERTIFICATION_ATTEMPTED';
      }
      return 'TIMED_OUT';
    })();
    inFlight = task;
    const clear = () => { if (inFlight === task) inFlight = null; };
    void task.then(clear, clear);
    return task;
  }
  return {start, cancel};
}
