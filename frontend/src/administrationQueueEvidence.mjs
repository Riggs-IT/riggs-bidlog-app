/**
 * Derived diagnostics, strictly from the existing six SQL outbox summaries.
 * No invented worker liveness, retry history, or failure age.
 */
function nonnegativeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function recordedAgeSeconds(instant, observedAtUTC) {
  if (typeof instant !== 'string' || typeof observedAtUTC !== 'string') return null;
  const start = Date.parse(instant);
  const end = Date.parse(observedAtUTC);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  return Math.floor((end - start) / 1000);
}

export function queueAgeLabel(seconds) {
  if (!Number.isSafeInteger(seconds) || seconds < 0) return 'Not reported';
  if (seconds < 60) return `${seconds} sec`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours} hr ${minutes} min`;
}

export function queueEvidence(rows, observedAtUTC) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => ({
    ...row,
    oldestPendingAgeSeconds: nonnegativeCount(row.pendingCount) > 0
      ? recordedAgeSeconds(row.oldestPendingAtUTC, observedAtUTC) : null,
  })).sort((a, b) => {
    const aFailed = nonnegativeCount(a.failedCount) ?? 0;
    const bFailed = nonnegativeCount(b.failedCount) ?? 0;
    const aPending = nonnegativeCount(a.pendingCount) ?? 0;
    const bPending = nonnegativeCount(b.pendingCount) ?? 0;
    // First: failed records; second: oldest known waiting event;
    // third: pending with unknown age; fourth: processing; last: idle.
    const aTier = aFailed > 0 ? 0 : aPending > 0 ? 1
      : (nonnegativeCount(a.processingCount) ?? 0) > 0 ? 2 : 3;
    const bTier = bFailed > 0 ? 0 : bPending > 0 ? 1
      : (nonnegativeCount(b.processingCount) ?? 0) > 0 ? 2 : 3;
    if (aTier !== bTier) return aTier - bTier;
    if (aTier === 0 && aFailed !== bFailed) return bFailed - aFailed;
    if (aTier <= 1) {
      const aAge = a.oldestPendingAgeSeconds ?? -1;
      const bAge = b.oldestPendingAgeSeconds ?? -1;
      if (aAge !== bAge) return bAge - aAge;
    }
    return String(a.laneKey).localeCompare(String(b.laneKey));
  });
}
