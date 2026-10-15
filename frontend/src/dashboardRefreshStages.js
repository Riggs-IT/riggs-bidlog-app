// After a manual rebuild, publish each dataset when *that run* completed it.
// Project summary, monthly billing, PM projection AND potential bids must
// finish rebuilding before updating the combined portfolio. Otherwise the
// header could temporarily mix new project projections with old bid values. The bridge enforces rate limits;
// this module never starts SQL reads or bypasses cache TTLs.
export const DASHBOARD_STAGES = [
  ['current', [
    'current_project_summary',
    'current_project_monthly_bulk',
    'current_project_primary_projection',
    'active_bid_dashboard',
  ]],
  ['bids', [
    'current_project_summary',
    'current_project_monthly_bulk',
    'current_project_primary_projection',
    'active_bid_dashboard',
  ]],
  ['portfolioBalance', ['portfolio_balance']],
  ['scheduleReview', ['schedule_review']],
];

export function createProgressiveDashboardReads(readers, refreshId) {
  if (!refreshId) throw new Error('Missing refresh identifier');
  const started = new Map();
  const options = {replace: true, passive: false};

  function startReady(status) {
    if (status?.refreshId !== refreshId) {
      throw new Error('Refresh status changed. Please try again.');
    }
    // Prior bridge release (without per-run progress metadata) remains
    // compatible: wait for COMPLETE/PARTIAL, then load once at finish.
    const succeeded = new Set(status.succeededDatasetKeys || []);
    for (const [stage, dependencies] of DASHBOARD_STAGES) {
      if (!started.has(stage) && dependencies.every(key => succeeded.has(key))) {
        started.set(stage, Promise.resolve().then(() => readers[stage](options)));
      }
    }
  }

  async function finish(status, getCacheStatus) {
    startReady(status);
    const loaded = await Promise.all(DASHBOARD_STAGES.map(([stage]) => (
      started.get(stage) || Promise.resolve().then(() => readers[stage](options))
    )));
    const cacheStatus = await getCacheStatus();
    return [...loaded, cacheStatus];
  }

  return {startReady, finish};
}
