import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  indexedBalanceReviews,
  auditServerReview,
  SERVER_REVIEW_AUDIT as AUDIT,
  PENDING_FOUNDATION,
  NEEDS_REBALANCE,
} from '../src/portfolioBalance.js';

const LOCK = '2026-10-01';
const AS_OF = '2026-10-19T17:00:00Z';
const SNAP_A = 'cb6a799e-351c-4e23-8b0d-b72f2b131f70';
const SNAP_B = '8aae3df9-1d85-4da0-985a-702db5a7330a';
const base = {
  jobListId: 10, jobNumber: '26500', jobName: 'Test project',
  needsRebalance: true, forecastVersionId: 7,
  rebalanceVarianceAmount: -1000, projectionTargetAmount: 5000,
  editablePmProjectionTotal: 4000,
};
const project = {
  jobListId: 10, jobNumber: '26500', hasPmForecast: true,
  latestForecastVersionId: 7, latestForecastVersionType: 'PM_SUBMISSION',
  primaryProjectionSource: 'PM_FORECAST', projectCompleted: false,
};
const month = {
  jobListId: 10, monthStart: LOCK, latestForecastVersionId: 7,
  primaryProjectionSource: 'PM_FORECAST', hasPmForecast: true,
  pmForecastAmount: 1000, foundationActualAmount: null,
  isEditable: false, monthEditState: 'LOCKED_CURRENT',
};
const classified = {
  ...base, reviewStatus: PENDING_FOUNDATION,
  reviewLockMonth: LOCK, reviewEvidenceState: 'MATCHED_REFRESH',
  reviewPrimarySnapshotId: SNAP_A,
};

function derive(row = classified, options = {}) {
  const {p = project, months = [month], now = AS_OF} = options;
  const snapshot = Object.hasOwn(options, 'snapshot') ? options.snapshot : SNAP_A;
  const input = structuredClone(row);
  const result = indexedBalanceReviews([input], p ? [p] : [], new Map([[10, months]]), now, snapshot);
  return {row: result.get('10'), input};
}

// Only observational audit state changes. Even a matching snapshot can never
// change React's calculation until a later, explicitly tested cutover.
test('matching same-response snapshot IDs establish classified parity without changing visible badge', () => {
  const {row} = derive();
  assert.equal(row.reviewEvidenceAudit, AUDIT.SNAPSHOT_PARITY);
  assert.equal(row.reviewStatus, PENDING_FOUNDATION);
  assert.equal(row.rebalanceVarianceAmount, -1000);
  assert.equal(row.projectionTargetAmount, 5000);
  assert.equal(row.needsRebalance, true);
});

test('different snapshot IDs never count as parity even if PM version, status and amounts match', () => {
  const {row} = derive(classified, {snapshot: SNAP_B});
  assert.equal(row.reviewEvidenceAudit, AUDIT.SNAPSHOT_MISMATCH);
  assert.equal(row.reviewStatus, PENDING_FOUNDATION);
});

test('case-insensitive canonical UUID comparison identifies identical primary evidence', () => {
  assert.equal(derive({...classified, reviewPrimarySnapshotId: SNAP_A.toUpperCase()}).row.reviewEvidenceAudit,
    AUDIT.SNAPSHOT_PARITY);
});

test('server claims Needs Rebalance on matching snapshot; React still shows Pending and flags disagreement', () => {
  const {row} = derive({...classified, reviewStatus: NEEDS_REBALANCE});
  assert.equal(row.reviewEvidenceAudit, AUDIT.DISAGREEMENT);
  assert.equal(row.reviewStatus, PENDING_FOUNDATION);
});

test('server disagrees but uses different snapshot: stale lineage takes precedence', () => {
  const {row} = derive({...classified, reviewStatus: NEEDS_REBALANCE}, {snapshot: SNAP_B});
  assert.equal(row.reviewEvidenceAudit, AUDIT.SNAPSHOT_MISMATCH);
  assert.equal(row.reviewStatus, PENDING_FOUNDATION);
});

test('absent client ID never certifies matched-refresh evidence from server', () => {
  assert.equal(derive(classified, {snapshot: null}).row.reviewEvidenceAudit, AUDIT.SNAPSHOT_UNAVAILABLE);
  assert.equal(derive(classified, {snapshot: undefined}).row.reviewEvidenceAudit, AUDIT.SNAPSHOT_UNAVAILABLE);
});

test('absent server ID never certifies a client snapshot', () => {
  const withoutId = {...classified};
  delete withoutId.reviewPrimarySnapshotId;
  assert.equal(derive(withoutId).row.reviewEvidenceAudit, AUDIT.SNAPSHOT_UNAVAILABLE);
  assert.equal(derive({...classified, reviewPrimarySnapshotId: null}).row.reviewEvidenceAudit,
    AUDIT.SNAPSHOT_UNAVAILABLE);
});

test('both legacy IDs absent preserve Stage 3G1 content-only observation (not snapshot parity)', () => {
  const old = {...classified};
  delete old.reviewPrimarySnapshotId;
  assert.equal(derive(old, {snapshot: null}).row.reviewEvidenceAudit, AUDIT.CONTENT_PARITY_ONLY);
});

test('malformed server UUID rejects the review contract without affecting the displayed label', () => {
  for (const id of ['1234', '', 123, {}, '00000000-0000-0000-0000-000000000000']) {
    const {row} = derive({...classified, reviewPrimarySnapshotId: id});
    assert.equal(row.reviewEvidenceAudit, AUDIT.INVALID_CONTRACT);
    assert.equal(row.reviewStatus, PENDING_FOUNDATION);
  }
});

