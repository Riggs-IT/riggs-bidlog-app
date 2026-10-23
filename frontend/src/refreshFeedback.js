// UI-facing refresh outcomes; no cache timings or implementation terms.
export const DATA_UPDATED_MESSAGE = 'Data is updated.';
export const DATA_UPDATING_MESSAGE = 'Updating data…';
export const DATA_REFRESH_FAILED_MESSAGE = 'Refresh failed. Previous data is still shown.';

// Soft-stale snapshots are normal while the bridge performs a singleflight
// rebuild. Show an operational warning only for failed/invalid cache state.
export function hasCacheReadProblem(status) {
  if (!status || typeof status !== 'object') return false;
  if (status.status === 'FAILED' || status.status === 'PARTIAL') return true;
  if (!status.datasets || typeof status.datasets !== 'object') return false;
  // Missing/stale datasets while an ordinary rebuild is RUNNING are not
  // evidence of an outage. A warning is appropriate only for genuine errors.
  if (status.status === 'RUNNING') return false;
  return Object.values(status.datasets).some(item =>
    Boolean(item?.lastErrorType)
    || (status.status === 'COMPLETE'
      && (!item || item.state === 'MISSING' || item.state === 'EXPIRED')));
}

export function isRefreshCooldown(error) {
  return error?.status === 429
    && error?.detail === 'shared_dashboard_refresh_rate_limited';
}

// A throttled request may follow an unsuccessful rebuild. Only say the data
// was updated when the screen reads succeeded and the bridge confirms that
// every portfolio snapshot is fresh and error-free.
export function hasFreshPortfolioSnapshot(results) {
  if (!Array.isArray(results) || results.length < 5) return false;
  if (!results.slice(0, 4).every(result => result?.status === 'published')) return false;

  const status = results[4];
  const datasets = Object.values(status?.datasets || {});
  return status?.totalDatasets === 6
    && datasets.length === 6
    && datasets.every(item => item?.state === 'FRESH' && !item?.lastErrorType);
}
