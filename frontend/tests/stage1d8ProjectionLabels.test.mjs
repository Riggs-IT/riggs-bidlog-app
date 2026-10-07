import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('system estimates use a project-name marker instead of source badges or value stars', () => {
  const display = read('ProjectionDisplay.jsx');
  const pivot = read('ProjectBillingPivot.jsx');
  const app = read('App.jsx');
  assert.match(display, /ProjectionEstimateMarker/);
  assert.match(display, /No PM Projection submitted; projected values use the System Estimate/);
  assert.doesNotMatch(display, /ProjectionSource/);
  assert.doesNotMatch(display, /estimate &&/);
  assert.match(pivot, /<ProjectionEstimateMarker project=\{row\.raw\} \/>/);
  assert.doesNotMatch(pivot, /System Baseline estimate/);
  assert.match(app, /<ProjectionEstimateMarker project=\{detail\.raw\} \/>/);
  assert.match(app, /<ProjectionEstimateMarker project=\{row\.raw\} \/>/);
  assert.doesNotMatch(app, /<ProjectionSource/);
});

test('projection coverage counts are low-key source filters with all as the shared state', () => {
  const app = read('App.jsx');
  assert.match(app, /projectionSourceFilter/);
  assert.match(app, /projectionSource:\{values:e=>e\.kind==='current'\?\[e\.row\.hasPmForecast\?'pm':'missing'\]:\[\]/);
  assert.match(app, /matches:\(e,value\)=>e\.kind!=='current'/);
  assert.match(app, /projection-source-count-toggle/);
  assert.match(app, /\{projectionCoverage\.pm\} PM Projection/);
  assert.match(app, /\{projectionCoverage\.system\} Missing\*/);
  assert.match(app, /projectionSourceFilter === ALL \|\| projectionSourceFilter === 'pm'/);
  assert.match(app, /projectionSourceFilter === ALL \|\| projectionSourceFilter === 'missing'/);
  assert.match(app, /setProjectionSourceFilter\(value => value === 'pm' \? ALL : 'pm'\)/);
  assert.match(app, /setProjectionSourceFilter\(value => value === 'missing' \? ALL : 'missing'\)/);
  assert.doesNotMatch(app, />\s*PM only\s*</);
});

test('projection balance copy uses remaining-contract language instead of baseline matching', () => {
  const app = read('App.jsx');
  const panel = read('PMForecastPanel.jsx');
  assert.match(app, /Missing\*/);
  assert.match(panel, /Projection must cover remaining contract/);
  assert.match(panel, /remaining contract after locked Foundation billings/);
  assert.doesNotMatch(panel, /PM Projection total must equal the editable system estimate total/);
});

test('billing variance is current-month Foundation billing minus the selected projection source', () => {
  const drawer = read('CurrentProjectBillingDrawer.jsx');
  assert.match(drawer, /Monthly Billing Variance/);
  assert.match(drawer, /Foundation Billing − \$\{varianceProjectionSource\} for the current month/);
  assert.match(drawer, /varianceMonthRow\?\.actualAmount/);
  assert.match(drawer, /varianceMonthRow\?\.projectedAmount/);
  assert.match(drawer, /project\?\.hasPmForecast/);
  assert.match(drawer, /'PM Projection'/);
  assert.match(drawer, /'System Estimate'/);
  assert.doesNotMatch(drawer, /Actual to date − Projected to date/);
});


test('contract drawer uses approved CO income and current contract wording', () => {
  const drawer = read('CurrentProjectBillingDrawer.jsx');
  const changeOrders = read('ChangeOrdersPanel.jsx');
  assert.match(drawer, /Approved Change Orders/);
  assert.match(drawer, /project\.approvedChangeOrderAmount/);
  assert.match(drawer, /Total Contract/);
  assert.match(drawer, /project\.totalContractAmount/);
  assert.match(drawer, /Contract Remaining/);
  assert.match(drawer, /project\.contractRemainingAmount/);
  assert.doesNotMatch(drawer, /Net Cost Adjustment/);
  assert.match(changeOrders, /Approved CO Total/);
  assert.match(changeOrders, /data\.approvedChangeOrderAmount/);
  assert.match(changeOrders, /item\.incomeAdjustment/);
  assert.doesNotMatch(changeOrders, /data\.netCostAdjustment/);
});

test('existing PM blanks stay blank and PM balance uses remaining contract target', () => {
  const panel = read('PMForecastPanel.jsx');
  assert.match(panel, /forecast\?\.hasPmForecast\s*\? row\.savedPm/);
  assert.match(panel, /initialValue === null\s*\? ''/);
  assert.match(panel, /forecast\?\.projectionTargetAmount/);
  assert.match(panel, /Remaining Contract to Project/);
  assert.match(panel, /Still to Project/);
  assert.match(panel, /Over Contract/);
  assert.match(panel, /System Estimate Reference/);
  assert.match(panel, /intentionally blank PM months may stay blank/);
});
