import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReviewPairCoordinator, REVIEW_PAIR_STATE,
  canReuseVerifiedReviewPair} from '../src/reviewPairCoordinator.js';
import {
  resolveVisiblePortfolioReviews, VISIBLE_REVIEW_SOURCE,
} from '../src/acceptedReviewPair.js';
import {PENDING_FOUNDATION, NEEDS_REBALANCE} from '../src/portfolioBalance.js';

const NOW = '2026-10-19T17:00:00.000Z';
const BEFORE_ROLLOVER = '2026-11-15T06:59:59.000Z';
const AT_ROLLOVER = '2026-11-15T07:00:00.000Z';
const SNAPSHOT = '8e3faacf-2bc3-4ee7-9d62-b0957ab1c772';
const OTHER = 'bff2e24b-6f54-46e3-b28a-0bea9216a49f';

function fixture() {
  const current = {
    primarySnapshotId: SNAPSHOT,
    projects: [
      {jobListId: 531, jobNumber: '26587', projectCompleted: false, hasPmForecast: true,
        latestForecastVersionId: 201, latestForecastVersionType: 'PM_SUBMISSION'},
      {jobListId: 529, jobNumber: '26585', projectCompleted: false, hasPmForecast: true,
        latestForecastVersionId: 213, latestForecastVersionType: 'PM_SUBMISSION'},
    ],
    monthly: {items: [
      {jobListId: 531, items: [{monthStart: '2026-10-01', hasPmForecast: true,
        latestForecastVersionId: 201, primaryProjectionSource: 'PM_FORECAST',
        monthEditState: 'LOCKED_CURRENT', isEditable: false, pmForecastAmount: 2840349,
        foundationActualAmount: null}]},
      {jobListId: 529, items: [{monthStart: '2026-10-01', hasPmForecast: true,
        latestForecastVersionId: 213, primaryProjectionSource: 'PM_FORECAST',
        monthEditState: 'LOCKED_CURRENT', isEditable: false, pmForecastAmount: 843210,
        foundationActualAmount: 900644}]},
    ]},
  };
  const balance = [
    {jobListId: 531, jobNumber: '26587', needsRebalance: true,
      forecastVersionId: 201, rebalanceVarianceAmount: -2840349,
      projectionTargetAmount: 4797757, editablePmProjectionTotal: 1957408,
      reviewStatus: PENDING_FOUNDATION, reviewLockMonth: '2026-10-01',
      reviewEvidenceState: 'MATCHED_REFRESH', reviewPrimarySnapshotId: SNAPSHOT},
    {jobListId: 529, jobNumber: '26585', needsRebalance: true,
      forecastVersionId: 213, rebalanceVarianceAmount: 57434,
      projectionTargetAmount: 3920022, editablePmProjectionTotal: 3977456,
      reviewStatus: NEEDS_REBALANCE, reviewLockMonth: '2026-10-01',
      reviewEvidenceState: 'MATCHED_REFRESH', reviewPrimarySnapshotId: SNAPSHOT},
  ];
  const visible = {
    currentProjects: current.projects,
    currentMonthly: new Map(current.monthly.items.map(item => [item.jobListId, item.items])),
    portfolioBalance: balance,
    primarySnapshotId: SNAPSHOT,
  };
  return {current, balance, visible};
}

function acceptedFixture() {
  const inputs = fixture();
  let pair = null;
  const gate = createReviewPairCoordinator({now: () => NOW,
    onChange: (_evidence, accepted) => {pair = accepted;}});
  const token = gate.begin();
  gate.offerCurrent(token, inputs.current);
  gate.offerBalance(token, inputs.balance);
  assert.equal(gate.finish(token, {successful: true}).state, REVIEW_PAIR_STATE.VERIFIED);
  assert.ok(pair);
  return {...inputs, pair, gate};
}

function choose(pair, visible, asOfUTC = NOW) {
  return resolveVisiblePortfolioReviews(pair, visible, asOfUTC);
}

test('both verified backend review statuses become the ONLY visible labels', () => {
  const {pair, visible, balance} = acceptedFixture();
  const result = choose(pair, visible);
  assert.equal(result.source, VISIBLE_REVIEW_SOURCE.VERIFIED_SERVER);
  assert.equal(result.rows.size, 2);
  assert.equal(result.rows.get('531').reviewStatus, PENDING_FOUNDATION);
  assert.equal(result.rows.get('529').reviewStatus, NEEDS_REBALANCE);
  for (const original of balance) {
    const displayed = result.rows.get(String(original.jobListId));
    assert.equal(displayed.needsRebalance, original.needsRebalance);
    assert.equal(displayed.rebalanceVarianceAmount, original.rebalanceVarianceAmount);
    assert.equal(displayed.forecastVersionId, original.forecastVersionId);
    assert.equal(displayed.projectionTargetAmount, original.projectionTargetAmount);
    assert.equal(displayed.editablePmProjectionTotal, original.editablePmProjectionTotal);
    assert.equal(displayed.reviewStatusSource, 'VERIFIED_SERVER');
    assert.equal(original.reviewStatusSource, undefined);
  }
});

