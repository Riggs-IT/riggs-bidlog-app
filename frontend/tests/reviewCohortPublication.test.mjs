import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createReviewPairCoordinator, REVIEW_PAIR_STATE} from '../src/reviewPairCoordinator.js';
import {createReviewCohortPublisher} from '../src/reviewCohortPublication.js';
import {resolveVisiblePortfolioReviews, VISIBLE_REVIEW_SOURCE} from '../src/acceptedReviewPair.js';
import {PENDING_FOUNDATION, NEEDS_REBALANCE} from '../src/portfolioBalance.js';

const NOW = '2026-10-21T16:30:50.000Z';
const CUTOFF = '2026-11-15T07:00:00.000Z';
const SNAPSHOT = '8e3faacf-2bc3-4ee7-9d62-b0957ab1c772';
const NEXT = '59a96529-fb03-4496-87fa-0a8f0bb2226a';
const make = (id=SNAPSHOT, amount=100) => ({
  current: {
    primarySnapshotId:id,
    projects:[{jobListId:531,jobNumber:'26587',hasPmForecast:true,projectCompleted:false,
      latestForecastVersionId:201,latestForecastVersionType:'PM_SUBMISSION',projectedTotal:amount}],
    monthly:{items:[{jobListId:531,items:[{monthStart:'2026-10-01',hasPmForecast:true,
      latestForecastVersionId:201,primaryProjectionSource:'PM_FORECAST',
      monthEditState:'LOCKED_CURRENT',isEditable:false,pmForecastAmount:amount}]}]},
  },
  balance:[{jobListId:531,jobNumber:'26587',needsRebalance:true,
    forecastVersionId:201,rebalanceVarianceAmount:-amount,
    reviewStatus:PENDING_FOUNDATION,reviewLockMonth:'2026-10-01',
    reviewEvidenceState:'MATCHED_REFRESH',reviewPrimarySnapshotId:id}],
});
function certify(cohort) {
  let pair;
  const coordinator = createReviewPairCoordinator({now:()=>NOW,
    onChange:(e, next)=>{if(e.state===REVIEW_PAIR_STATE.VERIFIED) pair=next;}});
  const epoch=coordinator.begin();
  coordinator.offerCurrent(epoch,cohort.current);
  coordinator.offerBalance(epoch,cohort.balance);
  assert.equal(coordinator.finish(epoch,{successful:true}).state,REVIEW_PAIR_STATE.VERIFIED);
  return pair;
}
function display(cohort) {
  return resolveVisiblePortfolioReviews(cohort.acceptedPair, {
    currentProjects:cohort.current.projects,
    currentMonthly:new Map(cohort.current.monthly.items.map(row=>[row.jobListId,row.items])),
    portfolioBalance:cohort.balance,
    primarySnapshotId:cohort.current.primarySnapshotId,
  }, NOW);
}
function fixture() {
  let now = 1000;
  let utc = NOW;
  const events=[];
  const publisher = createReviewCohortPublisher({
    publish:v=>events.push(v), nowMs:()=>now, nowUTC:()=>utc,
  });
  return {publisher,events,advance:ms=>{now+=ms;},utc:value=>{utc=value;}};
}
function transient(cohort) {
  const next=structuredClone(cohort);
  next.current.primarySnapshotId=NEXT;
  next.balance=next.balance.map(row=>({...row,reviewStatus:null,
    reviewEvidenceState:'UNAVAILABLE',reviewPrimarySnapshotId:null}));
  return next;
}

test('ordinary transient refresh retains old exact certified financial refs (no flicker)',()=>{
  const {publisher,events}=fixture();
  const pair=certify(make());
  assert.equal(publisher.verified(pair),'VERIFIED');
  const held=events[0];
  assert.equal(display(held).source,VISIBLE_REVIEW_SOURCE.VERIFIED_SERVER);
  assert.equal(display(held).rows.get('531').reviewStatus,PENDING_FOUNDATION);
  const incoming=transient(make());
  assert.equal(publisher.unavailable({...incoming,reason:'UNAVAILABLE',passive:true}),
    'RETAINED_VERIFIED_COHORT');
  assert.equal(events.length,1,'no intermediate unverified UI publication');
  assert.strictEqual(events[0].current,pair.current);
  assert.strictEqual(events[0].balance,pair.balance);
});

