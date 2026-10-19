// A portfolio-wide read is separate from employee notification recipients.
// Fail closed on invalid result shapes rather than displaying a false zero.
export function indexPortfolioRebalance(items) {
  if (!Array.isArray(items)) {
    throw new Error('Portfolio balance response was not a list.');
  }
  const index = new Map();
  for (const item of items) {
    const id = Number(item?.jobListId);
    const variance = item?.rebalanceVarianceAmount;
    if (!Number.isSafeInteger(id) || id <= 0
        || item?.needsRebalance !== true
        || variance === null || variance === undefined
        || !Number.isFinite(Number(variance)) || Number(variance) === 0
        || index.has(String(id))) {
      throw new Error('Portfolio balance response had invalid or duplicate rows.');
    }
    index.set(String(id), item);
  }
  return index;
}

// The Data API owns Pending Foundation classification. React only checks
// snapshot provenance and the original SQL needsRebalance financial flags.
// A Pending status is provisional billing timing, not proof of an invoice.
export const PENDING_FOUNDATION = 'PENDING_FOUNDATION';
export const NEEDS_REBALANCE = 'NEEDS_REBALANCE';

// Never certify an old lock-month result across the Arizona day-15 cutoff.
function mostRecentLockMonth(asOfUTC) {
  const d = new Date(asOfUTC);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const read = key => Number(parts.find(part => part.type === key)?.value);
  const year = read('year'), month = read('month'), day = read('day');
  if (!year || !month || !day) return null;
  const locked = new Date(Date.UTC(year, month - (day >= 15 ? 1 : 2), 1));
  return locked.toISOString().slice(0, 10);
}

export const SERVER_REVIEW_VALIDATION = Object.freeze({
  NOT_PROVIDED: 'NOT_PROVIDED',
  UNAVAILABLE: 'UNAVAILABLE',
  INVALID_CONTRACT: 'INVALID_CONTRACT',
  STALE_LOCK_MONTH: 'STALE_LOCK_MONTH',
  STALE_PROJECT: 'STALE_PROJECT',
  STALE_MONTH: 'STALE_MONTH',
  SNAPSHOT_UNAVAILABLE: 'SNAPSHOT_UNAVAILABLE',
  SNAPSHOT_MISMATCH: 'SNAPSHOT_MISMATCH',
  VERIFIED: 'VERIFIED',
});

// UUID equality proves primary-snapshot provenance, not an atomic SQL billing
// transaction. The server computes the classification; this code never does.
function snapshotId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

export function verifyServerReviewRow(attention, project, monthlyRows, asOfUTC, primarySnapshotId) {
  const V = SERVER_REVIEW_VALIDATION;
  const fields = ['reviewStatus', 'reviewLockMonth', 'reviewEvidenceState'];
  const present = fields.map(field => Object.hasOwn(attention || {}, field));
  if (present.every(value => !value)) return V.NOT_PROVIDED;
  if (!present.every(Boolean)) return V.INVALID_CONTRACT;

  const locked = mostRecentLockMonth(asOfUTC);
  if (typeof attention.reviewLockMonth !== 'string'
      || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(attention.reviewLockMonth)) {
    return V.INVALID_CONTRACT;
  }
  if (!locked || attention.reviewLockMonth !== locked) return V.STALE_LOCK_MONTH;

  const rawServerSnapshot = attention.reviewPrimarySnapshotId;
  if (rawServerSnapshot != null && !snapshotId(rawServerSnapshot)) return V.INVALID_CONTRACT;
  if (attention.reviewEvidenceState === 'UNAVAILABLE' && attention.reviewStatus === null) {
    return rawServerSnapshot == null ? V.UNAVAILABLE : V.INVALID_CONTRACT;
  }
  if (attention.reviewEvidenceState !== 'MATCHED_REFRESH'
      || ![PENDING_FOUNDATION, NEEDS_REBALANCE].includes(attention.reviewStatus)) {
    return V.INVALID_CONTRACT;
  }

  const serverId = snapshotId(rawServerSnapshot);
  const clientId = snapshotId(primarySnapshotId);
  if (!serverId || !clientId) return V.SNAPSHOT_UNAVAILABLE;
  if (serverId !== clientId) return V.SNAPSHOT_MISMATCH;

  const job = Number(attention.jobListId);
  const version = Number(attention.forecastVersionId);
  if (!Number.isSafeInteger(job) || job <= 0
      || !Number.isSafeInteger(version) || version <= 0
      || !project || Number(project.jobListId) !== job
      || project.jobNumber !== attention.jobNumber
      || project.hasPmForecast !== true || project.projectCompleted === true
      || Number(project.latestForecastVersionId) !== version
      || !Array.isArray(monthlyRows)) return V.STALE_PROJECT;

  const lockedRows = monthlyRows.filter(month => month?.monthStart === locked);
  if (lockedRows.length > 1 || lockedRows.some(month =>
    Number(month.latestForecastVersionId) !== version)) return V.STALE_MONTH;
  if (attention.reviewStatus === PENDING_FOUNDATION) {
    if (project.latestForecastVersionType === 'ADMIN_CORRECTION'
        || lockedRows.length !== 1
        || lockedRows[0].primaryProjectionSource !== 'PM_FORECAST'
        || lockedRows[0].hasPmForecast !== true
        || lockedRows[0].isEditable !== false
        || !['LOCKED_CURRENT', 'LOCKED_PAST'].includes(lockedRows[0].monthEditState)) {
      return V.STALE_MONTH;
    }
  }
  return V.VERIFIED;
}

export function balanceReviewLabel(item) {
  return item?.reviewStatus === PENDING_FOUNDATION ? 'Pending Foundation' : 'Needs Rebalance';
}
