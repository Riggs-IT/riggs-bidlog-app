import { readSource } from './helpers/readSource.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {metricPinThreshold, shouldPinMetricLabels} from '../src/pivotMetricPinning.js';

const source = filename => readSource(new URL(`../src/${filename}`, import.meta.url), 'utf8');

const fixture = {
  months: ['2026-10', '2026-11'],
  currentProjects: [{
    jobListId: 12, jobNumber: '26605', jobName: 'Canyon Commerce Center',
    totalContractAmount: 9157300, pm: 'Alex Costanzo',
  }],
  bidProjects: [],
  currentMonthly: new Map([[12, [
    {monthStart: '2026-10-01', projectedAmount: 125000, actualAmount: null,
      monthlyVariance: null, marginCollected: null},
    {monthStart: '2026-11-01', projectedAmount: 0, actualAmount: 0,
      monthlyVariance: 0, marginCollected: 0},
  ]]]),
  bidMonthly: new Map(),
  currency: n => `$${n}`,
  monthLabel: m => m,
  onSelectCurrentProject: () => {},
  includeBids: false,
};

async function pivotModule(t) {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true},
    appType: 'custom',
    logLevel: 'silent',
  });
  t.after(() => vite.close());
  return (await vite.ssrLoadModule('/src/ProjectBillingPivot.jsx')).default;
}

test('default Projected view has no shared All-only metric column', async t => {
  const Pivot = await pivotModule(t);
  const html = renderToString(React.createElement(Pivot, fixture));
  assert.match(html, /pivot-metric-projected/);
  assert.doesNotMatch(html, /class="pivot-metric-labels-column"/);
  assert.match(html, /<table/);
  assert.match(html, /Canyon Commerce Center/);
});

