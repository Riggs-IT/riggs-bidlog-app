import test from 'node:test';
import assert from 'node:assert/strict';
import {createProgressiveDashboardReads, DASHBOARD_STAGES} from '../src/dashboardRefreshStages.js';

const RUN = 'test-manual-refresh';
const complete = (succeededDatasetKeys, status = 'RUNNING') => ({
  refreshId: RUN, succeededDatasetKeys, status,
});

function readers() {
  const calls = {current: 0, bids: 0, portfolioBalance: 0, scheduleReview: 0};
  const handlers = Object.fromEntries(Object.keys(calls).map(name => [
    name, ({replace, passive}) => {
      assert.equal(replace, true);
      assert.equal(passive, false);
      calls[name]++;
      return Promise.resolve({status: 'published', name});
    },
  ]));
  return {calls, handlers};
}

test('main portfolio waits for ALL four financial datasets; review stages load independently', async () => {
  const {calls, handlers} = readers();
  const p = createProgressiveDashboardReads(handlers, RUN);
  const [current, bids, balance, schedule] = DASHBOARD_STAGES.map(([, deps]) => deps);
  p.startReady(complete([current[0], current[1]]));
  await Promise.resolve();
  assert.equal(calls.current, 0, 'partial financial group must never publish');
  p.startReady(complete(current.filter(key => key !== 'active_bid_dashboard')));
  await Promise.resolve();
  assert.equal(calls.current, 0);
  assert.equal(calls.bids, 0);
  p.startReady(complete([...current, ...bids]));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.current, 1);
  assert.equal(calls.bids, 1);
  assert.equal(calls.portfolioBalance, 0);
  p.startReady(complete([...current, ...bids, ...balance]));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.portfolioBalance, 1);
  p.startReady(complete([...current, ...bids, ...balance, ...schedule], 'COMPLETE'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls.scheduleReview, 1);
  const result = await p.finish(complete([...current,...bids,...balance,...schedule], 'COMPLETE'), async () => ({totalDatasets: 6}));
  assert.equal(result.length, 5);
  assert.deepEqual(calls, {current: 1, bids: 1, portfolioBalance: 1, scheduleReview: 1});
});

test('a bad response or stale run ID cannot be used to publish current financials', async () => {
  const {calls, handlers} = readers();
  const p = createProgressiveDashboardReads(handlers, RUN);
  assert.throws(() => p.startReady({refreshId: 'wrong', succeededDatasetKeys: []}), /status changed/);
  const all = DASHBOARD_STAGES.flatMap(([, keys]) => keys);
  p.startReady(complete(all.filter(key => key !== 'current_project_monthly_bulk'), 'PARTIAL'));
  await Promise.resolve();
  assert.equal(calls.current, 0);
});

test('fallback for a previous bridge release reads exactly once, after completion', async () => {
  const {calls, handlers} = readers();
  const p = createProgressiveDashboardReads(handlers, RUN);
  p.startReady({refreshId: RUN, status: 'RUNNING'});
  await Promise.resolve();
  assert.equal(Object.values(calls).reduce((a,b) => a+b,0), 0);
  const result = await p.finish({refreshId: RUN, status: 'COMPLETE'}, async () => ({datasets:{}}));
  assert.equal(result.length, 5);
  assert.deepEqual(calls, {current: 1, bids: 1, portfolioBalance: 1, scheduleReview: 1});
});

test('real read failure stays a failed result and never reports a synthetic success', async () => {
  const {handlers} = readers();
  handlers.bids = async () => ({status: 'failed', error: 'network'});
  const p = createProgressiveDashboardReads(handlers, RUN);
  const all = DASHBOARD_STAGES.flatMap(([, keys]) => keys);
  p.startReady(complete(all, 'COMPLETE'));
  const result = await p.finish(complete(all, 'COMPLETE'), async () => ({datasets:{}}));
  assert.equal(result[1].status, 'failed');
});
