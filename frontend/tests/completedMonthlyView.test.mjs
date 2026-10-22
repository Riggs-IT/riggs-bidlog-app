import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {completedProjectPivotCell, pivotTotals} from '../src/primaryProjection.js';
import {
  addCompletedMonths,
  completedMonthRange,
  defaultCompletedMonths,
  completedHistoryView,
  normalizeCompletedMonthly,
} from '../src/completedMonthlyView.js';

const fixture = (items, startMonth = '2025-01-01', endMonth = '2025-02-01') => ({
  startMonth, endMonth, monthRowCount: items.length,
  projectCount: new Set(items.map(item => item.jobListId)).size, items,
});
const historical = (jobListId, monthStart, actualAmount, marginCollected = null, more = {}) => ({
  jobListId, monthStart, actualAmount, marginCollected,
  marginDataComplete: true, missingMarginRows: 0, ...more,
});
const projects = [
  {jobListId: 1, projectManager: 'Test PM', jobNumber: '111', totalContractAmount: 40000,
    foundationActualTotal: 9500, projectCompleted: true},
  {jobListId: 2, projectManager: 'Other PM', jobNumber: '222', totalContractAmount: 100,
    foundationActualTotal: 100, projectCompleted: true},
  {jobListId: 3, projectManager: null, jobNumber: '333', totalContractAmount: 200,
    foundationActualTotal: 0, projectCompleted: true},
];
const months = ['2025-01', '2025-02'];
const map = items => normalizeCompletedMonthly(fixture(items), months);

function source(file) {
  return readFileSync(fileURLToPath(new URL(`../src/${file}`, import.meta.url)), 'utf8');
}

test('36-month window allowed; 37, reverse and malformed ranges denied before fetch', () => {
  assert.equal(completedMonthRange('2024-01','2026-12').length,36);
  assert.equal(completedMonthRange('2023-12','2026-12').length,0);
  assert.equal(completedMonthRange('2026-02','2026-01').length,0);
  assert.equal(completedMonthRange('2025-13','2025-14').length,0);
  assert.equal(addCompletedMonths('2025-01',-1),'2024-12');
  const range = defaultCompletedMonths(new Date(2026,9,21));
  assert.deepEqual(range, {from:'2024-11',through:'2026-10'});
});

test('historical month response must match its requested range and counts', () => {
  assert.throws(() => normalizeCompletedMonthly(fixture([], '2025-02-01'), months));
  assert.throws(() => normalizeCompletedMonthly({...fixture([]), monthRowCount: 2}, months));
  assert.throws(() => normalizeCompletedMonthly({...fixture([]), projectCount: 2}, months));
});

test('zero and missing monthly history stay distinct; do not manufacture calendar rows', () => {
  const byId = map([historical(1,'2025-01-01',0)]);
  const result = completedHistoryView(projects,byId,months);
  assert.equal(result.currentProjects.length,3);
  assert.deepEqual(result.currentMonthly.get(1).map(item=>item.monthStart), ['2025-01-01']);
  assert.deepEqual(result.currentMonthly.get(2), []);
  assert.equal(result.projectsWithoutRows,2);
  assert.equal(result.currentProjects[0].selectedActual,0);
  assert.equal(result.currentProjects[0].selectedActualValueCount,1);
  assert.equal(result.currentProjects[1].selectedActual,null);
  assert.equal(result.currentProjects[1].selectedActualValueCount,0);
  assert.equal(result.monthlySummary[0].actual,0);
  assert.equal(result.monthlySummary[1].actual,null);
});

test('project and month totals use the filtered directory, not the full portfolio', () => {
  const byId = map([
    historical(1,'2025-01-01',100), historical(1,'2025-02-01',-5),
    historical(2,'2025-01-01',900),
  ]);
  const filtered = completedHistoryView([projects[0]],byId,months);
  assert.equal(filtered.currentProjects.length,1);
  assert.equal(filtered.currentProjects[0].selectedActual,95);
  assert.equal(filtered.monthlySummary[0].actual,100);
  assert.equal(filtered.monthlySummary[1].actual,-5);
  assert.equal(filtered.monthlySummary[0].billedProjects,1);
});

test('revised lifetime Total Contract is passed through unchanged', () => {
  const byId=map([historical(1,'2025-01-01',50)]);
  const first=completedHistoryView([projects[0]],byId,months).currentProjects[0];
  assert.equal(first.totalContractAmount,40000);
  assert.equal(first.foundationActualTotal,9500);
  assert.equal(first.selectedActual,50); // period, never lifetime
  assert.equal(first.projectCompleted,true);
});

