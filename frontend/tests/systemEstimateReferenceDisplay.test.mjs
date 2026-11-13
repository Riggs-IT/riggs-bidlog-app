import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {pivotCurrentCell, pivotTotals, completedProjectPivotCell,
  buildMonthlyProjectionExport} from '../src/primaryProjection.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = name => readFileSync(path.resolve(here, '../src', name), 'utf8');

test('No-PM estimate becomes a display-only header total, not a PM amount or variance', () => {
  const row = {primaryProjectionSource:'SYSTEM_BASELINE', hasPmForecast:false,
    systemBaselineAmount:456.78, pmForecastAmount:null, actualAmount:123.45};
  const cell = pivotCurrentCell(row, '2026-11');
  assert.equal(cell.baseline, 456.78);
  assert.equal(cell.isSystemEstimate, true);
  assert.equal(cell.projected, null);
  assert.equal(cell.variance, null);
  const totals = pivotTotals([{source:'current', cells:[cell]}], 0, 'projected', false);
  assert.equal(totals.projectedValue, null);
  assert.equal(totals.baselineValue, 456.78);
  assert.equal(totals.displayProjectedValue, 456.78);
  assert.equal(totals.value, 456.78);
  assert.equal(totals.includedSystemEstimateValue, 456.78);
  assert.equal(totals.activeProjectsProjected, 0);
  assert.equal(totals.displayActiveProjectsProjected, 1);
  assert.equal(totals.varianceValue, null);
});

test('A valid zero system estimate is not treated as missing', () => {
  const cell = pivotCurrentCell({primaryProjectionSource:'SYSTEM_BASELINE', hasPmForecast:false,
    systemBaselineAmount:0, pmForecastAmount:null, actualAmount:null}, '2026-11');
  assert.equal(cell.baseline, 0);
  assert.equal(cell.projected, null);
});

test('Completed history remains actual-only', () => {
  const cell = completedProjectPivotCell({actualAmount:150, marginCollected:10}, '2026-11');
  assert.equal(cell.baseline, null);
  assert.equal(cell.projected, null);
  assert.equal(cell.actual, 150);
});

test('The visual fallback never replaces the canonical primaryProjection API values', () => {
  const source = read('primaryProjection.js');
  assert.match(source, /projectedAmount: meta\.hasPmForecast \? nullableAmount\(m\.pmForecastAmount\) : null/);
  assert.match(source, /'Primary Projected Amount': submittedPmAmount\(m\)/);
  assert.match(source, /'System Estimate Amount': own\(m, 'systemBaselineAmount'\)/);
  const presentation = read('ProjectionDisplay.jsx');
  assert.match(presentation, /showSystemFallback = false/);
  assert.match(presentation, /showSystemFallback && !hasPmValue && baseline !== null && baseline !== undefined/);
  assert.match(presentation, /System estimate shown and included in displayed projected totals/);
  assert.doesNotMatch(presentation, /not a submitted PM projection/i);
});

test('The existing pivot All/Projected cells display only verified system references', () => {
  const pivot = read('ProjectBillingPivot.jsx');
  assert.match(pivot, /source === 'current' && cell\?\.isSystemEstimate === true/);
  assert.match(pivot, /cell\.isSystemEstimate === true && cell\.projectCompleted !== true/);
  assert.match(pivot, /showSystemEstimate \? currency\(cell\.baseline\)/);
  assert.match(pivot, /projectProjectionTitle\(row\.raw, row\.name\)/);
});

test('Both monthly breakdown views show reference values only on active no-PM projects', () => {
  const app = read('App.jsx');
  assert.match(app, /projectProjectionTitle\(detail\.raw, displayValue\(detail\.name\)\)/);
  assert.match(app, /projectProjectionTitle\(row\.raw, displayValue\(row\.name\)\)/);
  assert.equal((app.match(/showSystemFallback=\{/g) || []).length, 2);
  assert.match(app, /!isCompleted\(detail\.raw\) && detail\.raw\?\.hasPmForecast === false/);
  assert.match(app, /!isCompleted\(row\.raw\) && row\.raw\?\.hasPmForecast === false/);
});

test('No-PM project names use the existing warning token and have a help tooltip', () => {
  const css = read('ProjectionDisplay.css');
  assert.match(css, /pivot-project-name-line\[data-no-pm/);
  assert.match(css, /project-name-status-line\.no-pm-projection/);
  assert.doesNotMatch(css, /\.projection-estimate-marker/);
  assert.match(css, /primary-projection-amount > \.system-estimate-reference-value/);
  assert.match(css, /color:\s*var\(--warning\)/);
  assert.match(read('ProjectionDisplay.jsx'), /SYSTEM_ESTIMATE_TOOLTIP/);
});
