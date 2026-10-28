import { readSource } from './helpers/readSource.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = file => readSource(new URL(`../src/${file}`, import.meta.url), 'utf8');

test('manual refresh uses one page-scoped progress/result toast, never background polling', () => {
  const app = source('App.jsx');
  assert.match(app, /setWorkspaceRefreshFeedback\(\{page, message: DATA_UPDATING_MESSAGE, type: 'progress'\}\)/);
  assert.match(app, /await ref\.current\.refresh\(\)/);
  assert.match(app, /activePageRef\.current === page/);
  assert.match(app, /result === true \? \{/);
  assert.match(app, /DATA_REFRESH_FAILED_MESSAGE, type: 'error'/);
  assert.match(app, /setWorkspaceRefreshFeedback\(null\)/);
  assert.match(app, /activePageRef\.current === 'projected'/);
  assert.match(app, /workspaceRefreshFeedback\?\.page === activePage/);
  assert.match(app, /role=\{\(\(activePage === 'projected'/);
  assert.doesNotMatch(app, /Some data may be out of date/);
});

test('projected manual rebuild shows progress immediately and only asserts success after fresh datasets', () => {
  const hook = source('useProjectedBillingsFreshness.js');
  const start = hook.indexOf('const refreshAll = async () =>');
  const end = hook.indexOf('return { state, usable', start);
  assert.ok(start > 0 && end > start);
  const manual = hook.slice(start, end);
  const firstProgress = manual.indexOf('onRefreshNotice?.(DATA_UPDATING_MESSAGE)');
  const firstPost = manual.indexOf("'/api/projected-billings/dashboard-cache/refresh'");
  assert.ok(firstProgress > 0 && firstPost > firstProgress);
  assert.match(manual, /hasFreshPortfolioSnapshot\(results\)/);
  assert.match(manual, /onRefreshNotice\?\.\(DATA_REFRESH_FAILED_MESSAGE\)/);
  assert.match(manual, /isRefreshCooldown\(error\)/);
  // Preserve exact review-pair evidence gates and no bypassed SQL paths.
  assert.match(manual, /reviewPair\.finish\(reviewEpoch/);
  assert.match(manual, /progressive\.finish\(status, updateCacheStatus\)/);
  assert.match(manual, /No fresh=true SQL bypass/);
});

test('manual page refresh returns genuine reader outcomes, preserving old data on failure', () => {
  const bid = source('BidLogWorkspace.jsx');
  const projects = source('ActiveProjectsWorkspace.jsx');
  const completed = source('ProjectAccountability.jsx');
  const admin = source('AdministrationDashboard.jsx');
  assert.match(bid, /const refreshed = await refreshCurrentBidView\(\)/);
  assert.match(bid, /throw refreshError/);
  assert.doesNotMatch(bid.slice(bid.indexOf('async function refreshCurrentBidView'),
    bid.indexOf('function rowIdentity')), /showActionToast/);
  assert.match(projects, /results\.slice\(0, showCompleted \? 2 : 1\)\.some\(result => result !== true\)/);
  assert.match(completed, /await Promise\.allSettled\(\[/);
  assert.match(completed, /monthly\.status !== 'fulfilled'/);
  assert.match(admin, /if \(updated !== true\) throw new Error/);
  assert.doesNotMatch(admin, /if \(!automatic\) setOverview\(null\)/);
});

test('toast and loading spinner are accessible, scoped, and honor reduced motion', () => {
  const app = source('App.jsx');
  const css = source('styles.css');
  const controls = source('ViewControls.css');
  assert.match(app, /className=\{`action-toast refresh-feedback/);
  assert.match(app, /refresh-toast-indicator/);
  assert.match(css, /\.refresh-toast-indicator\.is-progress/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(controls, /\.refresh-icon-button\.is-refreshing svg/);
  assert.match(source('ViewControls.jsx'), /aria-busy=\{busy\}/);
});
