import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import {PENDING_FOUNDATION} from '../src/portfolioBalance.js';
import {BALANCE_REVIEW_FILTER} from '../src/balanceReviewQuickFilter.js';

test('actual status badge and by-project controls render with selected accessible state', async t => {
  const vite = await createServer({root:fileURLToPath(new URL('../',import.meta.url)),
    server:{middlewareMode:true},appType:'custom',logLevel:'silent'});
  t.after(() => vite.close());
  const {default: ForecastBalanceFlag} = await vite.ssrLoadModule('/src/ForecastBalanceFlag.jsx');
  const {default: ProjectBillingPivot} = await vite.ssrLoadModule('/src/ProjectBillingPivot.jsx');
  const badge = renderToString(React.createElement(ForecastBalanceFlag, {
    review: {reviewStatus:PENDING_FOUNDATION, reviewStatusSource:'VERIFIED_SERVER'},
    onClick:()=>{}, onQuickFilter:()=>{}, selectedQuickFilter:BALANCE_REVIEW_FILTER.PENDING_ONLY,
  }));
  assert.match(badge, /aria-pressed="true"/);
  assert.match(badge, /balance-review-quick-selected/);
  assert.match(badge, /Double-click or press Enter\/Space/);
  const pivot = renderToString(React.createElement(ProjectBillingPivot, {
    months: ['2026-10'],
    currentProjects: [{jobListId:1,jobNumber:'25547',jobName:'Test reviewed project',
      pm:'Alex',needsRebalance:true,hasPmForecast:true,
      reviewStatus:PENDING_FOUNDATION,reviewStatusSource:'VERIFIED_SERVER'}],
    bidProjects: [],currentMonthly:new Map(),bidMonthly:new Map(),
    currency:value=>'$'+value,monthLabel:m=>m,
    onSelectCurrentProject:()=>{},includeBids:false,
    projectionCoverage:{pm:1,system:0,rebalance:1},portfolioBalanceAvailable:true,
    projectionSourceFilter:BALANCE_REVIEW_FILTER.PENDING_ONLY,
    onProjectionSourceFilterChange:()=>{},onBalanceReviewQuickFilter:()=>{},
  }));
  assert.match(pivot, /Pending Foundation/);
  assert.match(pivot, /balance-review-quick-selected/);
  const sticky = pivot.match(/class="project-pivot-sticky-coverage[^\"]*"[\s\S]*?<\/div>/)?.[0];
  assert.match(sticky, /aria-pressed="true"[\s\S]*?Balance Reviews/);
});

test('App connects its single facet and all three displayed badge/toolbar surfaces', () => {
  const app = readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const pivot = readFileSync(new URL('../src/ProjectBillingPivot.jsx',import.meta.url),'utf8');
  assert.match(app, /reviewStatusSource: rebalanceByJobId\.get/);
  assert.match(app, /balanceReviewFacetValues\(e\.row\)/);
  assert.match(app, /matchesBalanceReviewFacet\(e\.row, value\)/);
  assert.equal((app.match(/onQuickFilter=\{status => setProjectionSourceFilter/g)||[]).length, 2);
  assert.match(app, /onBalanceReviewQuickFilter=\{status => setProjectionSourceFilter/);
  assert.match(pivot, /onBalanceReviewQuickFilter=\{onBalanceReviewQuickFilter\}/);
  assert.match(app, /setProjectionSourceFilter\(ALL\)/); // Reset all filters
});

// Legacy clickable badges retain their original event handlers.
test('legacy badges keep direct click and keyboard handlers outside quick filtering', () => {
  const source = readFileSync(new URL('../src/ForecastBalanceFlag.jsx', import.meta.url), 'utf8');
  assert.match(source, /onClick=\{onQuickFilter \? interactions\.click : onClick\}/);
  assert.match(source, /onDoubleClick=\{onQuickFilter \? interactions\.doubleClick : undefined\}/);
  assert.match(source, /onKeyDown=\{onQuickFilter \? interactions\.keyDown : event => event\.stopPropagation\(\)\}/);
});
