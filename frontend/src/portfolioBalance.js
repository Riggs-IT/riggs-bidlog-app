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

export function indexedBalanceReviews(rows, projects, monthsByProject, asOfUTC) {
  const index = indexPortfolioRebalance(rows);
  const projectsById = new Map((projects || []).map(project => [String(project.jobListId), project]));
  for (const [key, item] of index) {
    const status = balanceReviewStatus(
      item, projectsById.get(key), monthsByProject?.get(Number(key)), asOfUTC,
    );
    index.set(key, { ...item, reviewStatus: status });
  }
  return index;
}

export function balanceReviewLabel(item) {
  return item?.reviewStatus === PENDING_FOUNDATION ? 'Pending Foundation' : 'Needs Rebalance';
}
