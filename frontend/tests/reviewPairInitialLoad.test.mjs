import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLatestRead, watchVisibleReads} from '../src/browserFreshness.js';
import {
  coalesceReviewBatches,
  createReviewPairCoordinator,
  REVIEW_PAIR_STATE,
} from '../src/reviewPairCoordinator.js';
import {acceptedServerReviewIndex} from '../src/acceptedReviewPair.js';

const NOW = '2026-10-19T17:00:00.000Z';
const SNAPSHOT = '8e3faacf-2bc3-4ee7-9d62-b0957ab1c772';
function example() {
  const current = {
    primarySnapshotId: SNAPSHOT,
    projects: [{jobListId: 531, jobNumber: '26587', hasPmForecast: true,
      projectCompleted: false, latestForecastVersionId: 201,
      latestForecastVersionType: 'PM_SUBMISSION'}],
    monthly: {items: [{jobListId: 531, items: [{
      monthStart: '2026-10-01', hasPmForecast: true,
      latestForecastVersionId: 201, primaryProjectionSource: 'PM_FORECAST',
      monthEditState: 'LOCKED_CURRENT', isEditable: false,
      pmForecastAmount: 2840349, foundationActualAmount: null,
    }]}]},
  };
  const balance = [{jobListId: 531, jobNumber: '26587', needsRebalance: true,
    rebalanceVarianceAmount: -2840349, forecastVersionId: 201,
    reviewStatus: 'PENDING_FOUNDATION', reviewLockMonth: '2026-10-01',
    reviewEvidenceState: 'MATCHED_REFRESH', reviewPrimarySnapshotId: SNAPSHOT}];
  return {current, balance};
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}

function fakeBrowser() {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = 'visible';
  windowTarget.setInterval = () => 1;
  windowTarget.clearInterval = () => {};
  return {windowTarget, documentTarget};
}

test('first mount and immediate visibility check share ONE review epoch and certify initial Pending', async () => {
  const {current, balance} = example();
  const pendingCurrent = deferred();
  const pendingBalance = deferred();
  const observed = {epochs: 0, currentReads: 0, balanceReads: 0, accepted: null};
  const gate = createReviewPairCoordinator({now: () => NOW,
    onChange: (evidence, pair) => {
      if (evidence.state !== REVIEW_PAIR_STATE.WAITING) observed.accepted = pair;
    },
  });
  const primaryReader = createLatestRead({
    read: () => {observed.currentReads++; return pendingCurrent.promise;},
    publish: (value, config) => gate.offerCurrent(config.reviewEpoch, value),
  });
  const balanceReader = createLatestRead({
    read: () => {observed.balanceReads++; return pendingBalance.promise;},
    publish: (value, config) => gate.offerBalance(config.reviewEpoch, value),
  });
  const run = async config => {
    observed.epochs++;
    const epoch = gate.begin('BATCH');
    const cohort = {...config, reviewEpoch: epoch};
    const [one, two] = await Promise.all([
      primaryReader.load(cohort), balanceReader.load(cohort),
    ]);
    gate.finish(epoch, {successful: one.status === 'published' && two.status === 'published'});
    return [one, two];
  };
  const batch = coalesceReviewBatches(run);
  // Matches real React effects: initial load and watchVisibleReads()'s
  // synchronous first check, before either HTTP request has finished.
  const initial = batch({passive: true});
  const browser = fakeBrowser();
  const stop = watchVisibleReads(batch, browser);
  const duplicate = batch({passive: true, maxAgeMs: 30_000});
  assert.strictEqual(initial, duplicate);
  await Promise.resolve();
  pendingCurrent.resolve(current);
  pendingBalance.resolve(balance);
  await initial;
  assert.equal(observed.epochs, 1);
  assert.equal(observed.currentReads, 1);
  assert.equal(observed.balanceReads, 1);
  assert.equal(gate.evidence.state, REVIEW_PAIR_STATE.VERIFIED);
  assert.strictEqual(observed.accepted?.current, current);
  assert.strictEqual(observed.accepted?.balance, balance);
  const visible = {currentProjects: current.projects, portfolioBalance: balance,
    currentMonthly: new Map(current.monthly.items.map(row => [row.jobListId, row.items])),
    primarySnapshotId: SNAPSHOT};
  assert.equal(acceptedServerReviewIndex(observed.accepted, visible, NOW)
    ?.get('531')?.reviewStatus, 'PENDING_FOUNDATION');
  stop();
});