test('unverified server Pending is NEVER displayed, SQL NeedsRebalance stays true', () => {
  const {visible, balance} = fixture();
  const before = structuredClone(balance);
  const result = choose(null, visible);
  assert.equal(result.source, VISIBLE_REVIEW_SOURCE.SQL_REBALANCE_FALLBACK);
  assert.deepEqual([...result.rows.values()].map(r => r.reviewStatus),
    [NEEDS_REBALANCE, NEEDS_REBALANCE]);
  assert.deepEqual(balance, before);
  assert.equal(result.rows.get('531').rebalanceVarianceAmount, -2840349);
  assert.equal(result.rows.get('529').rebalanceVarianceAmount, 57434);
  assert.equal(result.rows.get('531').reviewEvidenceState, 'MATCHED_REFRESH');
  assert.equal(result.rows.get('531').reviewStatusSource, 'SQL_REBALANCE_FALLBACK');
  assert.equal(Object.isFrozen(result.rows.get('531')), true);
});

test('balance read missing is unavailable, not a false zero or previously verified Pending', () => {
  const {pair, visible} = acceptedFixture();
  const result = choose(pair, {...visible, portfolioBalance: null});
  assert.equal(result.source, VISIBLE_REVIEW_SOURCE.BALANCE_UNAVAILABLE);
  assert.equal(result.rows.size, 0);
  assert.equal(choose(null, null).source, VISIBLE_REVIEW_SOURCE.BALANCE_UNAVAILABLE);
});

test('valid empty SQL balance is a real zero but not a certified review cohort', () => {
  const {pair, visible} = acceptedFixture();
  const result = choose(pair, {...visible, portfolioBalance: []});
  assert.equal(result.source, VISIBLE_REVIEW_SOURCE.SQL_REBALANCE_FALLBACK);
  assert.equal(result.rows.size, 0);
});

test('an incomplete or duplicate SQL row throws instead of hiding a review', () => {
  const {visible} = fixture();
  assert.throws(() => choose(null, {...visible, portfolioBalance: [
    {jobListId: 531, needsRebalance: true},
  ]}), /invalid/);
  assert.throws(() => choose(null, {...visible, portfolioBalance: [visible.portfolioBalance[0],
    visible.portfolioBalance[0]]}), /duplicate/);
});

test('new project rows cannot be paired with a prior verified server label', () => {
  const {pair, visible} = acceptedFixture();
  const changed = {...visible, currentProjects: [...visible.currentProjects]};
  assert.equal(choose(pair, changed).rows.get('531').reviewStatus, NEEDS_REBALANCE);
});

test('new balance rows cannot borrow a prior server certification', () => {
  const {pair, visible} = acceptedFixture();
  const changed = {...visible, portfolioBalance: [...visible.portfolioBalance]};
  assert.equal(choose(pair, changed).source, VISIBLE_REVIEW_SOURCE.SQL_REBALANCE_FALLBACK);
});

test('new month row refs or dropped month cannot borrow a prior certification', () => {
  const {pair, visible} = acceptedFixture();
  const monthChanged = {...visible, currentMonthly: new Map(visible.currentMonthly)};
  monthChanged.currentMonthly.set(531, [...visible.currentMonthly.get(531)]);
  assert.equal(choose(pair, monthChanged).rows.get('531').reviewStatus, NEEDS_REBALANCE);
  const monthMissing = {...visible, currentMonthly: new Map([[531, visible.currentMonthly.get(531)]])};
  assert.equal(choose(pair, monthMissing).source, VISIBLE_REVIEW_SOURCE.SQL_REBALANCE_FALLBACK);
});

test('different snapshot ID must reject a still-matching PM version', () => {
  const {pair, visible} = acceptedFixture();
  assert.equal(choose(pair, {...visible, primarySnapshotId: OTHER}).source,
    VISIBLE_REVIEW_SOURCE.SQL_REBALANCE_FALLBACK);
});

test('Arizona day-15 UTC rollover revokes Pending before the user needs to refresh', () => {
  const {pair, visible} = acceptedFixture();
  assert.equal(choose(pair, visible, BEFORE_ROLLOVER).rows.get('531').reviewStatus,
    PENDING_FOUNDATION);
  assert.equal(choose(pair, visible, AT_ROLLOVER).rows.get('531').reviewStatus,
    NEEDS_REBALANCE);
});

test('changed PM version/status invalidates certificate even when arrays keep identities', () => {
  const {pair, visible} = acceptedFixture();
  visible.currentProjects[0].latestForecastVersionId = 200;
  assert.equal(choose(pair, visible).source, VISIBLE_REVIEW_SOURCE.SQL_REBALANCE_FALLBACK);
});

test('server review changed from Pending to Needs invalidates certificate for all rows', () => {
  const {pair, visible} = acceptedFixture();
  visible.portfolioBalance[0].reviewStatus = NEEDS_REBALANCE;
  assert.equal(choose(pair, visible).source, VISIBLE_REVIEW_SOURCE.SQL_REBALANCE_FALLBACK);
});

