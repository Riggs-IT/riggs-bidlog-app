import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReviewPairCoordinator, REVIEW_PAIR_STATE} from '../src/reviewPairCoordinator.js';
import {acceptedServerReviewIndex} from '../src/acceptedReviewPair.js';

const NOW = '2026-10-19T17:00:00.000Z';
const NEXT_CUTOFF = '2026-11-15T17:00:00.000Z';
const SNAPSHOT = '8e3faacf-2bc3-4ee7-9d62-b0957ab1c772';
const OTHER = 'bff2e24b-6f54-46e3-b28a-0bea9216a49f';
function fixture() {
  const current = {
    primarySnapshotId: SNAPSHOT,
    projects: [{jobListId:531,jobNumber:'26587',hasPmForecast:true,projectCompleted:false,
      latestForecastVersionId:201,latestForecastVersionType:'PM_SUBMISSION'}],
    monthly:{items:[{jobListId:531,items:[{monthStart:'2026-10-01',hasPmForecast:true,
      latestForecastVersionId:201,primaryProjectionSource:'PM_FORECAST',
      monthEditState:'LOCKED_CURRENT',isEditable:false,pmForecastAmount:2840349,
      foundationActualAmount:null}]}]},
  };
  const balance = [{jobListId:531,jobNumber:'26587',needsRebalance:true,
    rebalanceVarianceAmount:-2840349,forecastVersionId:201,
    reviewStatus:'PENDING_FOUNDATION',reviewLockMonth:'2026-10-01',
    reviewEvidenceState:'MATCHED_REFRESH',reviewPrimarySnapshotId:SNAPSHOT}];
  const visible = {currentProjects:current.projects, portfolioBalance:balance,
    currentMonthly:new Map(current.monthly.items.map(row=>[row.jobListId,row.items])),
    primarySnapshotId:SNAPSHOT};
  return {current,balance,visible};
}
function certifiedFixture() {
  const {current,balance,visible}=fixture();
  let accepted = null;
  const gate = createReviewPairCoordinator({now:()=>NOW,
    onChange: (_evidence,pair)=>{accepted=pair;}});
  const epoch=gate.begin();
  gate.offerCurrent(epoch,current);
  gate.offerBalance(epoch,balance);
  assert.equal(gate.finish(epoch,{successful:true}).state,REVIEW_PAIR_STATE.VERIFIED);
  assert.ok(accepted);
  return {gate,accepted,current,balance,visible};
}

test('certificate and exact response pair publish together after both successful reads',()=>{
  const transitions=[];
  const {current,balance}=fixture();
  const gate=createReviewPairCoordinator({now:()=>NOW,onChange:(state,pair)=>transitions.push({state:state.state,pair})});
  const epoch=gate.begin('MANUAL');
  gate.offerBalance(epoch,balance);
  gate.offerCurrent(epoch,current);
  assert.deepEqual(transitions.map(t=>[t.state,Boolean(t.pair)]),[['WAITING',false]]);
  gate.finish(epoch,{successful:true});
  assert.deepEqual(transitions.map(t=>[t.state,Boolean(t.pair)]),[['WAITING',false],['VERIFIED',true]]);
  assert.strictEqual(transitions[1].pair.current,current);
  assert.strictEqual(transitions[1].pair.balance,balance);
  assert.equal(transitions[1].pair.verifiedAtUTC,NOW);
  assert.equal(Object.isFrozen(transitions[1].pair),true);
});

test('verified server rows preserve SQL financial amounts and statuses with exact visible sources',()=>{
  const {accepted,visible,balance}=certifiedFixture();
  const rows=acceptedServerReviewIndex(accepted,visible,NOW);
  assert.ok(rows instanceof Map);
  assert.equal(rows.size,1);
  assert.equal(rows.get('531').reviewStatus,'PENDING_FOUNDATION');
  assert.equal(rows.get('531').rebalanceVarianceAmount,-2840349);
  assert.equal(rows.get('531').reviewStatusSource,'VERIFIED_SERVER');
  assert.equal(balance[0].reviewStatusSource,undefined);
});

