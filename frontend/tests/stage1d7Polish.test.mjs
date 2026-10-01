import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('overview no longer exposes baseline comparison control', () => {
  const source = read('App.jsx');
  assert.doesNotMatch(source, /showOverviewBaseline/);
  assert.doesNotMatch(source, /Compare with System Baseline/);
  assert.match(source, /\{projectionCoverage\.pm\} PM Projection/);
  assert.match(source, /\{projectionCoverage\.system\} Missing\*/);
});

test('projection balance copy explains the actual current save rule plainly', () => {
  const source = read('PMForecastPanel.jsx');
  assert.match(source, /Projection total must stay balanced/);
  assert.match(source, /Move dollars between editable months, but keep their total equal to the project's overall projection amount\./);
  assert.doesNotMatch(source, /keep their total equal to the system estimate/);
});

test('billing variance exposes the exact current-month comparison only in its tooltip', () => {
  const source = read('CurrentProjectBillingDrawer.jsx');
  assert.match(source, /Monthly Billing Variance/);
  assert.match(source, /Foundation Billing − \$\{varianceProjectionSource\} for the current month/);
  assert.doesNotMatch(source, /Actual to date − Projected to date/);
  assert.doesNotMatch(source, /<small>\s*vs /);
});

test('topbar controls use matched button sizing and no fixed-width user spacer', () => {
  const controls = read('ViewControls.css');
  const styles = read('styles.css');
  assert.match(controls, /\.topbar-actions \.refresh-icon-button \{width:40px;min-height:38px;/);
  assert.match(styles, /\.current-user \{\n  min-width: 0;\n  margin-left: 4px;/);
});
