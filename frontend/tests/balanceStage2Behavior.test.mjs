import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveVisiblePortfolioReviews, VISIBLE_REVIEW_SOURCE}
  from '../src/acceptedReviewPair.js';
import {BALANCE_REVIEW_FILTER, balanceReviewFacetValues, matchesBalanceReviewFacet}
  from '../src/balanceReviewQuickFilter.js';

const source = name => readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const row = {jobListId:531,jobNumber:'26587',needsRebalance:true,
  rebalanceVarianceAmount:57434,forecastVersionId:201,
  reviewStatus:'PENDING_FOUNDATION',reviewEvidenceState:'UNAVAILABLE'};
const visible = {portfolioBalance:[row],currentProjects:[],currentMonthly:new Map(),
  primarySnapshotId:'8e3faacf-2bc3-4ee7-9d62-b0957ab1c772'};

test('cold-start unresolved review keeps SQL gap without a provisional Needs-only label',()=>{
  const result=resolveVisiblePortfolioReviews(null,visible,'2026-10-27T16:30:00Z',
    {deferUnverified:true});
  assert.equal(result.source,VISIBLE_REVIEW_SOURCE.DEFERRED_CLASSIFICATION);
  const item=result.rows.get('531');
  assert.equal(item.rebalanceVarianceAmount,57434);
  assert.equal(item.reviewStatusSource,'DEFERRED_CLASSIFICATION');
  assert.deepEqual(balanceReviewFacetValues(item),[BALANCE_REVIEW_FILTER.ALL_REVIEWS]);
  assert.equal(matchesBalanceReviewFacet(item,BALANCE_REVIEW_FILTER.NEEDS_ONLY),false);
  assert.equal(matchesBalanceReviewFacet(item,BALANCE_REVIEW_FILTER.PENDING_ONLY),false);
  assert.equal(matchesBalanceReviewFacet(item,BALANCE_REVIEW_FILTER.ALL_REVIEWS),true);
  assert.equal(row.reviewStatusSource,undefined,'original SQL response not mutated');
});

test('definitive unavailable falls back to honest SQL Needs rather than claiming Pending',()=>{
  const result=resolveVisiblePortfolioReviews(null,visible,'2026-10-27T16:30:00Z');
  assert.equal(result.source,VISIBLE_REVIEW_SOURCE.SQL_REBALANCE_FALLBACK);
  assert.equal(result.rows.get('531').reviewStatus,'NEEDS_REBALANCE');
  assert.ok(balanceReviewFacetValues(result.rows.get('531')).includes(BALANCE_REVIEW_FILTER.NEEDS_ONLY));
});

test('balance callout is below meta cards, above billing projections, and PM-only draft shortcut is gated',()=>{
  const drawer=source('CurrentProjectBillingDrawer.jsx');
  const panel=source('PMForecastPanel.jsx');
  const summary=source('BalanceReviewSummary.jsx');
  assert.ok(drawer.indexOf('<section className="billing-characteristics-grid">')
    < drawer.indexOf('<BalanceReviewSummary'));
  assert.ok(drawer.indexOf('<BalanceReviewSummary') < drawer.indexOf('<PMForecastPanel'));
  assert.match(drawer,/mayStartPmRevision && safeReviewStatus\(rebalanceAttention\) === 'NEEDS_REBALANCE'/);
  assert.match(drawer,/hasAdminCorrectionChoice = billingRole === 'ADMIN' \|\| billingRole === 'MANAGEMENT_ADMIN'/);
  assert.match(drawer,/onAction=\{openBalanceProjections\}/);
  assert.match(drawer,/revisionRequest=\{revisionRequest\}/);
  assert.match(panel,/if \(isAdmin \|\| !canSubmit \|\| projectIsCompleted\)/);
  assert.match(panel,/if \(canEdit && editableRows.length && !editing\) beginEdit\('pm'\)/);
  assert.match(summary,/balanceReviewMoney\(Math.abs\(gap.value\)\)/);
  assert.doesNotMatch(summary,/Balance gap:/);
});
