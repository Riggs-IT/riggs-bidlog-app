import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createReviewCacheRecovery, recoverableReviewReason, reviewCacheReady,
} from '../src/reviewCacheRecovery.js';

const status = (name, primary = 'STALE', balance = 'STALE', id = 'r1') => ({
  status: name, refreshId: id, datasets: {
    current_project_primary_projection: {state: primary},
    portfolio_balance: {state: balance},
  },
});
const ready = (id = 'r1') => status('COMPLETE', 'FRESH', 'FRESH', id);
const active = () => true;
const immediate = async () => {};

test('only COMPLETE plus both FRESH datasets can recertify', () => {
  assert.equal(reviewCacheReady(status('RUNNING', 'FRESH', 'FRESH')), false);
  assert.equal(reviewCacheReady(status('COMPLETE', 'STALE', 'FRESH')), false);
  assert.equal(reviewCacheReady(status('PARTIAL', 'FRESH', 'FRESH')), false);
  assert.equal(reviewCacheReady(ready()), true);
});

test('only transient lineage/unavailable evidence starts recovery, never permanent row errors', () => {
  for (const reason of ['UNAVAILABLE', 'SNAPSHOT_MISMATCH', 'SNAPSHOT_UNAVAILABLE', 'MISSING_PRIMARY']) {
    assert.equal(recoverableReviewReason({state: 'UNAVAILABLE', reason}), true);
  }
  for (const reason of ['INVALID_CONTRACT', 'STALE_PROJECT', 'STALE_MONTH',
    'STALE_LOCK_MONTH', 'INVALID_REVIEW_RESPONSE', 'NO_REVIEW_ROWS', 'PARTIAL_REFRESH']) {
    assert.equal(recoverableReviewReason({state: 'UNAVAILABLE', reason}), false);
  }
  assert.equal(recoverableReviewReason({state: 'VERIFIED', reason: 'UNAVAILABLE'}), false);
});

test('cache RUNNING and both STALE: metadata-only poll then one normal paired recertification', async () => {
  let checks = 0, repairs = 0;
  const states = [status('RUNNING'), status('COMPLETE', 'FRESH', 'STALE'), ready()];
  const recovery = createReviewCacheRecovery({
    allowed: active, sleep: immediate,
    readStatus: async () => states[checks++],
    recertify: async () => {repairs++;},
  });
  assert.equal(await recovery.start(), 'RECERTIFICATION_ATTEMPTED');
  assert.equal(checks, 3);
  assert.equal(repairs, 1);
});

test('concurrent triggers share one bounded read-only watcher', async () => {
  let resolve, checks = 0, repairs = 0;
  const gate = new Promise(ok => {resolve = ok;});
  const recovery = createReviewCacheRecovery({
    allowed: active, sleep: () => gate,
    readStatus: async () => {checks++; return ready();},
    recertify: async () => {repairs++;},
  });
  const a = recovery.start(), b = recovery.start();
  assert.strictEqual(a, b);
  resolve();
  assert.equal(await a, 'RECERTIFICATION_ATTEMPTED');
  assert.equal(checks, 1);
  assert.equal(repairs, 1);
});

test('one attempted generation does not trigger repeated loops; a new generation may retry', async () => {
  let repairs = 0, id = 'first';
  const recovery = createReviewCacheRecovery({
    allowed: active, sleep: immediate,
    readStatus: async () => ready(id),
    recertify: async () => {repairs++;},
  });
  assert.equal(await recovery.start(), 'RECERTIFICATION_ATTEMPTED');
  assert.equal(await recovery.start(), 'ALREADY_ATTEMPTED');
  id = 'second';
  assert.equal(await recovery.start(), 'RECERTIFICATION_ATTEMPTED');
  assert.equal(repairs, 2);
});

test('PARTIAL/FAILED stops without pretending cache readiness', async () => {
  for (const outcome of ['PARTIAL', 'FAILED']) {
    let repairs = 0;
    const recovery = createReviewCacheRecovery({
      allowed: active, sleep: immediate,
      readStatus: async () => status(outcome, 'FRESH', 'FRESH'),
      recertify: async () => {repairs++;},
    });
    assert.equal(await recovery.start(), 'REFRESH_INCOMPLETE');
    assert.equal(repairs, 0);
  }
});

test('hidden tab or unmount cancels; late status response cannot recertify', async () => {
  let allow = true, resolve;
  const gate = new Promise(ok => {resolve = ok;});
  let repairs = 0;
  const recovery = createReviewCacheRecovery({
    allowed: () => allow, sleep: () => gate,
    readStatus: async () => ready(),
    recertify: async () => {repairs++;},
  });
  const task = recovery.start();
  allow = false;
  recovery.cancel();
  resolve();
  assert.equal(await task, 'CANCELLED');
  assert.equal(repairs, 0);
});

