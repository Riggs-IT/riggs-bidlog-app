import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {completedBillingProgress} from '../src/completedBillingProgress.mjs';

const rows = () => [
  {monthStart: '2026-02-01', cumulativeActualAmount: 100},
  {monthStart: '2026-03-01', cumulativeActualAmount: 100},
  {monthStart: '2026-04-01', cumulativeActualAmount: 80},
  {monthStart: '2026-05-01', cumulativeActualAmount: 140},
];
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('progression reuses API cumulative values, preserving zero-activity months and credit reductions', () => {
  const input = rows();
  const snapshot = JSON.stringify(input);
  const model = completedBillingProgress(input, 120, 140);
  assert.equal(model.status, 'ready');
  assert.deepEqual(model.points.map(row => row.amount), [100, 100, 80, 140]);
  assert.equal(model.contract, 120);
  assert.equal(JSON.stringify(input), snapshot);
});

test('source months are sorted for display, not filled in or rewritten', () => {
  const model = completedBillingProgress(rows().reverse(), 120, 140);
  assert.equal(model.status, 'ready');
  assert.deepEqual(model.points.map(row => row.month), [
    '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01',
  ]);
  assert.equal(model.points.length, 4);
});

test('a genuine $0 contract and $0 cumulative billing remain recorded zeros', () => {
  const model = completedBillingProgress([{monthStart: '2026-01-01', cumulativeActualAmount: 0}], 0, 0);
  assert.equal(model.status, 'ready');
  assert.equal(model.contract, 0);
  assert.equal(model.points[0].amount, 0);
});

test('missing contract line does not prevent drawing recorded billings', () => {
  const model = completedBillingProgress(rows(), null, 140);
  assert.equal(model.status, 'ready');
  assert.equal(model.contract, null);
});

test('no rows produce an unavailable timeline, not invented zero months', () => {
  assert.equal(completedBillingProgress([], 120, 0).status, 'empty');
  assert.equal(completedBillingProgress(null, 120, 0).status, 'empty');
});

test('null, blank, boolean, nonfinite cumulative values or invalid month fail closed', () => {
  for (const value of [null, undefined, '', false, Number.NaN, Infinity, 'bad']) {
    assert.equal(completedBillingProgress([{monthStart: '2026-01-01', cumulativeActualAmount: value}], 12, null).status, 'unavailable');
  }
  for (const month of ['2026-00-01', '2026-13-01', '2026-02-18', null, 'garbage']) {
    assert.equal(completedBillingProgress([{monthStart: month, cumulativeActualAmount: 12}], 12, 12).status, 'unavailable');
  }
});

test('duplicate month and mismatched summary decline chart rather than disguise financial inconsistency', () => {
  assert.equal(completedBillingProgress([...rows(), rows()[0]], 120, 140).status, 'unavailable');
  assert.equal(completedBillingProgress(rows(), 120, 141).status, 'unavailable');
  assert.equal(completedBillingProgress(rows(), 120, 140.005).status, 'ready');
});

test('chart is display-only and consumes existing monthly GET without permissions or cache changes', () => {
  const drawer = source('../src/CompletedProjectBillingDrawer.jsx');
  const chart = source('../src/CompletedBillingProgressChart.jsx');
  assert.match(drawer, /<CompletedBillingProgressChart/);
  assert.match(drawer, /monthly=\{monthly\}/);
  assert.match(drawer, /totalContract=\{project\.totalContractAmount\}/);
  assert.match(drawer, /expectedActual=\{project\.foundationActualTotal\}/);
  assert.match(drawer, /monthlyForJobId === project\.jobListId && !loading && !error && \(/);
  assert.match(chart, /cumulativeActualAmount|completedBillingProgress/);
  assert.match(chart, /aria-labelledby/);
  assert.match(chart, /Source: Foundation monthly billing history/);
  assert.doesNotMatch(chart, /fetch\(|httpx|\/api\/|marginCollected|localStorage/);
  const monthlyPosition = drawer.indexOf('MONTHLY BILLINGS');
  assert.ok(monthlyPosition > drawer.indexOf('completed-closeout-financial'));
  assert.ok(monthlyPosition < drawer.indexOf('completed-closeout-timing'));
});

test('typography and chart styles are scoped to the completed drawer and honor theme tokens', () => {
  const css = source('../src/styles.css').split('COMPLETED PROJECT CLOSEOUT: READABLE ANALYSIS, NOT KPI TILES').at(-1);
  assert.match(css, /\.completed-closeout-context/);
  assert.match(css, /\.completed-progress-line/);
  assert.match(css, /stroke: var\(--accent\)/);
  assert.match(css, /\.completed-progress-contract/);
  assert.doesNotMatch(css, /:root\s*\{|\.billing-drawer\s*\{/);
});

test('chart SSR includes reference line for recorded contract and no margin payload', async t => {
  const {default: React} = await import('react');
  const {renderToString} = await import('react-dom/server');
  const {createServer} = await import('vite');
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent',
  });
  t.after(() => vite.close());
  const {default: Chart} = await vite.ssrLoadModule('/src/CompletedBillingProgressChart.jsx');
  const rendered = renderToString(React.createElement(Chart, {
    monthly: rows(), totalContract: 120, expectedActual: 140,
  }));
  assert.match(rendered, /completed-progress-line/);
  assert.match(rendered, /completed-progress-contract/);
  assert.match(rendered, /Cumulative actual billings/);
  assert.match(rendered, /May 2026/);
  assert.doesNotMatch(rendered, /Margin Collected|Estimated Billings/);
  const unavailable = renderToString(React.createElement(Chart, {
    monthly: [{monthStart: '2026-01-01', cumulativeActualAmount: null}],
    totalContract: 120, expectedActual: null,
  }));
  assert.doesNotMatch(unavailable, /<svg/);
  assert.match(unavailable, /could not be reconciled/);
});
