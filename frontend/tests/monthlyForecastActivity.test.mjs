import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pivotTotals} from '../src/primaryProjection.js';

const current = (projected, actual = null) => ({source:'current', cells:[{
  projected, actual, variance:null, marginCollected:null,
}], total:{projected, actual}});
const bid = projected => ({source:'bid',cells:[{projected,actual:null}],total:{projected}});

test('month projected activity counts active projects separately from potential bids and from actual billers', () => {
  const rows = [current(300,100), current(700,null),current(0,80),current(null,20),bid(150),bid(0),bid(250)];
  const totals = pivotTotals(rows,0,'projected',true);
  assert.equal(totals.activeProjectsProjected,2);
  assert.equal(totals.activeProjectsBilled,3);
  assert.equal(totals.potentialBidsProjected,2);
  assert.equal(totals.projectedValue,1000);
  assert.equal(totals.bidProjectedValue,400);
  assert.equal(totals.totalForecastValue,1400);
});

test('active-only month excludes bid projected dollars and count', () => {
  const rows=[current(100,0),bid(80)];
  const totals=pivotTotals(rows.filter(r=>r.source!=='bid'),0,'projected',false);
  assert.equal(totals.activeProjectsProjected,1);
  assert.equal(totals.potentialBidsProjected,0);
  assert.equal(totals.totalForecastValue,100);
});

test('project filters are labeled Active Projects and unselected balance badge retains pill background', () => {
  const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../src/ProjectionDisplay.css',import.meta.url),'utf8');
  const pivot=fs.readFileSync(new URL('../src/ProjectBillingPivot.jsx',import.meta.url),'utf8');
  assert.match(app,/<strong>Active Projects<\/strong>/);
  assert.match(app,/No PM Projection\*/);
  assert.match(pivot,/No PM Projection\*/);
  assert.match(css, /background:var\(--surface-2,transparent\); border:1px solid var\(--border\);/);
  assert.match(pivot, /activeProjectsProjected=\{monthTotals\[index\]\?\.activeProjectsProjected\}/);
  assert.match(pivot, /`\$\{totalProjectedCount\} projected \(active \+ bids\)`/);
});

// Amount tooltips already explain T/P dollars. Activity counts should explain
// *how many* records make up a combined total, without repeating amounts.
test('projected count tooltips show record counts only when sources are combined', async t => {
  const React = (await import('react')).default;
  const {renderToString} = await import('react-dom/server');
  const {createServer} = await import('vite');
  const {fileURLToPath} = await import('node:url');
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent',
  });
  t.after(() => vite.close());
  const {default: Pivot} = await vite.ssrLoadModule('/src/ProjectBillingPivot.jsx');
  const active = {jobListId: 21, jobNumber: '25570', jobName: 'Modera Paradise Valley',
    hasPmForecast: true, totalContractAmount: 300};
  const potential = {sharePointItemId: 44, bidName: 'Discovery Oasis', probability: .89};
  const currentMonthly = new Map([[21, [{monthStart: '2026-09-01',
    primaryProjectionSource: 'PM_FORECAST', hasPmForecast: true,
    pmForecastAmount: 100, projectedAmount: 100,
    actualAmount: null, marginCollected: null,
    missingPmMonths: 0, systemBaselineAmount: 100}]]]);
  const bidMonthly = new Map([[44, [{monthStart: '2026-09-01',
    weightedMonthlyForecastAmount: 80}]]]);
  const render = (includeActiveProjects, includeBids) => renderToString(
    React.createElement(Pivot, {
      months: ['2026-09'],
      currentProjects: includeActiveProjects ? [active] : [],
      bidProjects: includeBids ? [potential] : [],
      currentMonthly, bidMonthly, currency: n => `$${n}`, monthLabel: m => m,
      includeActiveProjects, includeBids, onSelectCurrentProject: () => {},
    }),
  );
  const count = html => {
    const match = html.match(/<small class="pivot-header-billed-count pivot-header-forecast-count"([^>]*)>([^<]+)<\/small>/);
    assert.ok(match, 'the month activity count should be rendered');
    return {attributes: match[1], label: match[2]};
  };
  const activeOnly = count(render(true, false));
  assert.match(activeOnly.label, /1 Projected \(active\)/);
  assert.match(activeOnly.attributes, /title="1 Projected \(active\)"/);
  const bidsOnly = count(render(false, true));
  assert.match(bidsOnly.label, /1 Projected \(bids\)/);
  assert.match(bidsOnly.attributes, /title="1 Projected \(bids\)"/);
  const combinedMarkup = render(true, true);
  const combinedCount = count(combinedMarkup);
  assert.match(combinedCount.label, /2 projected \(active \+ bids\)/);
  assert.match(combinedCount.attributes, /title="1 active project · 1 potential bid"/);
  assert.doesNotMatch(combinedCount.attributes, /\$/);
  // Financial detail stays on the T/P values, not on the count.
  assert.match(combinedMarkup, /Total Forecast/);
  assert.match(combinedMarkup, /Active projects: \$100/);
  assert.match(combinedMarkup, /Potential bids: \$80/);
});

test('warning badges have unified colors, nowrap table lanes, and clearly selected rebalance pills', () => {
  const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const pills = fs.readFileSync(new URL('../src/ProjectionDisplay.css', import.meta.url), 'utf8');
  const breakdown = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(styles, /\.project-pivot-table\s*\.pivot-project-column \{\s*width: 300px;/);
  assert.match(styles, /\.projected-breakdown-table \.project-cell,\s*\.monthly-project-table \.project-cell \{\s*width: 310px;/);
  assert.match(styles, /\.project-pivot-table \.pivot-probability-column \{\s*width: 142px;\s*min-width: 142px;/);
  assert.match(styles, /\.project-pivot-table\.pivot-source-combined[\s\S]*?th\.pivot-probability-column,[\s\S]*?td\.pivot-probability-column \{\s*left: 476px;/);
  assert.match(styles, /\.floating-table-header-table\s*th\.pivot-probability-column \{[\s\S]*?z-index: 13;/);
  assert.match(styles, /\.pivot-project-name-line:has\(\.needs-rebalance-flag\),[\s\S]*?\{\s*flex-wrap: nowrap;/);
  assert.match(styles, /> \.needs-rebalance-flag \{\s*display: inline-flex;\s*margin-top: 0;\s*color: var\(--warning\);/);
  assert.match(styles, /> \.schedule-review-flag \{\s*display: inline-flex;\s*margin-top: 0;\s*color: var\(--accent\);/);
  assert.match(pills, /\.projection-source-count-toggle\.active \{[\s\S]*?border-color: color-mix[\s\S]*?background: color-mix/);
  assert.match(styles, /\.projection-source-count-toggle\.rebalance-count\.active \{/);
  assert.match(breakdown, /label="Month"\s*sortKey="month"/);
});