test('monthly margin is admin-only and incomplete billing months do not produce partial margin', () => {
  const rows = [
    historical(1,'2025-01-01',100,12),
    historical(1,'2025-02-01',300,null,{marginDataComplete:false,missingMarginRows:1}),
  ];
  const byId = map(rows);
  const admin = completedHistoryView([projects[0]],byId,months,{canViewMargin:true});
  assert.equal(admin.currentProjects[0].selectedMarginCollected,null);
  assert.equal(admin.monthlySummary[0].marginCollected,12);
  assert.equal(admin.monthlySummary[1].marginCollected,null);
  const viewer=completedHistoryView([projects[0]],byId,months,{canViewMargin:false});
  assert.equal(viewer.currentProjects[0].selectedMarginCollected,null);
  assert.equal(viewer.monthlySummary[0].marginCollected,null);
});

test('complete margin sums dollar values, never local billing percent assumptions', () => {
  const byId = map([
    historical(1,'2025-01-01',100,-5),
    historical(1,'2025-02-01',-25,0),
  ]);
  const result=completedHistoryView([projects[0]],byId,months,{canViewMargin:true});
  assert.equal(result.currentProjects[0].selectedMarginCollected,-5);
  assert.equal(result.monthlySummary[1].marginCollected,0);
});

test('malformed monetary values, duplicate months and mismatched project IDs fail closed', () => {
  assert.throws(() => map([historical(1,'2025-01-01',NaN)]));
  assert.throws(() => map([historical(1,'2025-01-01',100),historical(1,'2025-01-01',100)]));
  assert.throws(() => map([historical(1,'2025-03-01',100)]));
  assert.throws(() => map([historical(0,'2025-01-01',100)]));
});

test('shared ProjectBillingPivot provides completed-history mode with only actual/margin metrics', () => {
  const text = source('ProjectBillingPivot.jsx');
  assert.match(text, /completedHistoryMode\s*=\s*false/);
  assert.match(text, /completedHistoryMode\s*\?\s*'actual'\s*:\s*'projected'/);
  assert.match(text, /metric\.key === 'actual'/);
  assert.match(text, /canViewMargin\s*&&\s*\(metric\.key === 'all'\s*\|\|\s*metric\.key === 'marginCollected'\)/);
  assert.match(text, /COMPLETED_VALUE_TRACKS/);
  assert.match(text, /completedHistoryMode=\{completedHistoryMode\}/);
  assert.match(text, /completedProjectPivotCell\(/);
});

test('Completed Billings retains its directory and uses the existing shared pivot', () => {
  const page = source('ProjectAccountability.jsx');
  const controller = source('CompletedMonthlyHistory.jsx');
  assert.match(page, /billingHistoryView === 'directory'/);
  assert.match(page, /<CompletedMonthlyHistory/);
  assert.match(controller, /<ProjectBillingPivot/);
  assert.match(controller, /completedHistoryMode/);
  assert.match(controller, /includeBids=\{false\}/);
  assert.match(controller, /onSelectCurrentProject=\{onSelectProject\}/);
  assert.doesNotMatch(controller, /fetch\([^)]*current-projects\/monthly/);
  assert.doesNotMatch(controller, /\/api\/pm-forecast/);
  assert.doesNotMatch(controller, /method:\s*['"](?:POST|PUT|PATCH|DELETE)/);
});

test('All preserves unavailable margin even for recorded zero-billing months', () => {
  const zeroWithoutMargin = historical(1, '2025-01-01', 0, null);
  const normalWithMargin = historical(2, '2025-01-01', 200, 40);
  const byId = map([zeroWithoutMargin, normalWithMargin]);
  const data = completedHistoryView(projects.slice(0, 2), byId, months, {canViewMargin: true});
  assert.equal(data.monthlySummary[0].actual, 200);
  assert.equal(data.monthlySummary[0].marginCollected, null);
  assert.equal(data.currentProjects[0].selectedMarginDataComplete, false);
  assert.equal(data.currentProjects[1].selectedMarginCollected, 40);
  const emptyMargin = completedProjectPivotCell(zeroWithoutMargin, '2025-01');
  const withMargin = completedProjectPivotCell(normalWithMargin, '2025-01');
  assert.equal(emptyMargin.marginDataComplete, false);
  const pivotRows = [
    {source: 'current', total: emptyMargin, cells: [emptyMargin]},
    {source: 'current', total: withMargin, cells: [withMargin]},
  ];
  const totals = pivotTotals(pivotRows, 0, 'marginCollected', false);
  assert.equal(totals.actualValue, 200);
  assert.equal(totals.marginCollectedValue, null);
});
