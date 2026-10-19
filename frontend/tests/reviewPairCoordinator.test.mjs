import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReviewPairCoordinator, verifyReviewPair, REVIEW_PAIR_STATE} from '../src/reviewPairCoordinator.js';

const NOW = '2026-10-19T17:00:00.000Z';
const NEXT_CUTOFF = '2026-11-15T17:00:00.000Z';
const SNAPSHOT = '8e3faacf-2bc3-4ee7-9d62-b0957ab1c772';
const OTHER = 'bff2e24b-6f54-46e3-b28a-0bea9216a49f';
function fixture() {
  const current = {
    primarySnapshotId: SNAPSHOT,
    projects: [{jobListId: 531, jobNumber: '26587', hasPmForecast: true,
      projectCompleted: false, latestForecastVersionId: 201,
      latestForecastVersionType: 'PM_SUBMISSION'}],
    monthly: {items: [{jobListId: 531, items: [{monthStart: '2026-10-01',
      hasPmForecast: true, latestForecastVersionId: 201,
      primaryProjectionSource: 'PM_FORECAST', monthEditState: 'LOCKED_CURRENT',
      isEditable: false, pmForecastAmount: 2840349, foundationActualAmount: null}]}]},
  };
  const balance = [{jobListId: 531, jobNumber: '26587',
    needsRebalance: true, rebalanceVarianceAmount: -2840349,
    forecastVersionId: 201, reviewStatus: 'PENDING_FOUNDATION',
    reviewLockMonth: '2026-10-01', reviewEvidenceState: 'MATCHED_REFRESH',
    reviewPrimarySnapshotId: SNAPSHOT}];
  return {current, balance};
}
const verify = (edit = () => {}, asOfUTC = NOW) => {
  const {current,balance} = fixture();
  edit(current,balance);
  return verifyReviewPair(current,balance,asOfUTC);
};
const unavailable = (reason, edit = () => {}, time = NOW) => {
  const result=verify(edit,time);
  assert.equal(result.state, REVIEW_PAIR_STATE.UNAVAILABLE);
  assert.equal(result.reason,reason);
};

test('matching PRIMARY response and balance evidence can be observationally certified', () => {
  assert.deepEqual(verify(), {state:'VERIFIED', primarySnapshotId: SNAPSHOT, flaggedCount:1});
});
test('mixed snapshot identity rejects even when PM version and financial amounts match', () => {
  unavailable('SNAPSHOT_MISMATCH', (p,b) => { b[0].reviewPrimarySnapshotId = OTHER; });
});
test('primary ID missing fails closed', () => {
  unavailable('MISSING_PRIMARY', p => {p.primarySnapshotId = null;});
});
test('balance ID missing fails closed', () => {
  unavailable('SNAPSHOT_UNAVAILABLE', (_p,b) => {b[0].reviewPrimarySnapshotId=null;});
});
test('prior API revision without review fields fails closed', () => {
  unavailable('NOT_PROVIDED', (_p,b) => {
    delete b[0].reviewStatus; delete b[0].reviewLockMonth;
    delete b[0].reviewEvidenceState; delete b[0].reviewPrimarySnapshotId;
  });
});
test('server reports unavailable evidence, not a verified classification', () => {
  unavailable('UNAVAILABLE', (_p,b) => {
    b[0].reviewStatus=null; b[0].reviewEvidenceState='UNAVAILABLE';
    b[0].reviewPrimarySnapshotId=null;
  });
});
test('Arizona day-15 rollover invalidates the old lock-month certification', () => {
  unavailable('STALE_LOCK_MONTH', () => {}, NEXT_CUTOFF);
});
test('different forecast version fails even with the same UUID', () => {
  unavailable('STALE_PROJECT', (p) => {p.projects[0].latestForecastVersionId=200;});
});
test('missing locked-month row fails closed', () => {
  unavailable('STALE_MONTH', (p) => {p.monthly.items[0].items=[];});
});
test('server classification disagreement fails closed', () => {
  unavailable('DISAGREEMENT', (_p,b) => {b[0].reviewStatus='NEEDS_REBALANCE';});
});
test('duplicate balance rows are rejected', () => {
  unavailable('INVALID_REVIEW_RESPONSE', (_p,b) => {b.push({...b[0]});});
});
test('duplicate monthly project records are rejected', () => {
  unavailable('INVALID_MONTHS', p => {p.monthly.items.push({...p.monthly.items[0]});});
});
test('an empty portfolio cannot be certified against a primary UUID', () => {
  unavailable('NO_REVIEW_ROWS', (_p,b) => {b.length=0;});
});
test('UUID casing is canonicalized for stable equality', () => {
  assert.equal(verify((p,b) => {p.primarySnapshotId=SNAPSHOT.toUpperCase();b[0].reviewPrimarySnapshotId=SNAPSHOT.toUpperCase();}).state, 'VERIFIED');
});

