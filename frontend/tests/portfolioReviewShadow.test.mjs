import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditServerReview, indexedBalanceReviews, SERVER_REVIEW_AUDIT as AUDIT,
  PENDING_FOUNDATION, NEEDS_REBALANCE,
} from '../src/portfolioBalance.js';

const asOf = '2026-10-19T17:00:00Z';
const attention = {
  jobListId: 10, jobNumber: '26500', needsRebalance: true,
  forecastVersionId: 7, rebalanceVarianceAmount: -1000,
};
const project = {
  jobListId: 10, jobNumber: '26500', hasPmForecast: true,
  latestForecastVersionId: 7, latestForecastVersionType: 'PM_SUBMISSION',
};
const month = {
  monthStart: '2026-10-01', latestForecastVersionId: 7,
  primaryProjectionSource: 'PM_FORECAST', hasPmForecast: true,
  pmForecastAmount: 1000, foundationActualAmount: null,
  isEditable: false, monthEditState: 'LOCKED_CURRENT',
};
const matched = {
  ...attention, reviewStatus: PENDING_FOUNDATION,
  reviewLockMonth: '2026-10-01', reviewEvidenceState: 'MATCHED_REFRESH',
};
function result(row, p = project, months = [month], clock = asOf) {
  return indexedBalanceReviews([row], p ? [p] : [],
    new Map([[10, months]]), clock).get('10');
}

test('older bridge contract is observed without changing the existing badge', () => {
  const row = result(attention);
  assert.equal(row.reviewStatus, PENDING_FOUNDATION);
  assert.equal(row.reviewEvidenceAudit, AUDIT.NOT_PROVIDED);
  assert.deepEqual(attention, {
    jobListId: 10, jobNumber: '26500', needsRebalance: true,
    forecastVersionId: 7, rebalanceVarianceAmount: -1000,
  });
});

test('same-version cache evidence can agree but React continues to own display', () => {
  const row = result(matched);
  assert.equal(row.reviewStatus, PENDING_FOUNDATION);
  assert.equal(row.reviewEvidenceAudit, AUDIT.CONTENT_PARITY_ONLY);
  assert.equal(row.rebalanceVarianceAmount, -1000);
  assert.equal(row.needsRebalance, true);
});

test('unavailable evidence after a fresh read is not mislabeled or promoted', () => {
  const row = result({...matched, reviewStatus: null, reviewEvidenceState: 'UNAVAILABLE'});
  assert.equal(row.reviewStatus, PENDING_FOUNDATION);
  assert.equal(row.reviewEvidenceAudit, AUDIT.UNAVAILABLE);
});

test('server and browser disagree: preserve existing badge, report mismatch', () => {
  const row = result({...matched, reviewStatus: NEEDS_REBALANCE});
  assert.equal(row.reviewStatus, PENDING_FOUNDATION);
  assert.equal(row.reviewEvidenceAudit, AUDIT.DISAGREEMENT);
});

test('Arizona day-15 rollover invalidates prior locked-month evidence', () => {
  const row = result(matched, project, [month], '2026-11-15T07:01:00Z');
  assert.equal(row.reviewStatus, NEEDS_REBALANCE);
  assert.equal(row.reviewEvidenceAudit, AUDIT.STALE_LOCK_MONTH);
});

test('stale PM version, wrong project and wrong locked month never appear matched', () => {
  assert.equal(result(matched, {...project, latestForecastVersionId: 8}).reviewEvidenceAudit,
    AUDIT.STALE_PROJECT);
  assert.equal(result(matched, {...project, jobNumber: 'X'}).reviewEvidenceAudit,
    AUDIT.STALE_PROJECT);
  assert.equal(result(matched, project, [{...month, latestForecastVersionId: 9}]).reviewEvidenceAudit,
    AUDIT.STALE_MONTH);
});

test('mismatched month source or absent month cannot confirm Pending Foundation', () => {
  assert.equal(result(matched, project, []).reviewEvidenceAudit, AUDIT.STALE_MONTH);
  assert.equal(result(matched, project, [{...month, primaryProjectionSource: 'SYSTEM_BASELINE'}]).reviewEvidenceAudit,
    AUDIT.STALE_MONTH);
});

test('invalid or partially deployed contracts fail observationally closed', () => {
  assert.equal(result({...matched, reviewEvidenceState: 'GUARANTEED'}).reviewEvidenceAudit,
    AUDIT.INVALID_CONTRACT);
  const {reviewLockMonth, ...partial} = matched;
  assert.equal(result(partial).reviewEvidenceAudit, AUDIT.INVALID_CONTRACT);
  assert.equal(result({...matched, reviewStatus: 'PAID'}).reviewEvidenceAudit,
    AUDIT.INVALID_CONTRACT);
  assert.equal(auditServerReview(matched, project, [month], 'invalid', PENDING_FOUNDATION),
    AUDIT.STALE_LOCK_MONTH);
});

test('verified Needs Rebalance is observable even with no recent month evidence', () => {
  const row = result({...matched, reviewStatus: NEEDS_REBALANCE}, project, []);
  assert.equal(row.reviewStatus, NEEDS_REBALANCE);
  assert.equal(row.reviewEvidenceAudit, AUDIT.CONTENT_PARITY_ONLY);
});
