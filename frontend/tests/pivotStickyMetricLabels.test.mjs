import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

const source = filename => readFileSync(new URL(`../src/${filename}`, import.meta.url), 'utf8');

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
});

test('metric labels contract only after reaching last frozen identity column', () => {
  const text = source('ProjectBillingPivot.jsx');
  const css = source('styles.css');
  assert.match(text, /pivotViewport\.scrollLeft > 1/);
  assert.match(text, /metricColumn\.getBoundingClientRect\(\)\.left[\s\S]*?frozenColumn\.getBoundingClientRect\(\)\.right/);
  assert.match(text, /showProbabilityColumn\s*\? 'thead \.pivot-probability-column'\s*: 'thead \.pivot-project-column'/);
  assert.match(text, /pivot-metric-labels-pinned/);
  assert.match(css, /\.pivot-source-combined\s*\.pivot-metric-labels-column \{\s*left: 618px;/);
  assert.match(css, /\.pivot-metric-labels-column \{\s*position: sticky;\s*left: 394px;/);
  assert.match(css, /\.pivot-metric-labels-pinned\s*\.pivot-metric-labels-column \{\s*width: 55px;/);
  assert.match(css, /grid-template-rows: repeat\(4, 15px\);/);
  assert.match(css, /tbody td\.pivot-metric-labels-column,[\s\S]*?tbody td\.pivot-month-column,[\s\S]*?vertical-align: top;/);
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
