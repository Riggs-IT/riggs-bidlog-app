import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  balanceReviewStatus, balanceReviewLabel, indexedBalanceReviews,
  PENDING_FOUNDATION, NEEDS_REBALANCE,
} from '../src/portfolioBalance.js';

const forecast = {jobListId: 10, needsRebalance: true, forecastVersionId: 7, rebalanceVarianceAmount: -1000};
const project = {jobListId: 10, hasPmForecast: true, latestForecastVersionId: 7, latestForecastVersionType: 'PM_SUBMISSION'};
const month = {monthStart: '2026-10-01', pmForecastAmount: 1000, foundationActualAmount: 0,
  primaryProjectionSource: 'PM_FORECAST', latestForecastVersionId: 7,
  hasPmForecast: true, isEditable: false, monthEditState: 'LOCKED_CURRENT'};
const oct15 = '2026-10-15T17:00:00Z';
const source = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

test('day 15 Arizona: only the isolated locked PM shortfall becomes Pending Foundation', () => {
  assert.equal(balanceReviewStatus(forecast, project, [month], oct15), PENDING_FOUNDATION);
  assert.equal(balanceReviewLabel({reviewStatus: PENDING_FOUNDATION}), 'Pending Foundation');
  assert.equal(balanceReviewLabel({reviewStatus: NEEDS_REBALANCE}), 'Needs Rebalance');
  // Partial actual billings: only the exact remaining shortfall is provisional.
  assert.equal(balanceReviewStatus({...forecast, rebalanceVarianceAmount: -700}, project,
    [{...month, foundationActualAmount: 300}], oct15), PENDING_FOUNDATION);
});

test('unrelated prior imbalance is never disguised as pending', () => {
  assert.equal(balanceReviewStatus({...forecast, rebalanceVarianceAmount: -999}, project, [month], oct15), NEEDS_REBALANCE);
  assert.equal(balanceReviewStatus({...forecast, rebalanceVarianceAmount: 50}, project, [month], oct15), NEEDS_REBALANCE);
  assert.equal(balanceReviewStatus({...forecast, rebalanceVarianceAmount: -1000}, project,
    [{...month, foundationActualAmount: 1000}], oct15), NEEDS_REBALANCE);
  assert.equal(balanceReviewStatus({...forecast, rebalanceVarianceAmount: -1000}, project,
    [{...month, foundationActualAmount: -20}], oct15), NEEDS_REBALANCE);
});

test('stale versions and administrator corrections keep Needs Rebalance', () => {
  assert.equal(balanceReviewStatus({...forecast, forecastVersionId: 8}, project, [month], oct15), NEEDS_REBALANCE);
  assert.equal(balanceReviewStatus(forecast, {...project, latestForecastVersionType: 'ADMIN_CORRECTION'}, [month], oct15), NEEDS_REBALANCE);
  assert.equal(balanceReviewStatus(forecast, {...project, hasPmForecast: false}, [month], oct15), NEEDS_REBALANCE);
  assert.equal(balanceReviewStatus(forecast, null, [month], oct15), NEEDS_REBALANCE);
  assert.equal(balanceReviewStatus(forecast, project, null, oct15), NEEDS_REBALANCE);
  assert.equal(balanceReviewStatus({...forecast, needsRebalance: false}, project, [month], oct15), null);
});

test('recent-month window ends at next day-15, no permanent masking of gaps', () => {
  assert.equal(balanceReviewStatus(forecast, project, [month], '2026-11-01T17:00:00Z'), PENDING_FOUNDATION);
  assert.equal(balanceReviewStatus(forecast, project, [month], '2026-11-15T17:00:00Z'), NEEDS_REBALANCE);
  assert.equal(balanceReviewStatus(forecast, project, [month], '2026-10-14T17:00:00Z'), NEEDS_REBALANCE);
  assert.equal(balanceReviewStatus(forecast, project, [{...month, latestForecastVersionId: 8}], oct15), NEEDS_REBALANCE);
  assert.equal(balanceReviewStatus(forecast, project, [{...month, primaryProjectionSource: 'SYSTEM_BASELINE'}], oct15), NEEDS_REBALANCE);
  assert.equal(balanceReviewStatus(forecast, project, [{...month, isEditable: true}], oct15), NEEDS_REBALANCE);
  assert.equal(balanceReviewStatus(forecast, project, [{...month, monthEditState: 'EDITABLE_CURRENT'}], oct15), NEEDS_REBALANCE);
});

test('portfolio index retains authoritative SQL flags and amount, annotates only presentation', () => {
  const result = indexedBalanceReviews([forecast, {...forecast, jobListId: 11, rebalanceVarianceAmount: -500}],
    [project], new Map([[10, [month]]]), oct15);
  assert.equal(result.size, 2);
  assert.equal(result.get('10').needsRebalance, true);
  assert.equal(result.get('10').rebalanceVarianceAmount, -1000);
  assert.equal(result.get('10').reviewStatus, PENDING_FOUNDATION);
  assert.equal(result.get('11').reviewStatus, NEEDS_REBALANCE);
});

test('presentation has one consistent status across all surfaces; cache and SQL untouched', () => {
  const app = source('App.jsx');
  const pivot = source('ProjectBillingPivot.jsx');
  const directory = source('ActiveProjectsWorkspace.jsx');
  const drawer = source('CurrentProjectBillingDrawer.jsx');
  const notif = source('NotificationProjectCards.jsx');
  const flag = source('ForecastBalanceFlag.jsx');
  assert.match(app, /indexedBalanceReviews\(portfolioBalance \|\| \[\], currentProjects, currentMonthly, varianceAsOfUTC\)/);
  for (const text of [app, pivot, directory, drawer]) assert.match(text, /ForecastBalanceFlag/);
  assert.match(notif, /PENDING FOUNDATION/);
  assert.match(notif, /NEEDS REBALANCE/);
  assert.match(flag, /Pending Foundation|balanceReviewLabel/);
  assert.doesNotMatch(source('portfolioBalance.js'), /fetch\(|execute\(/);
});