test('All defines four aligned tracks, a single label lane, and per-abbreviation tooltips', () => {
  const sourceText = source('ProjectBillingPivot.jsx');
  for (const [key, full, short] of [
    ['projected','Projected','P'],
    ['actual','Actual','A'],
    ['variance','Variance','Δ'],
    ['marginCollected','Margin Collected','M'],
  ]) {
    assert.ok(sourceText.includes(`{key: '${key}', label: '${full}', short: '${short}'}`));
  }
  assert.match(sourceText, /<abbr title=\{label\} aria-label=\{label\}>\{short\}<\/abbr>/);
  assert.match(sourceText, /billingMetric === 'all' && \(\s*<th[\s\S]*?className="pivot-metric-labels-column"/);
  assert.match(sourceText, /billingMetric === 'all' && \(\s*<td className="pivot-metric-labels-column">/);
  assert.match(sourceText, /value == null \? '—' : currency\(value\)/);
  assert.match(sourceText, /source === 'bid' \|\| cell\?\.hasActivity === false/);
  assert.match(sourceText, /showMargin \|\| track.key !== 'marginCollected'/);
});

test('metric label abbreviations reclaim lane width without unstable pin thresholds', () => {
  const text = source('ProjectBillingPivot.jsx');
  const css = source('styles.css');
  assert.match(text, /metricPinThreshold\(metricColumn, frozenColumn\)/);
  assert.match(text, /shouldPinMetricLabels/);
  assert.match(text, /showProbabilityColumn\s*\? 'thead \.pivot-probability-column'\s*: 'thead \.pivot-project-column'/);
  assert.match(text, /pivot-metric-labels-pinned/);
  assert.match(css, /\.pivot-source-combined\s*\.pivot-metric-labels-column \{\s*left: 618px;/);
  assert.match(css, /\.pivot-metric-labels-column \{\s*position: sticky;\s*left: 394px;/);
  assert.match(css, /\.pivot-metric-labels-pinned\s*\.pivot-metric-labels-column \{\s*width: 63px;/);
  assert.match(css, /\.pivot-metric-labels-pinned[\s\S]*?padding-right: 15px;/);
  assert.match(css, /grid-template-rows: repeat\(4, 15px\);/);
  assert.match(css, /tbody td\.pivot-metric-labels-column,[\s\S]*?tbody td\.pivot-month-column,[\s\S]*?vertical-align: top;/);
});

test('pin threshold uses only unchanged columns before Metric', () => {
  const makeCell = width => ({getBoundingClientRect: () => ({width})});
  const frozen = makeCell(300);
  const projectValues = makeCell(154);
  const gc = makeCell(160);
  const metric = makeCell(128);
  const cells = [frozen, projectValues, gc, metric];
  metric.parentElement = {children: cells};
  assert.equal(metricPinThreshold(metric, frozen), 314);
  metric.getBoundingClientRect = () => ({width: 63});
  assert.equal(metricPinThreshold(metric, frozen), 314);
});


test('compact metric lane stays compact at the far-right Total column', () => {
  const pinThreshold = 314;
  const before = shouldPinMetricLabels({
    pinThreshold, scrollLeft: 320, maxScroll: 900, isPinned: false,
  });
  assert.equal(before, true);

  // After the column shrinks from 128 to 63, the new max is 835.
  for (const scrollLeft of [320, 600, 835]) {
    assert.equal(shouldPinMetricLabels({
      pinThreshold, scrollLeft, maxScroll: 835, isPinned: true,
    }), true);
  }
  // A small movement back across the threshold does not flip the width.
  assert.equal(shouldPinMetricLabels({
    pinThreshold, scrollLeft: 308, maxScroll: 835, isPinned: true,
  }), true);
  assert.equal(shouldPinMetricLabels({
    pinThreshold, scrollLeft: 290, maxScroll: 835, isPinned: true,
  }), false);
  // Re-expanding does not immediately repin and oscillate.
  assert.equal(shouldPinMetricLabels({
    pinThreshold, scrollLeft: 290, maxScroll: 900, isPinned: false,
  }), false);
});


test('short tables cannot shrink away the scroll needed to stay pinned', () => {
  const pinThreshold = 314;
  assert.equal(shouldPinMetricLabels({
    pinThreshold, scrollLeft: 350, maxScroll: 380, isPinned: false,
  }), false);
  assert.equal(shouldPinMetricLabels({
    pinThreshold, scrollLeft: 310, maxScroll: 307, isPinned: true,
  }), false);
  assert.equal(shouldPinMetricLabels({
    pinThreshold, scrollLeft: 350, maxScroll: 600, isPinned: false,
  }), true);
});


test('empty-table colspan includes the metric lane only in All mode', () => {
  const text = source('ProjectBillingPivot.jsx');
  assert.match(text, /\+ \(billingMetric === 'all' \? 1 : 0\)/);
});

test('PM dollar prefix gets balanced padding without changing numeric editing', () => {
  const css = source('styles.css');
  const region = css.match(/\.pm-inline-input-wrap > span \{([\s\S]*?)\}/)?.[1] || '';
  assert.match(region, /padding: 0 12px;/);
  assert.doesNotMatch(region, /padding-left: 9px;/);
  assert.match(source('PMForecastPanel.jsx'), /MoneyInput/);
});


test('All header keeps full projected, actual, variance, and margin dollar values without repeating labels', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true},
    appType: 'custom',
    logLevel: 'silent',
  });
  t.after(() => vite.close());
  const {HeaderTotal} = await vite.ssrLoadModule('/src/ProjectBillingPivot.jsx');
  const html = renderToString(React.createElement(HeaderTotal, {
    label: 'SEP 2026', metric: 'all',
    value: 2000, projectedValue: 1000, actualValue: 1500,
    varianceValue: 500, marginCollectedValue: 250,
    activeProjectsProjected: 35, activeProjectsBilled: 34,
    includeProjectProjection: true, includeBidProjection: false,
    currency: n => `$${n}`, showMargin: true,
  })).replace(/<!--\s*-->/g, '');
  for (const amount of ['$1,000', '$1,500', '$500', '$250']) {
    assert.ok(html.includes(amount), `Missing full header amount: ${amount}`);
  }
  assert.doesNotMatch(html, />[PAΔM] \$[0-9]/);
  assert.match(html, />35<\/small>/); // count number, not repeated wording
  assert.match(html, /34 projects billed/); // remains available on hover
  assert.doesNotMatch(html, />34 projects billed<\/small>/); // not another visible row
  assert.match(html, /pivot-header-total-value-margin/);
});


test('shared header legend aligns one set of financial labels and the projected count', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true},
    appType: 'custom',
    logLevel: 'silent',
  });
  t.after(() => vite.close());
  const {HeaderMetricRail} = await vite.ssrLoadModule('/src/ProjectBillingPivot.jsx');
  const renderRail = props => renderToString(React.createElement(HeaderMetricRail, props));
  const active = renderRail({
    compact: false, showMargin: true, includeProjectProjection: true,
    includeBidProjection: false, showBaseline: false,
  });
  for (const label of ['Projected', 'Actual', 'Variance', 'Margin', 'Projected (active)']) {
    assert.ok(active.includes(`>${label}<`), `Missing active label: ${label}`);
  }
  const compact = renderRail({
    compact: true, showMargin: true, includeProjectProjection: true,
    includeBidProjection: false, showBaseline: false,
  });
  for (const label of ['P', 'A', 'Δ', 'M', '#']) {
    assert.ok(compact.includes(`>${label}<`), `Missing compact label: ${label}`);
  }
  const mixed = renderRail({
    compact: false, showMargin: true, includeProjectProjection: true,
    includeBidProjection: true, showBaseline: true,
  });
  for (const label of ['Total', 'Active', 'Actual', 'Variance', 'Margin', 'System estimate', 'Projected (all)']) {
    assert.ok(mixed.includes(`>${label}<`), `Missing mixed label: ${label}`);
  }
  const limited = renderRail({
    compact: false, showMargin: false, includeProjectProjection: true,
    includeBidProjection: false, showBaseline: false,
  });
  assert.doesNotMatch(limited, />Margin</);
  const css = source('styles.css');
  assert.match(css, /pivot-header-total-values-all \{\s*grid-auto-rows: 15px;/);
  assert.match(css, /pivot-header-metric-rail/);
  assert.match(source('useStickyTableHeader.js'), /floatingTable\.className = desiredClassName/);
});