test('transient status errors cannot certify, and retry is bounded', async () => {
  let checks = 0, repairs = 0;
  const recovery = createReviewCacheRecovery({
    allowed: active, sleep: immediate, maxChecks: 3,
    readStatus: async () => {checks++; throw new Error('status down');},
    recertify: async () => {repairs++;},
  });
  assert.equal(await recovery.start(), 'TIMED_OUT');
  assert.equal(checks, 3);
  assert.equal(repairs, 0);
});

test('recertification failure cannot reclassify or automatically retry same generation', async () => {
  let calls = 0;
  const recovery = createReviewCacheRecovery({
    allowed: active, sleep: immediate,
    readStatus: async () => ready(),
    recertify: async () => {calls++; throw new Error('bad pair');},
  });
  assert.equal(await recovery.start(), 'RECERTIFICATION_FAILED');
  assert.equal(await recovery.start(), 'ALREADY_ATTEMPTED');
  assert.equal(calls, 1);
});

test('hook uses passive status GET and ordinary paired GET only, never forces SQL/fresh refresh', () => {
  const hook = readFileSync(new URL('../src/useProjectedBillingsFreshness.js', import.meta.url), 'utf8');
  assert.match(hook, /const recovery = createReviewCacheRecovery\(/);
  assert.match(hook, /readStatus: updateCacheStatus/);
  assert.match(hook, /recertify: \(\) => batch\(\{passive: true, maxAgeMs: 0, cacheRecoveryCheck: true\}\)/);
  assert.match(hook, /recoverableReviewReason\(verdict\)/);
  assert.match(hook, /reads\.recovery\.cancel\(\)/);
  assert.doesNotMatch(hook, /recertify:[^\n]+fresh: true/);
});

test('real review-pair gate stays closed during RUNNING and opens after COMPLETE paired GET', async () => {
  const {createReviewPairCoordinator, REVIEW_PAIR_STATE} = await import('../src/reviewPairCoordinator.js');
  const {createLatestRead} = await import('../src/browserFreshness.js');
  const snapshot = '8e3faacf-2bc3-4ee7-9d62-b0957ab1c772';
  const current = {primarySnapshotId: snapshot,
    projects: [{jobListId: 531, jobNumber: '26587', hasPmForecast: true,
      projectCompleted: false, latestForecastVersionId: 201,
      latestForecastVersionType: 'PM_SUBMISSION'}],
    monthly: {items: [{jobListId: 531, items: [{monthStart: '2026-10-01',
      primaryProjectionSource: 'PM_FORECAST', hasPmForecast: true,
      latestForecastVersionId: 201, isEditable: false,
      monthEditState: 'LOCKED_CURRENT'}]}]},
  };
  const balance = {jobListId: 531, jobNumber: '26587', needsRebalance: true,
    rebalanceVarianceAmount: -100, forecastVersionId: 201,
    reviewLockMonth: '2026-10-01'};
  let serverReady = false, pairReads = 0, accepted = null;
  const coordinator = createReviewPairCoordinator({
    now: () => '2026-10-21T16:30:50.000Z',
    onChange: (evidence, pair) => {
      if (evidence.state !== REVIEW_PAIR_STATE.WAITING) accepted = pair;
    },
  });
  const primary = createLatestRead({
    read: async () => current,
    publish: (value, config) => coordinator.offerCurrent(config.reviewEpoch, value),
  });
  const statusRows = createLatestRead({
    read: async () => [{...balance, reviewStatus: serverReady ? 'PENDING_FOUNDATION' : null,
      reviewEvidenceState: serverReady ? 'MATCHED_REFRESH' : 'UNAVAILABLE',
      reviewPrimarySnapshotId: serverReady ? snapshot : null}],
    publish: (value, config) => coordinator.offerBalance(config.reviewEpoch, value),
  });
  const pairedGet = async () => {
    pairReads++;
    const epoch = coordinator.begin();
    const [a,b] = await Promise.all([
      primary.load({reviewEpoch: epoch}), statusRows.load({reviewEpoch: epoch}),
    ]);
    coordinator.finish(epoch, {successful: a.status === 'published' && b.status === 'published'});
  };
  await pairedGet();
  assert.equal(coordinator.evidence.state, REVIEW_PAIR_STATE.UNAVAILABLE);
  assert.equal(coordinator.evidence.reason, 'UNAVAILABLE');
  assert.equal(accepted, null);
  let checks = 0;
  const recovery = createReviewCacheRecovery({
    allowed: active, sleep: immediate,
    readStatus: async () => {
      if (++checks === 2) serverReady = true;
      return serverReady ? ready() : status('RUNNING');
    },
    recertify: pairedGet,
  });
  assert.equal(await recovery.start(), 'RECERTIFICATION_ATTEMPTED');
  assert.equal(pairReads, 2);
  assert.equal(coordinator.evidence.state, REVIEW_PAIR_STATE.VERIFIED);
  assert.equal(accepted.balance[0].reviewStatus, 'PENDING_FOUNDATION');
  assert.equal(accepted.primarySnapshotId, snapshot);
});
