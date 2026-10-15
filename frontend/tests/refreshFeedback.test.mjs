import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DATA_UPDATED_MESSAGE, DATA_UPDATING_MESSAGE,
  isRefreshCooldown,
  hasFreshPortfolioSnapshot,
} from '../src/refreshFeedback.js';

const results = (state = 'FRESH', lastErrorType = null) => [
  ...Array.from({ length: 4 }, () => ({ status: 'published' })),
  {
    totalDatasets: 6,
    datasets: Object.fromEntries(Array.from({length: 6}, (_, i) => [
      `dataset-${i}`, { state, lastErrorType },
    ])),
  },
];

test('refresh cooldown classification is exact; SQL and network failures remain errors', () => {
  assert.equal(isRefreshCooldown({status: 429, detail: 'shared_dashboard_refresh_rate_limited'}), true);
  assert.equal(isRefreshCooldown({status: 429, detail: 'sql_capacity_unavailable'}), false);
  assert.equal(isRefreshCooldown({status: 503, detail: 'shared_dashboard_refresh_rate_limited'}), false);
  assert.equal(isRefreshCooldown(null), false);
});

test('normal and limited manual refresh show only the simple user message after six fresh reads', () => {
  assert.equal(DATA_UPDATED_MESSAGE, 'Data is updated.');
  assert.equal(DATA_UPDATING_MESSAGE, 'Updating data…');
  assert.equal(hasFreshPortfolioSnapshot(results()), true);
});

test('a prior failed rebuild or stale data cannot be announced as updated', () => {
  assert.equal(hasFreshPortfolioSnapshot(results('STALE')), false);
  assert.equal(hasFreshPortfolioSnapshot(results('FRESH', 'TimeoutError')), false);
  assert.equal(hasFreshPortfolioSnapshot([]), false);
  const failed = results(); failed[2] = {status: 'failed'};
  assert.equal(hasFreshPortfolioSnapshot(failed), false);
  const missing = results(); delete missing[4].datasets['dataset-2'];
  assert.equal(hasFreshPortfolioSnapshot(missing), false);
});