test('new VERIFIED status replaces the financial cohort and certificate together',()=>{
  const {publisher,events}=fixture();
  publisher.verified(certify(make()));
  const next=make(NEXT);
  next.balance[0].reviewStatus=NEEDS_REBALANCE;
  publisher.verified(certify(next));
  assert.equal(events.length,2);
  assert.strictEqual(events[1].current,next.current);
  assert.strictEqual(events[1].balance,next.balance);
  assert.equal(display(events[1]).rows.get('531').reviewStatus,NEEDS_REBALANCE);
});

test('changed amounts during incomplete refresh hold ORIGINAL data, never borrow Pending for new data',()=>{
  const {publisher,events}=fixture();
  const prior=certify(make());
  publisher.verified(prior);
  const incoming=transient(make(SNAPSHOT,102));
  assert.equal(publisher.unavailable({...incoming,reason:'UNAVAILABLE',passive:true}),
    'RETAINED_VERIFIED_COHORT');
  assert.equal(events.length,1,'no unpaired financial values are displayed');
  assert.strictEqual(events[0].current,prior.current);
  assert.strictEqual(events[0].balance,prior.balance);
  assert.equal(display(events[0]).rows.get('531').reviewStatus,PENDING_FOUNDATION);
  const next=make(NEXT,102);
  next.balance[0].reviewStatus=NEEDS_REBALANCE;
  publisher.verified(certify(next));
  assert.equal(events.length,2);
  assert.strictEqual(events[1].current,next.current);
  assert.equal(display(events[1]).rows.get('531').reviewStatus,NEEDS_REBALANCE);
});

test('changed SQL imbalance set cannot leave a resolved project marked Pending',()=>{
  const {publisher,events}=fixture();
  publisher.verified(certify(make()));
  const incoming=transient(make());
  incoming.balance=[];
  assert.equal(publisher.unavailable({...incoming,reason:'UNAVAILABLE',passive:true}),
    'UNVERIFIED_COHORT');
  assert.equal(events[1].acceptedPair,null);
  assert.deepEqual(events[1].balance,[]);
});

test('a changed PM version cannot retain Pending when Foundation evidence is unavailable',()=>{
  const {publisher,events}=fixture();
  publisher.verified(certify(make()));
  const incoming=transient(make());
  incoming.current.projects[0].latestForecastVersionId=202;
  assert.equal(publisher.unavailable({...incoming,reason:'UNAVAILABLE',passive:true}),
    'UNVERIFIED_COHORT');
  assert.equal(events.length,2);
  assert.equal(events[1].acceptedPair,null);
});

test('only incomplete/recoverable evidence may retain; real row errors fail closed',()=>{
  for(const reason of ['STALE_PROJECT','STALE_MONTH','INVALID_CONTRACT']) {
    const {publisher,events}=fixture();
    publisher.verified(certify(make()));
    assert.equal(publisher.unavailable({...transient(make()),reason,passive:true}),
      'UNVERIFIED_COHORT');
    assert.equal(events[1].acceptedPair,null);
  }
});

test('manual refresh keeps an unchanged verified cohort; independent read revokes it',()=>{
  const {publisher,events}=fixture();
  publisher.verified(certify(make()));
  const input=transient(make());
  assert.equal(publisher.unavailable({...input,reason:'UNAVAILABLE',passive:false}),
    'RETAINED_VERIFIED_COHORT');
  assert.equal(events.length,1,'no manual-refresh flicker');
  publisher.forget(); // called by the hook for an independent fresh read
  assert.equal(publisher.unavailable({...input,reason:'UNAVAILABLE',passive:true}),
    'UNVERIFIED_COHORT');
});

