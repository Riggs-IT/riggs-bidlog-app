import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

const read = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('completed directory defaults to Foundation and explains original/CO in tooltip', () => {
  const page = read('ProjectAccountability.jsx');
  const commercial = read('completedCommercial.js');
  assert.match(page, /title=\{completedContractTooltip\(row, \{includeSources: isAdmin\}\)\}/);
  assert.match(page, /tooltip=\{completedPortfolioContractTooltip\(metrics\)\}/);
  assert.match(page, /row\.totalContractSource === 'COGNITO_FALLBACK'/);
  assert.match(commercial, /source === 'FOUNDATION_REVISED'\) return 'Foundation'/);
  assert.match(commercial, /source === 'COGNITO_FALLBACK'\) return 'Ops fallback/);
  assert.doesNotMatch(page, /completed-contract-composition|recorded CO events/);
  assert.match(page, /OPERATIONS:\s*'Ops'/);
  const drawer = read('CompletedProjectBillingDrawer.jsx');
  assert.match(drawer, /OPERATIONS_ANTICIPATED_START:\s*'Ops'/);
  assert.match(drawer, /OPERATIONS_COMPLETION:\s*'Ops'/);
});

test('completed monthly history prefetches on entering Directory and shares one bounded cache', () => {
  const controller = read('CompletedMonthlyHistory.jsx');
  assert.match(controller, /useEffect\(\(\) => \{\s*void loadRange\(\)/);
  assert.match(controller, /cache = useRef\(new Map\(\)\)/);
  assert.match(controller, /inFlight = useRef\(null\)/);
  assert.match(controller, /inFlight\.current\?\.key === rangeKey/);
  assert.match(controller, /cache\.current\.size > 4/);
  assert.match(controller, /refresh: \(\) => loadRange\(true\)/);
  assert.doesNotMatch(controller, /Refresh History|refreshVersion/);
  assert.match(controller, /view !== 'directory'/);
  assert.match(controller, /<ProjectBillingPivot[\s\S]*?completedHistoryMode/);
  assert.match(controller, /method: 'GET'/);
  assert.doesNotMatch(controller, /method:\s*['"](?:POST|PUT|PATCH|DELETE)/);
});

test('top-banner completed Refresh invokes directory and month reads and keeps auth scope', () => {
  const page = read('ProjectAccountability.jsx');
  const app = read('App.jsx');
  assert.match(page, /Promise\.allSettled\(\[\s*loadCompletedProjects\(\{forceRefresh: true\}\),\s*completedHistoryRefreshRef\.current\?\.refresh\(\)/);
  assert.match(page, /refreshApiRef=\{completedHistoryRefreshRef\}/);
  assert.match(page, /key=\{`\$\{user\?\.eid.*?user\?\.appRole/);
  assert.match(app, /page === 'accountability' \? completedRefreshRef/);
  assert.doesNotMatch(page, /completedRefreshVersion/);
});

test('historical All mode contains actual and authorized margin, never a forecast', async t => {
  const pivot = read('ProjectBillingPivot.jsx');
  assert.match(pivot, /COMPLETED_VALUE_TRACKS = ALL_VALUE_TRACKS\.filter/);
  assert.match(pivot, /completedHistoryMode \? 'pivot-history-only'/);
  assert.match(read('styles.css'), /pivot-metric-all\.pivot-history-only \.pivot-billing-amounts/);
  assert.match(pivot, /track\.key === 'actual' \|\| track\.key === 'marginCollected'/);
  assert.match(pivot, /completedHistoryMode[\s\S]*?metric\.key === 'actual'[\s\S]*?metric\.key === 'all'/);
  assert.match(pivot, /completedHistoryMode \? \(cell\?\.actual \?\? null\)/);
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent',
  });
  t.after(() => vite.close());
  const {HeaderTotal, HeaderMetricRail} = await vite.ssrLoadModule('/src/ProjectBillingPivot.jsx');
  const render = (element) => renderToString(element).replaceAll('<!-- -->', '');
  // HeaderTotal receives this formatter from CompletedMonthlyHistory in the
  // running app. The standalone render fixture must provide the same prop.
  const currency = value => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(value);
  assert.match(read('CompletedMonthlyHistory.jsx'), /currency=\{currency\}/);
  const forAdmin = render(React.createElement(HeaderTotal, {
    label: 'Total', metric: 'all', currency, completedHistoryMode: true, showMargin: true,
    actualValue: 700, marginCollectedValue: 80,
    projectedValue: 999999, varianceValue: 12345,
    includeProjectProjection: true, includeBidProjection: false,
  }));
  assert.match(forAdmin, /\$700/);
  assert.match(forAdmin, /\$80/);
  assert.doesNotMatch(forAdmin, /\$999,999|\$12,345|System Estimate/);
  const noMargin = render(React.createElement(HeaderTotal, {
    label: 'Total', metric: 'all', currency, completedHistoryMode: true, showMargin: false,
    actualValue: 700, marginCollectedValue: 80,
  }));
  assert.match(noMargin, /\$700/);
  assert.doesNotMatch(noMargin, /\$80|Margin Collected/);
  const incomplete = render(React.createElement(HeaderTotal, {
    label: 'Total', metric: 'all', currency, completedHistoryMode: true, showMargin: true,
    actualValue: 700, marginCollectedValue: null,
  }));
  assert.match(incomplete, /Margin Collected unavailable or incomplete/);
  assert.doesNotMatch(incomplete, /\$0/);
  const labels = render(React.createElement(HeaderMetricRail, {
    completedHistoryMode: true, showMargin: true, compact: false,
  }));
  assert.match(labels, /Actual/);
  assert.match(labels, /Margin Collected/);
  assert.doesNotMatch(labels, /Projected|Variance/);
});
