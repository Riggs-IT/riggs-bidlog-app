import test from 'node:test';
import assert from 'node:assert/strict';
import {queueEvidence, queueAgeLabel, recordedAgeSeconds} from '../src/administrationQueueEvidence.mjs';

const TIME = '2026-10-23T15:00:00Z';
const row = (laneKey, more = {}) => ({
  laneKey, failedCount: 0, pendingCount: 0, processingCount: 0,
  oldestPendingAtUTC: null, latestProcessedAtUTC: null,
  processHealth: 'NOT_COLLECTED', ...more,
});

test('queue age strictly uses SQL observation timestamp and retains null for unknown', () => {
  assert.equal(recordedAgeSeconds('2026-10-23T12:30:00Z', TIME), 9000);
  assert.equal(queueAgeLabel(9000), '2 hr 30 min');
  assert.equal(queueAgeLabel(0), '0 sec');
  assert.equal(queueAgeLabel(null), 'Not reported');
  assert.equal(recordedAgeSeconds(null, TIME), null);
  assert.equal(recordedAgeSeconds('invalid', TIME), null);
  assert.equal(recordedAgeSeconds('2026-10-23T16:00:00Z', TIME), null);
});

test('known failed counts appear first; older pending follows and is not labeled failed', () => {
  const original = [
    row('idle'),
    row('new', {pendingCount: 2, oldestPendingAtUTC: '2026-10-23T14:55:00Z'}),
    row('failed', {failedCount: 1}),
    row('old', {pendingCount: 8, oldestPendingAtUTC: '2026-10-23T11:00:00Z'}),
    row('processing', {processingCount: 1}),
  ];
  const sorted = queueEvidence(original, TIME);
  assert.deepEqual(sorted.map(x => x.laneKey), ['failed', 'old', 'new', 'processing', 'idle']);
  assert.equal(queueAgeLabel(sorted[1].oldestPendingAgeSeconds), '4 hr 0 min');
  assert.equal(original[0].oldestPendingAgeSeconds, undefined, 'did not mutate input');
});

test('missing age never pretends queue is healthy or has zero elapsed time', () => {
  const rows = queueEvidence([row('pending-without-age', {pendingCount: 4})], TIME);
  assert.equal(rows[0].oldestPendingAgeSeconds, null);
  assert.equal(queueAgeLabel(rows[0].oldestPendingAgeSeconds), 'Not reported');
});

test('idle queues do not display age even when a stale timestamp exists', () => {
  const rows = queueEvidence([row('old', {oldestPendingAtUTC: '2026-10-01T00:00:00Z'})], TIME);
  assert.equal(rows[0].oldestPendingAgeSeconds, null);
});