test('All without margin access retains P/A/Δ but does not display M', () => {
  const text = source('ProjectBillingPivot.jsx');
  const css = source('styles.css');
  assert.match(text, /<HeaderMetricRail/);
  assert.match(text, /pivot-no-margin/);
  assert.match(css, /\.pivot-metric-all\.pivot-no-margin \.pivot-billing-amounts \{\s*grid-template-rows: repeat\(3, 15px\);/);
});

test('monthly variance marks comparable only and tooltip shows both amounts plus project count', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent',
  });
  t.after(() => vite.close());
  const {HeaderTotal} = await vite.ssrLoadModule('/src/ProjectBillingPivot.jsx');
  const render = (varianceMode, varianceValue) => renderToString(React.createElement(HeaderTotal, {
    label: 'SEP 2026', metric: 'all', showMargin:true,
    value:varianceValue, projectedValue:14628551, actualValue:15759661,
    varianceValue, actualVarianceValue:1131110, comparableVarianceValue:-115470,
    varianceMode, varianceComparableProjects:32, varianceActualProjects:40,
    marginCollectedValue:1928109,
    activeProjectsProjected:33, includeProjectProjection:true,
    includeBidProjection:false, currency:n=>`$${n}`,
  }));
  const comparable=render('COMPARABLE',-115470);
  assert.match(comparable, /pivot-variance-mode-indicator/);
  assert.match(comparable, />C<\/sup>/);
  assert.match(comparable, /Actual: \$1,131,110/);
  assert.match(comparable, /Comparable: -\$115,470/);
  assert.match(comparable, /32\/40 projects compared/);
  assert.match(comparable, /\(shown\)/);
  const actual=render('ACTUAL',1131110);
  assert.doesNotMatch(actual, /pivot-variance-mode-indicator/);
  assert.match(actual, /Actual: \$1,131,110 \(shown\)/);
  assert.match(actual, /Comparable: -\$115,470/);
  const mixed=render('MIXED',40);
  assert.match(mixed, />\*<\/sup>/);
  assert.match(mixed, /Shown: monthly cutoff mix/);
});