test('malformed client UUID prevents certification even if server ID is valid', () => {
  assert.equal(derive(classified, {snapshot: 'bad'}).row.reviewEvidenceAudit, AUDIT.SNAPSHOT_UNAVAILABLE);
});

test('server UNAVAILABLE with null ID preserves React badge and reports unavailable', () => {
  const {row} = derive({...classified,
    reviewStatus: null, reviewEvidenceState: 'UNAVAILABLE', reviewPrimarySnapshotId: null});
  assert.equal(row.reviewEvidenceAudit, AUDIT.UNAVAILABLE);
  assert.equal(row.reviewStatus, PENDING_FOUNDATION);
});

test('server UNAVAILABLE cannot retain an authoritative snapshot ID', () => {
  assert.equal(derive({...classified, reviewStatus: null, reviewEvidenceState: 'UNAVAILABLE'})
    .row.reviewEvidenceAudit, AUDIT.INVALID_CONTRACT);
});

test('matched snapshot cannot certify a different Arizona lock period', () => {
  assert.equal(derive(classified, {now: '2026-11-15T07:00:00Z'})
    .row.reviewEvidenceAudit, AUDIT.STALE_LOCK_MONTH);
});

test('matched snapshot is not sufficient if the PM version has changed', () => {
  assert.equal(derive(classified, {p: {...project, latestForecastVersionId: 8}})
    .row.reviewEvidenceAudit, AUDIT.STALE_PROJECT);
});

test('matched snapshot is not sufficient if the project identity has changed', () => {
  assert.equal(derive(classified, {p: {...project, jobNumber: 'OTHER'}})
    .row.reviewEvidenceAudit, AUDIT.STALE_PROJECT);
});

test('matched snapshot cannot hide stale or duplicated PM month evidence', () => {
  assert.equal(derive(classified, {months: [{...month, latestForecastVersionId: 8}]})
    .row.reviewEvidenceAudit, AUDIT.STALE_MONTH);
  assert.equal(derive(classified, {months: [month, {...month}]})
    .row.reviewEvidenceAudit, AUDIT.STALE_MONTH);
});

test('matching snapshot with absent PM month cannot certify Pending Foundation', () => {
  assert.equal(derive(classified, {months: []}).row.reviewEvidenceAudit, AUDIT.STALE_MONTH);
});

test('unavailable review never becomes a false Needs Rebalance badge', () => {
  const {row} = derive({...classified,
    reviewStatus: null, reviewEvidenceState: 'UNAVAILABLE', reviewPrimarySnapshotId: null});
  assert.equal(row.reviewStatus, PENDING_FOUNDATION);
  assert.equal(row.reviewEvidenceAudit, AUDIT.UNAVAILABLE);
});

test('no server review fields leaves the old React-only display and NOT_PROVIDED audit', () => {
  const {row} = derive(base);
  assert.equal(row.reviewEvidenceAudit, AUDIT.NOT_PROVIDED);
  assert.equal(row.reviewStatus, PENDING_FOUNDATION);
});

test('snapshot comparisons never mutate API records, project rows or the monthly map', () => {
  const entry = structuredClone(classified);
  const p = structuredClone(project);
  const months = [structuredClone(month)];
  const before = structuredClone({entry, p, months});
  indexedBalanceReviews([entry], [p], new Map([[10, months]]), AS_OF, SNAP_B);
  assert.deepEqual({entry, p, months}, before);
});

test('review audit is non-authoritative and never triggers a network request', () => {
  const source = readFileSync(new URL('../src/portfolioBalance.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|\bexecute\s*\(|\blocalStorage\b/);
  assert.match(source, /reviewStatus: status, reviewEvidenceAudit: audit/);
  assert.equal(auditServerReview(classified, project, [month], AS_OF, PENDING_FOUNDATION, SNAP_A),
    AUDIT.SNAPSHOT_PARITY);
});

test('refresh pipeline publishes one primary snapshot ID with corresponding project/month bundle', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const adapter = readFileSync(new URL('../src/primaryProjection.js', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/useProjectedBillingsFreshness.js', import.meta.url), 'utf8');
  assert.match(adapter, /primarySnapshotId: primary\.primarySnapshotId \?\? null/);
  assert.match(hook, /return mergePrimaryPortfolio\(projects, monthly, primary\)/);
  assert.match(app, /onCurrent: \(\{ projects, monthly, primarySnapshotId: nextSnapshotId \}\)/);
  assert.match(app, /setPrimarySnapshotId\(nextSnapshotId\)/);
  assert.match(app, /setPrimarySnapshotId\(null\)/);
  assert.match(app, /varianceAsOfUTC, primarySnapshotId/);
  assert.match(app, /\[portfolioBalance, currentProjects, currentMonthly, varianceAsOfUTC, primarySnapshotId\]/);
  assert.doesNotMatch(hook, /reviewPrimarySnapshotId/);
});

test('independent fresh project refresh does not claim coordinated evidence', () => {
  const hook = readFileSync(new URL('../src/useProjectedBillingsFreshness.js', import.meta.url), 'utf8');
  assert.match(hook, /reads\.current\.load\(\{ replace: true, fresh: true, passive: true \}\)/);
  assert.match(hook, /reads\.portfolioBalance\.load\(\{ replace: true, fresh: true, passive: true \}\)/);
  assert.doesNotMatch(hook, /reviewEvidenceAudit ===/);
});
