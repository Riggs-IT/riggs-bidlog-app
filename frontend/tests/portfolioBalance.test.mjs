import test from 'node:test';
import assert from 'node:assert/strict';
import {indexPortfolioRebalance} from '../src/portfolioBalance.js';
import {readFileSync} from 'node:fs';

const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('portfolio imbalance belongs to project, not signed-in notification recipient', () => {
  const rows = [
    {jobListId: 435, jobNumber: '25534', needsRebalance: true, rebalanceVarianceAmount: 2755610},
    {jobListId: 483, jobNumber: '25547', needsRebalance: true, rebalanceVarianceAmount: -21237.01},
  ];
  const index = indexPortfolioRebalance(rows);
  assert.equal(index.size, 2);
  assert.equal(index.get('435').rebalanceVarianceAmount, 2755610);
  assert.equal(index.get('483').rebalanceVarianceAmount, -21237.01);
  assert.match(source('useProjectedBillingsFreshness.js'), /pm-forecast\/portfolio-balance/);
  assert.match(source('App.jsx'), /indexedBalanceReviews\(portfolioBalance \|\| \[\], currentProjects, currentMonthly, varianceAsOfUTC\)/);
  assert.doesNotMatch(source('App.jsx'), /forecastAttention\.map\(item => \[String\(item\.jobListId\)/);
});

test('invalid or missing portfolio statuses do not masquerade as zero', () => {
  assert.throws(() => indexPortfolioRebalance(null), /not a list/);
  assert.throws(() => indexPortfolioRebalance({items: []}), /not a list/);
  assert.throws(() => indexPortfolioRebalance([{jobListId: 435}]), /invalid/);
  assert.throws(() => indexPortfolioRebalance([
    {jobListId: 435, needsRebalance: true, rebalanceVarianceAmount: 10},
    {jobListId: 435, needsRebalance: true, rebalanceVarianceAmount: 10},
  ]), /duplicate/);
  assert.equal(indexPortfolioRebalance([]).size, 0);
  assert.match(source('App.jsx'), /portfolioBalance === null \? '—' : projectionCoverage\.rebalance/);
});