test('missing certificate fails closed',()=>{
  assert.equal(acceptedServerReviewIndex(null,fixture().visible,NOW),null);
});
test('new projects array cannot borrow older certificate',()=>{
  const {accepted,visible}=certifiedFixture();
  assert.equal(acceptedServerReviewIndex(accepted,{...visible,currentProjects:[...visible.currentProjects]},NOW),null);
});
test('new balance array cannot borrow older certificate',()=>{
  const {accepted,visible}=certifiedFixture();
  assert.equal(acceptedServerReviewIndex(accepted,{...visible,portfolioBalance:[...visible.portfolioBalance]},NOW),null);
});
test('new monthly map entry cannot borrow older certificate',()=>{
  const {accepted,visible}=certifiedFixture();
  assert.equal(acceptedServerReviewIndex(accepted,{...visible,
    currentMonthly:new Map([[531,[...visible.currentMonthly.get(531)]]])},NOW),null);
});
test('monthly map with missing job cannot borrow older certificate',()=>{
  const {accepted,visible}=certifiedFixture();
  assert.equal(acceptedServerReviewIndex(accepted,{...visible,currentMonthly:new Map()},NOW),null);
});
test('new primary snapshot identity cannot borrow older certificate',()=>{
  const {accepted,visible}=certifiedFixture();
  assert.equal(acceptedServerReviewIndex(accepted,{...visible,primarySnapshotId:OTHER},NOW),null);
});
test('cutoff rollover revokes earlier certificate before visible cutover',()=>{
  const {accepted,visible}=certifiedFixture();
  assert.equal(acceptedServerReviewIndex(accepted,visible,NEXT_CUTOFF),null);
});
test('changed PM version revokes earlier certificate',()=>{
  const {accepted,visible,current}=certifiedFixture();
  current.projects[0].latestForecastVersionId=199;
  assert.equal(acceptedServerReviewIndex(accepted,visible,NOW),null);
});
test('changed server status revokes earlier certificate',()=>{
  const {accepted,visible,balance}=certifiedFixture();
  balance[0].reviewStatus='NEEDS_REBALANCE';
  assert.equal(acceptedServerReviewIndex(accepted,visible,NOW),null);
});
test('unavailable server evidence cannot produce server review index',()=>{
  const {accepted,visible,balance}=certifiedFixture();
  balance[0].reviewStatus=null;
  balance[0].reviewEvidenceState='UNAVAILABLE';
  balance[0].reviewPrimarySnapshotId=null;
  assert.equal(acceptedServerReviewIndex(accepted,visible,NOW),null);
});
test('failed or partial refresh clears previously accepted financial evidence',()=>{
  let accepted=null;
  const gate=createReviewPairCoordinator({now:()=>NOW,onChange:(_state,pair)=>{accepted=pair;}});
  const {current,balance}=fixture();
  const a=gate.begin();gate.offerCurrent(a,current);gate.offerBalance(a,balance);
  gate.finish(a,{successful:true});assert.ok(accepted);
  const b=gate.begin('MANUAL');assert.equal(accepted,null);
  gate.offerCurrent(b,current);gate.offerBalance(b,balance);
  gate.finish(b,{successful:false});assert.equal(accepted,null);
});
test('a later independent read revokes an accepted pair synchronously',()=>{
  const {gate}=certifiedFixture();
  let published;
  const x=createReviewPairCoordinator({now:()=>NOW,onChange:(_state,pair)=>{published=pair;}});
  const {current,balance}=fixture();
  const epoch=x.begin();x.offerCurrent(epoch,current);x.offerBalance(epoch,balance);
  x.finish(epoch,{successful:true});assert.ok(published);
  x.invalidate('INDEPENDENT_FRESH_READ');assert.equal(published,null);
  assert.equal(gate.evidence.state,'VERIFIED');
});
test('superseded epoch must not publish an accepted response pair',()=>{
  const accepted=[];
  const gate=createReviewPairCoordinator({now:()=>NOW,onChange:(_state,pair)=>accepted.push(pair)});
  const a=gate.begin(); const b=gate.begin(); const {current,balance}=fixture();
  gate.offerCurrent(a,current);gate.offerBalance(a,balance);
  gate.finish(a,{successful:true});
  assert.equal(accepted.length,2);
  gate.offerCurrent(b,current);gate.offerBalance(b,balance);
  gate.finish(b,{successful:true});
  assert.equal(accepted.length,3);
  assert.ok(accepted[2]);
});
test('App uses the exact accepted pair as its verified server presentation source',()=>{
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const hook=readFileSync(new URL('../src/useProjectedBillingsFreshness.js',import.meta.url),'utf8');
  assert.match(app,/const \[acceptedReviewPair, setAcceptedReviewPair\] = useState\(null\)/);
  assert.match(app,/onAcceptedReviewPair: setAcceptedReviewPair/);
  assert.match(app,/setAcceptedReviewPair\(null\)/);
  assert.match(app,/resolveVisiblePortfolioReviews\(acceptedReviewPair, \{/);
  assert.match(app,/const rebalanceByJobId = visibleReview\.rows/);
  assert.match(hook,/evidence\.state !== 'WAITING'/);
  assert.match(hook,/latest\.current\.onAcceptedReviewPair\?\.\(acceptedPair\)/);
});
