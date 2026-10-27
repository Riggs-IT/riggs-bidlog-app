import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

// Render the actual components; source-string checks alone missed a previous
// all-roles Bid Log crash during a PM filter refactor.
test('both notification types render as independent full-width project actions', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true},
    appType: 'custom',
    logLevel: 'silent',
  });
  t.after(() => vite.close());
  const {default: NotificationProjectCards} = await vite.ssrLoadModule('/src/NotificationProjectCards.jsx');
  const html = renderToString(React.createElement(NotificationProjectCards, {
    forecastItems: [{
      jobListId: 20, jobNumber: '25534', jobName: 'Peopleworks',
      rebalanceVarianceAmount: -100, forecastVersionId: 3,
    }],
    originatingItems: [{
      jobListId: 21, jobNumber: '26605', jobName: 'Canyon Commerce Center',
      reviewRequired: false,
    }],
    originatingStatus: () => 'Alex Costanzo',
    currency: value => `$${Math.abs(Number(value))}`,
    onOpenForecast: () => {},
    onOpenOriginating: () => {},
  }));
  assert.equal((html.match(/class="notification-item notification-action-card"/g) || []).length, 2);
  assert.match(html, /Peopleworks/);
  assert.match(html, /Canyon Commerce Center/);
  assert.match(html, /NEEDS REBALANCE/);
  assert.match(html, /ORIGINATING BID NOT LINKED/);
  assert.match(html, /This PM Projection no longer covers/);
  assert.match(html, /View Project/);
  assert.doesNotMatch(html, /notification-originating-projects/);
});

test('project pivot renders the compact Contract label and Needs Rebalance with saved projection source unchanged', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true},
    appType: 'custom',
    logLevel: 'silent',
  });
  t.after(() => vite.close());
  const {default: ProjectBillingPivot} = await vite.ssrLoadModule('/src/ProjectBillingPivot.jsx');
  const html = renderToString(React.createElement(ProjectBillingPivot, {
    months: ['2026-10'],
    currentProjects: [{
      jobListId: 123, jobNumber: '26605', jobName: 'Canyon Commerce Center',
      pm: 'Alex Costanzo', pmInitials: 'AC', pmHexColor: '#556677',
      totalContractAmount: 9157300, originalContractAmount: 10,
      needsRebalance: true, hasPmForecast: true,
      generalContractors: [],
    }],
    bidProjects: [],
    currentMonthly: new Map(),
    bidMonthly: new Map(),
    currency: value => value == null ? '—' : `$${value}`,
    monthLabel: month => month,
    onSelectCurrentProject: () => {},
    onSelectBidProject: () => {},
    includeBids: false,
    projectionCoverage: {pm: 1, system: 0, rebalance: 1},
    portfolioBalanceAvailable: true,
    projectionSourceFilter: 'rebalance',
    onProjectionSourceFilterChange: () => {},
  }));
  assert.match(html, /Needs Rebalance/);
  const sticky = html.match(/class="project-pivot-sticky-coverage[^"]*"[\s\S]*?<\/div>/)?.[0];
  assert.ok(sticky, 'The floating header must include source filters.');
  assert.match(sticky, /1(?:<!-- -->)? Balance Reviews/);
  assert.match(sticky, /aria-pressed="true"[\s\S]*?1(?:<!-- -->)? Balance Reviews/);
  assert.doesNotMatch(sticky, /disabled=""/);
  assert.match(html, /<small>Contract<\/small>/);
  assert.match(html, /9,157,300/);
  assert.doesNotMatch(html, />\$10</);
});


test('sticky Need Rebalance is unavailable rather than falsely zero before the portfolio endpoint succeeds', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true},
    appType: 'custom',
    logLevel: 'silent',
  });
  t.after(() => vite.close());
  const {default: ProjectBillingPivot} = await vite.ssrLoadModule('/src/ProjectBillingPivot.jsx');
  const html = renderToString(React.createElement(ProjectBillingPivot, {
    months: ['2026-10'],
    currentProjects: [],
    bidProjects: [],
    currentMonthly: new Map(),
    bidMonthly: new Map(),
    currency: value => `$${value}`,
    monthLabel: month => month,
    onSelectCurrentProject: () => {},
    onSelectBidProject: () => {},
    includeActiveProjects: true,
    includeBids: false,
    projectionCoverage: {pm: 52, system: 8, rebalance: 0},
    portfolioBalanceAvailable: false,
    onProjectionSourceFilterChange: () => {},
  }));
  const sticky = html.match(/class="project-pivot-sticky-coverage[^"]*"[\s\S]*?<\/div>/)?.[0];
  assert.ok(sticky);
  assert.match(sticky, /—(?:<!-- -->)? Balance Reviews/);
  assert.match(sticky, /disabled=""/);
  assert.match(sticky, /Portfolio balance statuses are loading or unavailable/);
});

