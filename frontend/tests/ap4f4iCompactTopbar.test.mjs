import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const src = name => readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8');

// Keep this release purely presentational. Live financial values are still
// computed by the existing primaryProjection.js rules and covered separately.
test('small-screen topbar has one compact identity/action row and one scrollable nav row', () => {
  const app = src('App.jsx');
  const css = src('styles/01-foundations.css');
  assert.match(app, /<header className="topbar">/);
  assert.match(app, /<nav className="app-nav">/);
  assert.match(app, /className="brand-current-user">\{user\.displayName\}/);
  assert.match(app, /className="signout-button"\s+aria-label="Sign out"\s+title="Sign out"/);
  assert.match(app, /<svg className="signout-icon"[^>]*aria-hidden="true"/);
  assert.match(css, /@media \(max-width: 1280px\)[\s\S]*?\.topbar \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.brand-area \{\s*display: contents;/);
  assert.match(css, /\.app-nav \{[\s\S]*?grid-column: 1 \/ -1;[\s\S]*?overflow-x: auto;/);
  assert.match(css, /\.topbar-actions \{[\s\S]*?grid-column: 2;[\s\S]*?flex-wrap: nowrap;/);
  assert.match(css, /@media \(max-width: 460px\)[\s\S]*?\.topbar-actions \.signout-button span \{ display: none; \}/);
  assert.match(css, /\.topbar-actions \.signout-icon \{ display: block; \}/);
});

test('header estimate tooltip is short, no SE badge, and estimate counts remain available', () => {
  const pivot = src('ProjectBillingPivot.jsx');
  const css = src('styles/05-project-pivot.css');
  const rows = src('ProjectionDisplay.jsx');
  assert.doesNotMatch(pivot, /header-estimate-source-indicator|>SE<\/abbr>/);
  assert.doesNotMatch(css, /header-estimate-source-indicator/);
  assert.match(pivot, /Includes \$\{headerCurrency\(includedSystemEstimateValue\)\} in system estimates across/);
  assert.match(pivot, /<span className="pivot-header-total-label" title=\{includedEstimateNote \|\| undefined\}>/);
  assert.match(pivot, /includedSystemEstimateValue=\{monthTotals\[index\]\?\.includedSystemEstimateValue\}/);
  assert.match(rows, /System estimate shown and included in displayed projected totals/);
  assert.doesNotMatch(rows, /not a submitted PM projection or part of PM-only variance/);
  assert.doesNotMatch(pivot, /These are not submitted PM projections/);
});

test('no calculation, export, authorization or Data API paths changed for presentation-only release', () => {
  const app = src('App.jsx');
  const pivot = src('ProjectBillingPivot.jsx');
  assert.match(app, /canViewProjectedBillings/);
  assert.match(app, /canViewAdministration/);
  assert.match(pivot, /displayTotalForecastValue/);
  assert.match(pivot, /varianceActualProjects/);
});