test('two callbacks in either order are needed; matching data alone does not publish prematurely', () => {
  const events=[];
  const gate=createReviewPairCoordinator({onChange: state => events.push(state.state),now:()=>NOW});
  const token=gate.begin('MANUAL');
  const {current,balance}=fixture();
  assert.equal(gate.offerBalance(token,balance),true);
  assert.equal(gate.evidence.state,'WAITING');
  assert.equal(gate.offerCurrent(token,current),true);
  assert.equal(gate.evidence.state,'WAITING');
  assert.deepEqual(gate.finish(token,{successful:true}),
    {state:'VERIFIED',primarySnapshotId:SNAPSHOT,flaggedCount:1});
  assert.deepEqual(events,['WAITING','VERIFIED']);
});
test('manual PARTIAL refresh cannot certify matching IDs', () => {
  const gate=createReviewPairCoordinator({now:()=>NOW});
  const token=gate.begin('MANUAL'); const {current,balance}=fixture();
  gate.offerCurrent(token,current); gate.offerBalance(token,balance);
  assert.deepEqual(gate.finish(token,{successful:false}),{state:'UNAVAILABLE',reason:'PARTIAL_REFRESH'});
});
test('no current read cannot accidentally reuse the previously certified primary', () => {
  const gate=createReviewPairCoordinator({now:()=>NOW});
  const {current,balance}=fixture();
  const a=gate.begin();gate.offerCurrent(a,current);gate.offerBalance(a,balance);
  assert.equal(gate.finish(a,{successful:true}).state,'VERIFIED');
  const b=gate.begin();gate.offerBalance(b,balance);
  assert.equal(gate.finish(b,{successful:true}).state,'UNAVAILABLE');
});
test('no balance read cannot accidentally reuse the previously certified balance', () => {
  const gate=createReviewPairCoordinator({now:()=>NOW}); const {current}=fixture();
  const token=gate.begin();gate.offerCurrent(token,current);
  assert.deepEqual(gate.finish(token,{successful:true}),{state:'UNAVAILABLE',reason:'PARTIAL_REFRESH'});
});
test('superseded reads cannot poison a new generation', () => {
  const gate=createReviewPairCoordinator({now:()=>NOW});
  const a=gate.begin(); const b=gate.begin(); const {current,balance}=fixture();
  assert.equal(gate.offerCurrent(a,current),false);
  assert.equal(gate.offerBalance(a,balance),false);
  assert.equal(gate.finish(a,{successful:true}).state,'SUPERSEDED');
  gate.offerCurrent(b,current);gate.offerBalance(b,balance);
  assert.equal(gate.finish(b,{successful:true}).state,'VERIFIED');
});
test('independent fresh=true invalidates prior verified evidence', () => {
  const gate=createReviewPairCoordinator({now:()=>NOW});
  const a=gate.begin();const {current,balance}=fixture();
  gate.offerCurrent(a,current);gate.offerBalance(a,balance);
  gate.finish(a,{successful:true});
  assert.deepEqual(gate.invalidate('INDEPENDENT_FRESH_READ'),
    {state:'UNAVAILABLE',reason:'INDEPENDENT_FRESH_READ'});
  assert.equal(gate.finish(a,{successful:true}).state,'SUPERSEDED');
});
test('a finalized pair cannot receive late results from the same refresh', () => {
  const gate=createReviewPairCoordinator({now:()=>NOW});
  const a=gate.begin(); gate.finish(a,{successful:false});
  assert.equal(gate.offerCurrent(a,fixture().current),false);
  assert.equal(gate.offerBalance(a,fixture().balance),false);
  assert.equal(gate.evidence.state,'UNAVAILABLE');
});
test('invalid datetime does not certify review evidence', () => {
  const gate=createReviewPairCoordinator({now:()=> 'invalid date'});
  const token=gate.begin(); const {current,balance}=fixture();
  gate.offerCurrent(token,current);gate.offerBalance(token,balance);
  assert.notEqual(gate.finish(token,{successful:true}).state,'VERIFIED');
});
test('review coordinator still validates both network reads before the server display owner can certify', () => {
  const hook=readFileSync(new URL('../src/useProjectedBillingsFreshness.js',import.meta.url),'utf8');
  assert.match(hook,/reviewPair\.begin\('MANUAL'\)/);
  assert.match(hook,/reviewPair\.finish\(reviewEpoch, \{successful: status\.status === 'COMPLETE'/);
  assert.match(hook,/reviewPair\.invalidate\('INDEPENDENT_FRESH_READ'\)/);
  assert.match(hook,/reviewPairEvidence/);
  assert.match(hook,/current\.load\(cohortConfig\)/);
  assert.match(hook,/portfolioBalance\.load\(cohortConfig\)/);
  assert.match(hook,/reviewPair\.offerCurrent/);
  assert.match(hook,/reviewPair\.offerBalance/);
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(app,/reviewPairEvidence/);
  assert.match(app,/resolveVisiblePortfolioReviews\(/);
});