test('contract values, warning filter and Billing vs Projection are wired without redefining PM forecast math', () => {
  const app = source('App.jsx');
  const projects = source('ActiveProjectsWorkspace.jsx');
  const pivot = source('ProjectBillingPivot.jsx');
  const drawer = source('CurrentProjectBillingDrawer.jsx');
  const cards = source('NotificationProjectCards.jsx');
  assert.equal((app.match(/label="Billing vs Projection"/g) || []).length, 2);
  for (const label of ['Billed More', 'Billed Less', 'On Target']) assert.match(app, new RegExp(label));
  assert.match(app, /isBalanceReviewFilter\(value\)/);
  assert.match(app, /matchesBalanceReviewFacet\(e\.row, value\)/);
  assert.match(app, /rebalanceByJobId\.has\(String\(row\.jobListId\)\)/);
  assert.match(app, /resolveVisiblePortfolioReviews\(acceptedReviewPair, \{/);
  assert.doesNotMatch(app, /forecastAttention\.map\(item => \[String\(item\.jobListId\)/);
  assert.match(app, /onOpenForecast=\{openAttentionProject\}/);
  assert.match(app, /portfolioBalanceAvailable=\{portfolioBalance !== null\}/);
  assert.match(pivot, /projectionSourceFilter === 'rebalance'/);
  assert.match(pivot, /onProjectionSourceFilterChange\(/);
  assert.match(app, /'pm-forecast'/);
  assert.match(drawer, /rebalanceAttention &&/);
  assert.match(drawer, /jumpToBillingProjections/);
  assert.match(drawer, /Revise|PMForecastPanel/);
  assert.match(pivot, /project\.totalContractAmount/);
  assert.doesNotMatch(pivot, /project\.originalContractAmount/);
  assert.match(projects, /aValue = a\.totalContractAmount/);
  assert.match(projects, /value=\{project\.totalContractAmount\}/);
  assert.match(cards, /onClick=\{\(\) => onOpenForecast\(item\)\}/);
  // API still owns the PM-first/System Estimate fallback and SQL's rebalance decision.
  assert.match(app, /monthly\.projectedAmount/);
  assert.doesNotMatch(app, /System Estimate.*needsRebalance/);
});

test('project drawer renders the rebalance jump without granting edit access', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true},
    appType: 'custom',
    logLevel: 'silent',
  });
  t.after(() => vite.close());
  const {default: CurrentProjectBillingDrawer} = await vite.ssrLoadModule('/src/CurrentProjectBillingDrawer.jsx');
  const html = renderToString(React.createElement(CurrentProjectBillingDrawer, {
    project: {
      jobListId: 123, jobNumber: '26605', jobName: 'Canyon Commerce Center',
      totalContractAmount: 9157300, originalContractAmount: 9000000,
      projectCompleted: false, hasPmForecast: true,
    },
    user: {appRole: 'VIEWER', canEditBilling: false},
    rebalanceAttention: {jobListId: 123, rebalanceVarianceAmount: -100},
    monthlyRows: [],
    onClose: () => {},
    onEditProject: () => {},
    onAttentionChanged: () => {},
    initialProjectControl: 'pm-forecast',
  }));
  assert.match(html, /Canyon Commerce Center/);
  assert.match(html, /Needs Rebalance/);
  assert.match(html, /pm-forecast-jump-target/);
  assert.match(html, /Billing projections/);
  assert.doesNotMatch(html, />Edit Project</);
});

test('unverified balance shows neutral status while verified Needs and Pending remain distinct', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true},
    appType: 'custom',
    logLevel: 'silent',
  });
  t.after(() => vite.close());
  const {default: ForecastBalanceFlag} = await vite.ssrLoadModule('/src/ForecastBalanceFlag.jsx');
  const fallback = renderToString(React.createElement(ForecastBalanceFlag, {
    review: {jobListId: 531, needsRebalance: true, rebalanceVarianceAmount: -2840349,
      reviewStatus: 'NEEDS_REBALANCE', reviewStatusSource: 'SQL_REBALANCE_FALLBACK'},
  }));
  const verified = renderToString(React.createElement(ForecastBalanceFlag, {
    review: {jobListId: 531, needsRebalance: true, rebalanceVarianceAmount: -2840349,
      reviewStatus: 'PENDING_FOUNDATION', reviewStatusSource: 'VERIFIED_SERVER'},
  }));
  assert.match(fallback, />Needs Rebalance</);
  assert.doesNotMatch(fallback, /Verifying Balance|review-verifying-flag/);
  assert.match(fallback, /PM Projection Out of Balance/);
  assert.doesNotMatch(fallback, /pending-foundation-flag/);
  const verifiedNeeds = renderToString(React.createElement(ForecastBalanceFlag, {
    review: {jobListId: 531, needsRebalance: true, rebalanceVarianceAmount: -2840349,
      reviewStatus: 'NEEDS_REBALANCE', reviewStatusSource: 'VERIFIED_SERVER'},
  }));
  assert.match(verifiedNeeds, />Needs Rebalance</);
  assert.doesNotMatch(verifiedNeeds, /review-verifying-flag|pending-foundation-flag/);
  assert.match(verified, /Pending Foundation/);
  assert.match(verified, /pending-foundation-flag/);
});
