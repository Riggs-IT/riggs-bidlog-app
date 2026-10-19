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

// Presentation-only distinction. SQL still owns NeedsRebalance and its amount.
// This is an inferred recent lock/billing timing state, NOT proof that a
// Foundation invoice is scheduled or that accounting has closed the month.
export const PENDING_FOUNDATION = 'PENDING_FOUNDATION';
export const NEEDS_REBALANCE = 'NEEDS_REBALANCE';

function cents(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && Number.isSafeInteger(Math.round(n * 100))
    ? Math.round(n * 100) : null;
}

// The month locked at the last day-15 boundary is eligible until the next
// day-15 boundary. At that point an unresolved gap goes back to Rebalance.
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

export function balanceReviewStatus(attention, project, monthlyRows, asOfUTC) {
  if (!attention?.needsRebalance) return null;
  const fallback = NEEDS_REBALANCE;
  if (!project || project.projectCompleted || project.hasPmForecast !== true
      || project.latestForecastVersionType === 'ADMIN_CORRECTION'
      || Number(attention.forecastVersionId) !== Number(project.latestForecastVersionId)
      || !Array.isArray(monthlyRows)) return fallback;

  const lockedMonth = mostRecentLockMonth(asOfUTC);
  const month = monthlyRows.find(row => row.monthStart === lockedMonth);
  if (!month || Number(month.latestForecastVersionId) !== Number(attention.forecastVersionId)
      || month.primaryProjectionSource !== 'PM_FORECAST'
      || month.hasPmForecast !== true || month.isEditable !== false
      || !['LOCKED_CURRENT', 'LOCKED_PAST'].includes(month.monthEditState)
      || month.pmForecastAmount === null || month.pmForecastAmount === undefined
      || !Object.hasOwn(month, 'foundationActualAmount')) return fallback;

  const pm = cents(month.pmForecastAmount);
  const actual = month.foundationActualAmount === null ? 0 : cents(month.foundationActualAmount);
  const gap = cents(attention.rebalanceVarianceAmount);
  // A pre-existing or unrelated imbalance must never be hidden as 'Pending'.
  // Only the shortfall of this ONE recently locked month can qualify.
  if (pm === null || pm <= 0 || actual === null || actual < 0 || actual >= pm
      || gap === null || gap >= 0 || Math.abs(gap - (actual - pm)) > 1) return fallback;
  return PENDING_FOUNDATION;
}

// Stage 3G1 is SHADOW observation only. Do not use this audit state to
// change a visible badge or to infer that Foundation has posted an invoice.
// The bridge may return no review fields (prior release), or an intentionally
// unknown classification from an unpaired/fresh cache read. Preserve both.
export const SERVER_REVIEW_AUDIT = Object.freeze({
  NOT_PROVIDED: 'NOT_PROVIDED',
  UNAVAILABLE: 'UNAVAILABLE',
  INVALID_CONTRACT: 'INVALID_CONTRACT',
  STALE_LOCK_MONTH: 'STALE_LOCK_MONTH',
  STALE_PROJECT: 'STALE_PROJECT',
  STALE_MONTH: 'STALE_MONTH',
  DISAGREEMENT: 'DISAGREEMENT',
  CONTENT_PARITY_ONLY: 'CONTENT_PARITY_ONLY',
  SNAPSHOT_UNAVAILABLE: 'SNAPSHOT_UNAVAILABLE',
  SNAPSHOT_MISMATCH: 'SNAPSHOT_MISMATCH',
  SNAPSHOT_PARITY: 'SNAPSHOT_PARITY',
});

// Snapshot IDs are non-secret, server-generated UUIDs. Require complete,
// canonical UUIDs and compare their normalized values; never treat an absent
// ID or a matching PM version alone as proof of shared cache provenance.
function snapshotId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

