import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {indexPortfolioRebalance, balanceReviewLabel,
  PENDING_FOUNDATION, NEEDS_REBALANCE} from '../src/portfolioBalance.js';

const source = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

test('one verified API status produces the same label on all surfaces', () => {
  assert.equal(balanceReviewLabel({reviewStatus: PENDING_FOUNDATION}), 'Pending Foundation');
  assert.equal(balanceReviewLabel({reviewStatus: NEEDS_REBALANCE}), 'Needs Rebalance');
  const app = source('App.jsx');
  const pivot = source('ProjectBillingPivot.jsx');
  const directory = source('ActiveProjectsWorkspace.jsx');
  const drawer = source('CurrentProjectBillingDrawer.jsx');
  const notif = source('NotificationProjectCards.jsx');
  const flag = source('ForecastBalanceFlag.jsx');
  assert.match(app, /resolveVisiblePortfolioReviews\(acceptedReviewPair, \{/);
  for (const text of [app, pivot, directory, drawer]) assert.match(text, /ForecastBalanceFlag/);
  assert.match(notif, /PENDING FOUNDATION/);
  assert.match(notif, /NEEDS REBALANCE/);
  assert.match(flag, /Pending Foundation|balanceReviewLabel/);
});

test('SQL authoritative financial rows are not changed by the display helpers', () => {
  const row = {jobListId: 10, needsRebalance: true, rebalanceVarianceAmount: -1000,
    reviewStatus: PENDING_FOUNDATION};
  const values = indexPortfolioRebalance([row]);
  assert.strictEqual(values.get('10'), row);
  assert.equal(values.get('10').rebalanceVarianceAmount, -1000);
  assert.equal(values.get('10').needsRebalance, true);
  assert.doesNotMatch(source('portfolioBalance.js'), /balanceReviewStatus\s*\(|pmForecastAmount|foundationActualAmount|fetch\(|execute\(/);
});
