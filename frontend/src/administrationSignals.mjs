/**
 * Presentation-only interpretation of the existing owner-authorized overview.
 * No additional reads, invented worker-health state, or polling side effects.
 */
export const DATASET_LABELS = Object.freeze({
  current_project_summary: 'Current projects · summary',
  current_project_monthly_bulk: 'Current projects · monthly',
  current_project_primary_projection: 'Primary PM projection',
  active_bid_dashboard: 'Active bids',
  portfolio_balance: 'Portfolio review',
  schedule_review: 'Schedule review',
});

export const QUEUE_LABELS = Object.freeze({
  accounting_tickets: 'Accounting · SharePoint tickets',
  cognito_staffing: 'Cognito · staffing',
  job_cognito: 'Cognito · job updates',
  job_sharepoint: 'SharePoint · job updates',
  ordering_center: 'SharePoint · ordering center',
  project_forecast: 'Project forecast',
});

const wholeCount = value => Number.isSafeInteger(value) && value >= 0;
const validAge = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const formatCount = value => value.toLocaleString();
const issue = (id, title, description, target) => ({id, title, description, target});

export function summarizeAdministration(overview) {
  const issues = [];
  const unknown = [];
  const services = overview?.services || {};
  const cache = overview?.cache || {};
  const monitoring = overview?.monitoring || {};

  if (services.dataApi?.state === 'UNAVAILABLE') {
    issues.push(issue('data-api', 'Data API readiness failed',
      'The bridge readiness check did not succeed. SQL status cannot be inferred from this result.',
      'administration-system-health'));
  } else if (services.dataApi?.state !== 'AVAILABLE') {
    unknown.push('Data API readiness not verified');
  }
  if (services.sql?.state !== 'CONNECTED') {
    unknown.push('SQL readiness not verified');
  }

  if (cache.availability !== 'AVAILABLE') {
    unknown.push('Shared dashboard cache status unavailable');
  } else {
    const refresh = cache.refresh || {};
    if (refresh.status === 'FAILED' || refresh.status === 'PARTIAL') {
      const failed = Array.isArray(refresh.failedDatasetKeys) ? refresh.failedDatasetKeys.length : null;
      issues.push(issue('cache-rebuild',
        refresh.status === 'FAILED' ? 'Latest cache rebuild failed' : 'Latest cache rebuild was partial',
        `${failed === null ? 'The dataset failure count is unavailable' : `${formatCount(failed)} datasets reported as failed`}. Inspect the last run and dataset states below.`,
        'administration-cache'));
    }
    const maxAge = cache.policy?.maxStaleSeconds;
    for (const dataset of Array.isArray(cache.datasets) ? cache.datasets : []) {
      const label = DATASET_LABELS[dataset.key] || dataset.key;
      if (typeof label !== 'string' || !label) continue;
      const state = dataset.state;
      const beyondLimit = state === 'STALE' && validAge(dataset.ageSeconds)
        && validAge(maxAge) && dataset.ageSeconds > maxAge;
      if (state !== 'EXPIRED' && state !== 'MISSING' && !beyondLimit
          && !(state === 'STALE' && dataset.errorType)) continue;
      const reason = state === 'MISSING'
        ? 'No current snapshot was reported.'
        : state === 'EXPIRED' ? 'The cache marked this snapshot expired.'
          : beyondLimit ? 'This snapshot exceeds the reported hard-stale policy.'
            : 'The stale snapshot also has a recorded error type.';
      const detail = dataset.errorType ? ` Last error type: ${dataset.errorType}.` : '';
      issues.push(issue(`dataset-${dataset.key}`, `${label}: cache needs review`,
        `${reason}${detail}`, 'administration-cache'));
    }
  }

  if (monitoring.availability !== 'AVAILABLE') {
    unknown.push('SQL queue and Bid Log session aggregates unavailable');
  } else {
    for (const lane of Array.isArray(monitoring.queues) ? monitoring.queues : []) {
      // A positive FAILED count is real queue evidence, but not necessarily new.
      if (!wholeCount(lane.failedCount) || lane.failedCount === 0) continue;
      issues.push(issue(`queue-${lane.laneKey}`,
        `${QUEUE_LABELS[lane.laneKey] || lane.laneKey}: failed records`,
        `${formatCount(lane.failedCount)} records currently have FAILED status. This is not a worker-liveness check or an event trend.`,
        'administration-queues'));
    }
    const eligible = monitoring.usage?.eligibleForCloseout;
    if (wholeCount(eligible) && eligible > 0 && monitoring.reconciliation?.enabled === false) {
      issues.push(issue('session-closeout', 'Session closeout is disabled',
        `${formatCount(eligible)} Bid Log session records are eligible for closeout; the automatic reconciler is disabled. These records are not proof of live users.`,
        'administration-usage-closeout'));
    }
  }

  return {issues, unknown};
}