test('a replaced cache snapshot cannot make new API Pending visible until re-certified', () => {
  const {pair, visible} = acceptedFixture();
  const next = {...visible,
    currentProjects: [...visible.currentProjects],
    portfolioBalance: [...visible.portfolioBalance],
  };
  assert.equal(choose(pair, next).source, VISIBLE_REVIEW_SOURCE.SQL_REBALANCE_FALLBACK);
  assert.equal(choose(pair, next).rows.get('531').reviewStatus, NEEDS_REBALANCE);
});

test('no network calls or SQL arithmetic in the display owner', () => {
  const helper = readFileSync(new URL('../src/acceptedReviewPair.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../src/useProjectedBillingsFreshness.js', import.meta.url), 'utf8');
  assert.match(helper, /acceptedServerReviewIndex\(pair, visible, asOfUTC\)/);
  assert.match(helper, /indexPortfolioRebalance\(visible\.portfolioBalance\)/);
  assert.doesNotMatch(helper, /fetch\s*\(|localStorage|Math\.round/);
  assert.match(app, /resolveVisiblePortfolioReviews\(acceptedReviewPair, \{/);
  assert.match(app, /const rebalanceByJobId = visibleReview\.rows/);
  assert.doesNotMatch(app, /indexedBalanceReviews\(/);
  assert.match(hook, /evidence\.state !== 'WAITING'/);
  assert.match(hook, /reviewPair\.invalidate\('INDEPENDENT_FRESH_READ'\)/);
});


test('quick no-op focus check retains only an already-certified unchanged pair', () => {
  const {gate, pair, visible} = acceptedFixture();
  const nowMs = 100_000;
  const current = {pending: false, lastSuccessAt: 91_000};
  const balance = {pending: false, lastSuccessAt: 92_000};
  assert.equal(canReuseVerifiedReviewPair(gate.evidence, current, balance,
    {maxAgeMs: 30_000}, nowMs), true);
  assert.equal(choose(pair, visible).rows.get('531').reviewStatus, PENDING_FOUNDATION);
  assert.equal(gate.evidence.state, REVIEW_PAIR_STATE.VERIFIED);
});

test('no-op optimization never certifies stale, unverified, pending or changed reads', () => {
  const {gate} = acceptedFixture();
  const recent = {pending: false, lastSuccessAt: 90_000};
  const recent2 = {pending: false, lastSuccessAt: 91_000};
  const valid = () => canReuseVerifiedReviewPair(gate.evidence, recent, recent2,
    {maxAgeMs: 30_000}, 100_000);
  assert.equal(valid(), true);
  assert.equal(canReuseVerifiedReviewPair({state: 'WAITING'}, recent, recent2,
    {maxAgeMs: 30_000}, 100_000), false);
  assert.equal(canReuseVerifiedReviewPair({state: 'UNAVAILABLE'}, recent, recent2,
    {maxAgeMs: 30_000}, 100_000), false);
  assert.equal(canReuseVerifiedReviewPair(gate.evidence, {...recent, pending: true}, recent2,
    {maxAgeMs: 30_000}, 100_000), false);
  assert.equal(canReuseVerifiedReviewPair(gate.evidence, recent, recent2,
    {maxAgeMs: 30_000}, 121_000), false);
  assert.equal(canReuseVerifiedReviewPair(gate.evidence, recent, recent2,
    {maxAgeMs: 30_000}, 95_000), true);
  assert.equal(canReuseVerifiedReviewPair(gate.evidence, recent, recent2,
    {maxAgeMs: 30_000}, 89_000), false);
  assert.equal(canReuseVerifiedReviewPair(gate.evidence, recent, recent2,
    {maxAgeMs: 0}, 100_000), false);
  assert.equal(canReuseVerifiedReviewPair(gate.evidence, recent, recent2,
    {}, 100_000), false);
  gate.invalidate('INDEPENDENT_FRESH_READ');
  assert.equal(valid(), false);
});

test('current and balance batch only skips recertification for a genuinely recent pair', () => {
  const hook = readFileSync(new URL('../src/useProjectedBillingsFreshness.js', import.meta.url), 'utf8');
  assert.match(hook, /pairAlreadyRecent = canReuseVerifiedReviewPair/);
  assert.match(hook, /pairAlreadyRecent \? null : reviewPair\.begin\('BATCH'\)/);
  assert.match(hook, /if \(reviewEpoch !== null\) reviewPair\.finish/);
  assert.match(hook, /reviewPair\.invalidate\('INDEPENDENT_FRESH_READ'\)/);
});

test('visible review labels retain existing notification, table, pivot and drawer consumers', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /reviewStatus: rebalanceByJobId\.get\(String\(row\.jobListId\)\)\?\.reviewStatus/);
  assert.match(app, /<ForecastBalanceFlag review=\{rebalanceByJobId\.get/);
  assert.match(app, /rebalanceByJobId=\{rebalanceByJobId\}/);
  assert.match(app, /review\.reviewStatus : undefined/);
  assert.match(app, /SQL_REBALANCE_FALLBACK/);
});