test('without batch coalescing, overlapping initial and watcher tokens lose certification', async () => {
  const gate = createReviewPairCoordinator({now: () => NOW});
  const {current, balance} = example();
  const c = createLatestRead({read: async () => current,
    publish: (data, options) => gate.offerCurrent(options.reviewEpoch, data)});
  const b = createLatestRead({read: async () => balance,
    publish: (data, options) => gate.offerBalance(options.reviewEpoch, data)});
  const uncoordinated = async () => {
    const epoch = gate.begin();
    const [one, two] = await Promise.all([
      c.load({reviewEpoch: epoch}), b.load({reviewEpoch: epoch}),
    ]);
    return gate.finish(epoch,
      {successful: one.status === 'published' && two.status === 'published'});
  };
  await Promise.all([uncoordinated(), uncoordinated()]);
  assert.equal(gate.evidence.state, REVIEW_PAIR_STATE.UNAVAILABLE);
  assert.equal(gate.evidence.reason, 'PARTIAL_REFRESH');
});

test('an explicit replace does NOT attach to an earlier batch, and an old settle cannot clear new flight', async () => {
  const old = deferred();
  const replacement = deferred();
  let calls = 0;
  const batch = coalesceReviewBatches(() => {
    calls++;
    return calls === 1 ? old.promise : replacement.promise;
  });
  const first = batch({passive: true});
  await Promise.resolve();
  const second = batch({replace: true, passive: false});
  await Promise.resolve();
  assert.notStrictEqual(first, second);
  old.resolve('old');
  assert.equal(await first, 'old');
  assert.strictEqual(batch({passive: true}), second,
    'completed old batch must not clear newer active batch');
  replacement.resolve('new');
  assert.equal(await second, 'new');
  assert.equal(calls, 2);
  await Promise.resolve();
  assert.equal(await batch({passive: true}), 'new');
  assert.equal(calls, 3);
});

test('screen cleanup forgets old in-flight batch before remount', async () => {
  const old = deferred();
  const newer = deferred();
  let count = 0;
  const batch = coalesceReviewBatches(() => ++count === 1 ? old.promise : newer.promise);
  const first = batch({passive: true});
  await Promise.resolve();
  batch.reset();  // Same lifecycle as useEffect cleanup after canceling reads.
  const second = batch({passive: true});
  await Promise.resolve();
  assert.notStrictEqual(first, second);
  old.resolve('stale');
  assert.equal(await first, 'stale');
  assert.strictEqual(batch({passive: true}), second);
  newer.resolve('current');
  assert.equal(await second, 'current');
});

test('failed batch rejects all joiners and next attempt can retry', async () => {
  let calls = 0;
  const batch = coalesceReviewBatches(async () => {
    if (++calls === 1) throw new Error('read failed');
    return 'recovered';
  });
  const a = batch({passive: true});
  const b = batch({passive: true});
  assert.strictEqual(a, b);
  await assert.rejects(a, /read failed/);
  assert.equal(await batch({passive: true}), 'recovered');
  assert.equal(calls, 2);
});

test('hook uses a single-flight financial batch; no new SQL calls or weakened review validation', () => {
  const hook = readFileSync(new URL('../src/useProjectedBillingsFreshness.js', import.meta.url), 'utf8');
  assert.match(hook, /const batch = coalesceReviewBatches\(async config => \{/);
  assert.match(hook, /reviewPair\.finish\(reviewEpoch, \{successful: pairedSuccess\}\)/);
  assert.match(hook, /reviewPair\.offerCurrent\(config\.reviewEpoch, data\)/);
  assert.match(hook, /reviewPair\.offerBalance\(config\.reviewEpoch, data\)/);
  assert.match(hook, /reads\.batch\(\{ passive: true \}\)/);
  assert.match(hook, /reads\.batch\.reset\(\)/);
  assert.match(hook, /watchVisibleReads\(reads\.batch/);
  assert.doesNotMatch(hook, /fresh: true.*begin\('BATCH'\)/);
});
