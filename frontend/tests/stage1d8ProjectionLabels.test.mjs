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

test('coverage and projection copy do not promote system estimate wording', () => {
  const app = read('App.jsx');
  const panel = read('PMForecastPanel.jsx');
  assert.match(app, /Missing\*/);
  assert.match(panel, /Projection total must stay balanced/);
  assert.match(panel, /total equal to the project's overall projection amount/);
  assert.doesNotMatch(panel, /keep their total equal to the system estimate/);
});

test('billing variance is current-month Foundation billing minus the selected projection source', () => {
  const drawer = read('CurrentProjectBillingDrawer.jsx');
  assert.match(drawer, /Monthly Billing Variance/);
  assert.match(drawer, /Foundation Billing − \$\{varianceProjectionSource\} for the current month/);
  assert.match(drawer, /varianceMonthRow\?\.actualAmount/);
  assert.match(drawer, /varianceMonthRow\?\.projectedAmount/);
  assert.match(drawer, /project\?\.hasPmForecast/);
  assert.match(drawer, /'PM Projection'/);
  assert.match(drawer, /'System Baseline'/);
  assert.doesNotMatch(drawer, /Actual to date − Projected to date/);
});
