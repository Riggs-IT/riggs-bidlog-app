import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyServerReviewRow, SERVER_REVIEW_VALIDATION as V,
  PENDING_FOUNDATION, NEEDS_REBALANCE} from '../src/portfolioBalance.js';
const AS_OF = '2026-10-19T17:00:00Z';
const SNAP = 'cb6a799e-351c-4e23-8b0d-b72f2b131f70';
const OTHER = '8aae3df9-1d85-4da0-985a-702db5a7330a';
const attention = {
  jobListId: 10, jobNumber: '26500', needsRebalance: true,
  forecastVersionId: 7, rebalanceVarianceAmount: -1000,
  reviewStatus: PENDING_FOUNDATION, reviewLockMonth: '2026-10-01',
  reviewEvidenceState: 'MATCHED_REFRESH', reviewPrimarySnapshotId: SNAP,
};
const project = {jobListId: 10, jobNumber: '26500', hasPmForecast: true,
  latestForecastVersionId: 7, latestForecastVersionType: 'PM_SUBMISSION',
  primaryProjectionSource: 'PM_FORECAST', projectCompleted: false};
const month = {monthStart: '2026-10-01', latestForecastVersionId: 7,
  primaryProjectionSource: 'PM_FORECAST', hasPmForecast: true,
  monthEditState: 'LOCKED_CURRENT', isEditable: false};
function check(a = attention, p = project, rows = [month], clock = AS_OF, id = SNAP) {
  return verifyServerReviewRow(a,p,rows,clock,id);
}

test('exact primary UUID and PM-version identity certify server label, not financial arithmetic', () => {
  assert.equal(check(), V.VERIFIED);
  assert.equal(check({...attention, reviewStatus: NEEDS_REBALANCE}), V.VERIFIED);
  assert.equal(check({...attention, reviewPrimarySnapshotId: SNAP.toUpperCase()}), V.VERIFIED);
});
test('mismatched or absent snapshot identity fails closed', () => {
  assert.equal(check(attention,project,[month],AS_OF,OTHER), V.SNAPSHOT_MISMATCH);
  assert.equal(check(attention,project,[month],AS_OF,null), V.SNAPSHOT_UNAVAILABLE);
  assert.equal(check({...attention,reviewPrimarySnapshotId:null}), V.SNAPSHOT_UNAVAILABLE);
  assert.equal(check({...attention,reviewPrimarySnapshotId:'bad'}), V.INVALID_CONTRACT);
});
test('partial, invalid or unavailable contract cannot be verified', () => {
  assert.equal(check({...attention,reviewStatus:null,reviewEvidenceState:'UNAVAILABLE',reviewPrimarySnapshotId:null}), V.UNAVAILABLE);
  assert.equal(check({...attention,reviewStatus:null,reviewEvidenceState:'UNAVAILABLE'}), V.INVALID_CONTRACT);
  const noReview = {...attention}; delete noReview.reviewStatus;
  delete noReview.reviewLockMonth; delete noReview.reviewEvidenceState;
  assert.equal(check(noReview), V.NOT_PROVIDED);
  assert.equal(check({...attention,reviewStatus:'PAID'}), V.INVALID_CONTRACT);
  assert.equal(check({...attention,reviewLockMonth:'invalid'}), V.INVALID_CONTRACT);
});
test('Arizona day-15 boundary revokes old locked month', () => {
  assert.equal(check(attention,project,[month],'2026-11-15T17:00:00Z'),V.STALE_LOCK_MONTH);
  assert.equal(check(attention,project,[month],'invalid date'), V.STALE_LOCK_MONTH);
});
test('stale project identity and PM version fail closed', () => {
  assert.equal(check(attention,{...project,latestForecastVersionId:8}),V.STALE_PROJECT);
  assert.equal(check(attention,{...project,jobNumber:'OTHER'}),V.STALE_PROJECT);
});
test('pending needs the same locked, authoritative PM month', () => {
  assert.equal(check(attention,project,[]),V.STALE_MONTH);
  assert.equal(check(attention,project,[month,month]),V.STALE_MONTH);
  assert.equal(check(attention,project,[{...month,isEditable:true}]),V.STALE_MONTH);
  assert.equal(check(attention,project,[{...month,monthEditState:'EDITABLE_CURRENT'}]),V.STALE_MONTH);
  assert.equal(check(attention,project,[{...month,primaryProjectionSource:'SYSTEM_BASELINE'}]),V.STALE_MONTH);
  assert.equal(check(attention,{...project,latestForecastVersionType:'ADMIN_CORRECTION'}),V.STALE_MONTH);
});
test('portfolio validation never issues SQL or network calls and never derives an amount', () => {
  const source = readFileSync(new URL('../src/portfolioBalance.js', import.meta.url),'utf8');
  assert.doesNotMatch(source, /balanceReviewStatus|\bfetch\s*\(|\bexecute\s*\(|foundationActualAmount|pmForecastAmount/);
  assert.match(source, /return V.VERIFIED/);
});