export function auditServerReview(attention, project, monthlyRows, asOfUTC, derivedStatus, primarySnapshotId = null) {
  const fields = ['reviewStatus', 'reviewLockMonth', 'reviewEvidenceState'];
  const has = fields.map(field => Object.hasOwn(attention || {}, field));
  if (has.every(value => !value)) return SERVER_REVIEW_AUDIT.NOT_PROVIDED;
  if (!has.every(Boolean)) return SERVER_REVIEW_AUDIT.INVALID_CONTRACT;
  const locked = mostRecentLockMonth(asOfUTC);
  if (typeof attention.reviewLockMonth !== 'string'
      || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(attention.reviewLockMonth)) {
    return SERVER_REVIEW_AUDIT.INVALID_CONTRACT;
  }
  if (!locked || attention.reviewLockMonth !== locked) {
    return SERVER_REVIEW_AUDIT.STALE_LOCK_MONTH;
  }
  const serverSnapshot = attention.reviewPrimarySnapshotId;
  if (serverSnapshot !== undefined && serverSnapshot !== null && !snapshotId(serverSnapshot)) {
    return SERVER_REVIEW_AUDIT.INVALID_CONTRACT;
  }
  if (attention.reviewEvidenceState === 'UNAVAILABLE' && attention.reviewStatus === null) {
    // A server may not attach a trusted snapshot ID to unknown evidence.
    return serverSnapshot == null ? SERVER_REVIEW_AUDIT.UNAVAILABLE
      : SERVER_REVIEW_AUDIT.INVALID_CONTRACT;
  }
  if (attention.reviewEvidenceState !== 'MATCHED_REFRESH'
      || ![PENDING_FOUNDATION, NEEDS_REBALANCE].includes(attention.reviewStatus)) {
    return SERVER_REVIEW_AUDIT.INVALID_CONTRACT;
  }
  // A partially rolled-out bridge/client can establish content parity, but
  // only two valid, identical IDs establish same-primary-response provenance.
  // Independent fresh reads intentionally produce unavailable/mismatched IDs.
  const serverId = snapshotId(serverSnapshot);
  const clientId = snapshotId(primarySnapshotId);
  const hasSnapshotPair = Boolean(serverId && clientId);
  if ((serverSnapshot != null || primarySnapshotId != null) && !hasSnapshotPair) {
    return SERVER_REVIEW_AUDIT.SNAPSHOT_UNAVAILABLE;
  }
  if (hasSnapshotPair && serverId !== clientId) {
    return SERVER_REVIEW_AUDIT.SNAPSHOT_MISMATCH;
  }
  const job = Number(attention.jobListId);
  const version = Number(attention.forecastVersionId);
  if (!Number.isSafeInteger(job) || job <= 0
      || !Number.isSafeInteger(version) || version <= 0
      || !project || Number(project.jobListId) !== job
      || project.jobNumber !== attention.jobNumber
      || project.hasPmForecast !== true || project.projectCompleted === true
      || Number(project.latestForecastVersionId) !== version
      || !Array.isArray(monthlyRows)) {
    return SERVER_REVIEW_AUDIT.STALE_PROJECT;
  }
  const lockedRows = monthlyRows.filter(month => month?.monthStart === locked);
  if (lockedRows.length > 1 || lockedRows.some(month =>
    Number(month.latestForecastVersionId) !== version)) {
    return SERVER_REVIEW_AUDIT.STALE_MONTH;
  }
  if (attention.reviewStatus === PENDING_FOUNDATION
      && (lockedRows.length !== 1 || lockedRows[0].primaryProjectionSource !== 'PM_FORECAST'
        || lockedRows[0].hasPmForecast !== true)) {
    return SERVER_REVIEW_AUDIT.STALE_MONTH;
  }
  return attention.reviewStatus === derivedStatus
    ? (hasSnapshotPair ? SERVER_REVIEW_AUDIT.SNAPSHOT_PARITY : SERVER_REVIEW_AUDIT.CONTENT_PARITY_ONLY)
    : SERVER_REVIEW_AUDIT.DISAGREEMENT;
}

export function indexedBalanceReviews(rows, projects, monthsByProject, asOfUTC, primarySnapshotId = null) {
  const index = indexPortfolioRebalance(rows);
  const projectsById = new Map((projects || []).map(project => [String(project.jobListId), project]));
  for (const [key, item] of index) {
    const status = balanceReviewStatus(
      item, projectsById.get(key), monthsByProject?.get(Number(key)), asOfUTC,
    );
    const audit = auditServerReview(
      item, projectsById.get(key), monthsByProject?.get(Number(key)), asOfUTC, status,
      primarySnapshotId,
    );
    // The existing React status remains the ONLY visible status in 3G1.
    // This property is diagnostic provenance, not a second financial result.
    index.set(key, { ...item, reviewStatus: status, reviewEvidenceAudit: audit });
  }
  return index;
}

export function balanceReviewLabel(item) {
  return item?.reviewStatus === PENDING_FOUNDATION ? 'Pending Foundation' : 'Needs Rebalance';
}
