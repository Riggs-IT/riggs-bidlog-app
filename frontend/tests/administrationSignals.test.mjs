import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeAdministration} from '../src/administrationSignals.mjs';

const base = () => ({
  readOnly: true,
  services: {
    bidLog: {state: 'AVAILABLE'}, dataApi: {state: 'AVAILABLE'},
    sql: {state: 'CONNECTED'},
  },
  cache: {
    availability: 'AVAILABLE',
    refresh: {status: 'COMPLETE', failedDatasetKeys: []},
    policy: {maxStaleSeconds: 600},
    datasets: [{key: 'schedule_review', state: 'FRESH', ageSeconds: 0,
      updatedAtUTC: '2026-10-23T14:00:00Z', errorType: null}],
  },
  monitoring: {
    availability: 'AVAILABLE',
    usage: {eligibleForCloseout: 0},
    queues: [{laneKey: 'job_cognito', pendingCount: 0,
      processingCount: 0, failedCount: 0, processHealth: 'NOT_COLLECTED'}],
    reconciliation: {enabled: true, lastRunAtUTC: null},
  },
});

test('real zero, recent soft stale, processing and normal pending are not incidents', () => {
  const value = base();
  value.cache.datasets[0].state = 'STALE';
  value.cache.datasets[0].ageSeconds = 180; // Soft TTL exceeded, hard limit has not.
  value.monitoring.queues[0].pendingCount = 2;
  value.monitoring.queues[0].processingCount = 1;
  assert.deepEqual(summarizeAdministration(value), {issues: [], unknown: []});
});

test('missing and expired cache, failed/partial refresh and over-limit staleness are surfaced once', () => {
  const value = base();
  value.cache.refresh = {status: 'PARTIAL', failedDatasetKeys: ['schedule_review']};
  value.cache.datasets = [
    {key: 'schedule_review', state: 'MISSING', ageSeconds: null},
    {key: 'portfolio_balance', state: 'EXPIRED', ageSeconds: 700},
    {key: 'active_bid_dashboard', state: 'STALE', ageSeconds: 601},
    {key: 'current_project_summary', state: 'STALE', ageSeconds: 5, errorType: 'TimeoutError'},
  ];
  assert.deepEqual(summarizeAdministration(value).issues.map(entry => entry.id), [
    'cache-rebuild', 'dataset-schedule_review', 'dataset-portfolio_balance',
    'dataset-active_bid_dashboard', 'dataset-current_project_summary',
  ]);
  assert.equal(summarizeAdministration(value).issues.filter(x => x.id === 'dataset-active_bid_dashboard').length, 1);
});

test('only actual failed queue records, not worker liveness, generate an issue', () => {
  const value = base();
  value.monitoring.queues[0].failedCount = 4;
  assert.match(summarizeAdministration(value).issues[0].description, /4 records currently have FAILED status/);
  assert.doesNotMatch(summarizeAdministration(value).issues[0].description, /worker stopped|worker down/i);
});

test('closeout is a finding only with positive eligible count and explicitly disabled scheduler', () => {
  const value = base();
  value.monitoring.usage.eligibleForCloseout = 202;
  value.monitoring.reconciliation.enabled = false;
  assert.equal(summarizeAdministration(value).issues[0].id, 'session-closeout');
  value.monitoring.reconciliation.enabled = true;
  assert.deepEqual(summarizeAdministration(value).issues, []);
});

test('unavailable data is not interpreted as zero or proof SQL is down', () => {
  const value = base();
  value.services.dataApi.state = 'UNAVAILABLE';
  value.services.sql.state = 'UNVERIFIED';
  value.cache = {availability: 'UNAVAILABLE'};
  value.monitoring = {availability: 'UNAVAILABLE'};
  const result = summarizeAdministration(value);
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0].title, /Data API readiness failed/);
  assert.deepEqual(result.unknown, [
    'SQL readiness not verified', 'Shared dashboard cache status unavailable',
    'SQL queue and Bid Log session aggregates unavailable',
  ]);
  assert.doesNotMatch(JSON.stringify(result), /SQL server is down/i);
});

test('new presentation remains read-only with original passive and owner-protected transport', () => {
  const dashboard = readFileSync(new URL('../src/AdministrationDashboard.jsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../../backend/app/main.py', import.meta.url), 'utf8');
  assert.match(dashboard, /<AdministrationAttention overview=\{overview\}\/>/);
  assert.match(dashboard, /X-Riggs-Passive-Read/);
  assert.match(dashboard, /document.visibilityState !== 'visible'/);
  assert.match(dashboard, /setInterval\(refreshVisible, 60_000\)/);
  assert.match(dashboard, /id="administration-queues"/);
  assert.match(dashboard, /id="administration-cache"/);
  assert.match(main, /Depends\(require_administration_owner\)/);
  assert.doesNotMatch(dashboard, /method:\s*'POST'|\/api\/admin\/restart|dashboard-cache\/refresh/);
});