test('no arbitrary 180-second timeout can replace an unchanged verified balance',()=>{
  const {publisher,events,advance}=fixture();
  publisher.verified(certify(make()));
  advance(600_000);
  assert.equal(publisher.unavailable({...transient(make()),reason:'UNAVAILABLE',passive:true}),
    'RETAINED_VERIFIED_COHORT');
  assert.equal(events.length,1);
});

test('one missing financial reader keeps original certified data and reports no false zero',()=>{
  const {publisher,events}=fixture();
  const pair=certify(make());
  publisher.verified(pair);
  assert.equal(publisher.unavailable({current:null,balance:null,
    reason:'PARTIAL_REFRESH',passive:true}),'RETAINED_VERIFIED_COHORT');
  assert.equal(events.length,1);
  assert.strictEqual(events[0].current,pair.current);
  assert.strictEqual(events[0].balance,pair.balance);
});

test('Arizona day-15 rollover cannot retain the old lock-month certificate',()=>{
  const {publisher,events,utc}=fixture();
  publisher.verified(certify(make()));
  utc(CUTOFF);
  assert.equal(publisher.unavailable({...transient(make()),reason:'UNAVAILABLE',passive:true}),
    'UNVERIFIED_COHORT');
  assert.equal(events[1].acceptedPair,null);
});

test('in-place mutation of prior certified response cannot retain stale status',()=>{
  const {publisher,events}=fixture();
  const pair=certify(make());
  publisher.verified(pair);
  pair.current.monthly.items[0].items[0].pmForecastAmount=999;
  assert.equal(publisher.unavailable({...transient(make()),reason:'UNAVAILABLE',passive:true}),
    'UNVERIFIED_COHORT');
  assert.equal(events[1].acceptedPair,null);
});

test('a changed current half during partial refresh invalidates a previous certificate',()=>{
  const {publisher,events}=fixture();
  publisher.verified(certify(make()));
  const newer=transient(make());
  newer.current.projects[0].latestForecastVersionId=202;
  assert.equal(publisher.unavailable({current:newer.current,balance:null,
    reason:'PARTIAL_REFRESH',passive:true}),'UNVERIFIED_COHORT');
  assert.equal(events[1].acceptedPair,null);
  assert.strictEqual(events[1].current,newer.current);
  assert.equal(events[1].balance,null);
});

test('hook stages paired inputs, publishes one cohort and preserves explicit invalidation',()=>{
  const hook=readFileSync(new URL('../src/useProjectedBillingsFreshness.js',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.match(hook,/stagedPairs\.set\(epoch, \{current: null, balance: null\}\)/);
  assert.match(hook,/publisher\.verified\(acceptedPair\)/);
  assert.match(hook,/publisher\.unavailable\(/);
  assert.match(hook,/latest\.current\.onReviewCohort\?\.\(cohort\)/);
  assert.match(hook,/reviewPair\.invalidate\('INDEPENDENT_FRESH_READ'\)/);
  assert.match(app,/onReviewCohort: \(\{current, balance, acceptedPair\}\) =>/);
  assert.match(app,/if \(current\) applyCurrentProjectRead\(current\)/);
  assert.match(app,/if \(balance\) setPortfolioBalance\(balance\)/);
  assert.match(app,/setAcceptedReviewPair\(acceptedPair\)/);
});

test('unverified SQL balance uses Needs Rebalance, never an invented Pending label',()=>{
  const badge=readFileSync(new URL('../src/ForecastBalanceFlag.jsx',import.meta.url),'utf8');
  assert.match(badge,/const label = balanceReviewLabel\(\{reviewStatus: status\}\)/);
  assert.doesNotMatch(badge,/Verifying Balance|review-verifying-flag/);
});

test('an acceptance race across day 15 publishes no certified Pending label',()=>{
  const {publisher,events,utc}=fixture();
  utc(CUTOFF);
  assert.equal(publisher.verified(certify(make())),'UNVERIFIED_COHORT');
  assert.equal(events.length,1);
  assert.equal(events[0].acceptedPair,null);
});
