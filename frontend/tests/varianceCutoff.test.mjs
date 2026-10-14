import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arizonaCalendarDay, varianceModeForMonth, chooseVarianceForMonth,
  aggregateCurrentMonthly, summarizePortfolioMonths, summarizeMonthlyTotals,
  pivotTotals, varianceTooltipText,
} from '../src/primaryProjection.js';

const BEFORE_SEP = '2026-09-15T06:59:59Z'; // 11:59:59 PM Sep 14 Arizona
const AT_SEP = '2026-09-15T07:00:00Z';     // 12:00:00 AM Sep 15 Arizona
const OCT_14 = '2026-10-14T18:00:00Z';
const OCT_15 = '2026-10-15T07:00:00Z';

const current = (projected, actual, paired = true) => ({
  source: 'current',
  cells: [{projected, actual, isSystemEstimate: !paired && projected == null,
    isPmVarianceComparable: paired, hasPmForecast: paired,
    marginCollected: null}],
});

// Synthetic but exact September money/count reconciliation from the user's
// screenshot: a matched subset, eight actual-only jobs and one PM-only job.
function septemberRows() {
  const rows = [current(14_542_693, 14_427_223)];
  for (let i = 0; i < 31; i += 1) rows.push(current(0, 0));
  rows.push(current(null, 1_332_438, false));
  for (let i = 0; i < 7; i += 1) rows.push(current(null, 0, false));
  rows.push(current(85_858, null, false));
  return rows;
}

test('cutoff uses Arizona date, not UTC day; after midnight on the 15th is Actual', () => {
  assert.equal(arizonaCalendarDay(BEFORE_SEP), '2026-09-14');
  assert.equal(arizonaCalendarDay(AT_SEP), '2026-09-15');
  assert.equal(varianceModeForMonth('2026-09', BEFORE_SEP), 'COMPARABLE');
  assert.equal(varianceModeForMonth('2026-09', AT_SEP), 'ACTUAL');
  assert.equal(varianceModeForMonth('2026-09', OCT_14), 'ACTUAL');
  assert.equal(varianceModeForMonth('2026-10', OCT_14), 'COMPARABLE');
  assert.equal(varianceModeForMonth('2026-10', OCT_15), 'ACTUAL');
  assert.equal(varianceModeForMonth('2026-11', OCT_15), 'COMPARABLE');
  assert.equal(varianceModeForMonth('2026-12', '2027-01-01T06:59:59Z'), 'ACTUAL');
  assert.deepEqual(chooseVarianceForMonth('2026-10', 25, 12, OCT_14), {mode:'COMPARABLE', value:12});
  assert.throws(() => varianceModeForMonth('2026-13', OCT_14));
});

test('September comparison is -115470 before cutoff and +1131110 after, with 32/40 matched', () => {
  const rows = septemberRows();
  const before = pivotTotals(rows, 0, 'variance', false, {month:'2026-09', asOfUTC:BEFORE_SEP});
  const after = pivotTotals(rows, 0, 'variance', false, {month:'2026-09', asOfUTC:AT_SEP});
  for (const value of [before, after]) {
    assert.equal(value.projectedValue, 14_628_551);
    assert.equal(value.actualValue, 15_759_661);
    assert.equal(value.actualVarianceValue, 1_131_110);
    assert.equal(value.comparableVarianceValue, -115_470);
    assert.equal(value.varianceComparableProjects, 32);
    assert.equal(value.varianceActualProjects, 40);
  }
  assert.equal(before.varianceMode, 'COMPARABLE');
  assert.equal(before.varianceValue, -115_470);
  assert.equal(after.varianceMode, 'ACTUAL');
  assert.equal(after.varianceValue, 1_131_110);
  assert.equal(pivotTotals(rows,0,'projected',false,{month:'2026-09',asOfUTC:OCT_14}).projectedValue,14_628_551);
});

test('total sums month-specific values when the selected range straddles the cutoff', () => {
  const rowA = {source:'current', cells:[
    {projected:100, actual:120, isPmVarianceComparable:true},
    {projected:70, actual:50, isPmVarianceComparable:true},
  ], total:{projected:170, actual:170, varianceProjectedValue:170, varianceActualValue:170,
    varianceComparableRows:2, varianceActualRows:2}};
  const rowB = {source:'current', cells:[
    {projected:null, actual:40, isPmVarianceComparable:false},
    {projected:null, actual:30, isPmVarianceComparable:false},
  ], total:{projected:null, actual:70, varianceProjectedValue:null, varianceActualValue:null,
    varianceComparableRows:0, varianceActualRows:2}};
  const rows=[rowA,rowB];
  const sep = pivotTotals(rows,0,'variance',false,{month:'2026-09',asOfUTC:OCT_14});
  const oct = pivotTotals(rows,1,'variance',false,{month:'2026-10',asOfUTC:OCT_14});
  const total = pivotTotals(rows,null,'variance',false,{months:['2026-09','2026-10'],asOfUTC:OCT_14});
  assert.equal(sep.varianceMode, 'ACTUAL');
  assert.equal(sep.varianceValue, 60);
  assert.equal(oct.varianceMode, 'COMPARABLE');
  assert.equal(oct.varianceValue, -20);
  assert.equal(total.varianceMode, 'MIXED');
  assert.equal(total.varianceValue, 40);
  assert.equal(total.actualVarianceValue, 70);
  assert.equal(total.comparableVarianceValue, 0);
  const post = pivotTotals(rows,null,'variance',false,{months:['2026-09','2026-10'],asOfUTC:OCT_15});
  assert.equal(post.varianceMode,'ACTUAL');
  assert.equal(post.varianceValue,70);
});

test('PM-only aggregated project months respect each month and keep baselines reference-only', () => {
  const pm = (month, pm, actual) => ({monthStart:`${month}-01`, primaryProjectionSource:'PM_FORECAST',
    hasPmForecast:true,pmForecastAmount:pm,actualAmount:actual, systemBaselineAmount:9000,
    marginCollected:0,marginDataComplete:true,missingPmMonths:0});
  const noPm = (month, actual) => ({monthStart:`${month}-01`,primaryProjectionSource:'SYSTEM_BASELINE',
    hasPmForecast:false,pmForecastAmount:null,actualAmount:actual,systemBaselineAmount:5000,
    marginCollected:0,marginDataComplete:true,missingPmMonths:0});
  const a = [pm('2026-09',100,120), pm('2026-10',70,50)];
  const b = [noPm('2026-09',40), noPm('2026-10',30)];
  const sep = aggregateCurrentMonthly([...a,...b],'2026-09','2026-09',OCT_14);
  const oct = aggregateCurrentMonthly([...a,...b],'2026-10','2026-10',OCT_14);
  const range = aggregateCurrentMonthly([...a,...b],'2026-09','2026-10',OCT_14);
  assert.equal(sep.variance,60);
  assert.equal(oct.variance,-20);
  assert.equal(range.variance,40);
  assert.equal(range.actualVariance,70);
  assert.equal(range.comparableVariance,0);
  assert.equal(range.varianceMode,'MIXED');
  assert.equal(range.projected,170);
  assert.equal(range.baseline,28_000); // explicitly reference-only
  const summaries=summarizePortfolioMonths(['2026-09','2026-10'],
    [{jobListId:1,projectCompleted:false},{jobListId:2,projectCompleted:false}],
    new Map([[1,a],[2,b]]),[],new Map(),OCT_14);
  const summary = summarizeMonthlyTotals(summaries,OCT_14);
  assert.equal(summary.variance,40);
  assert.equal(summary.actualVariance,70);
  assert.equal(summary.comparableVariance,0);
  assert.equal(summary.varianceMode,'MIXED');
});

test('no PM submission cannot become variance on either side of cutoff; genuine zero can', () => {
  const onlySystem = [current(null,100,false)];
  for(const at of [BEFORE_SEP,AT_SEP]) {
    const result=pivotTotals(onlySystem,0,'variance',false,{month:'2026-09',asOfUTC:at});
    assert.equal(result.varianceValue,null);
    assert.equal(result.projectedValue,null);
  }
  const actualZero=[current(0,0,true)];
  assert.equal(pivotTotals(actualZero,0,'variance',false,{month:'2026-09',asOfUTC:BEFORE_SEP}).varianceValue,0);
  assert.equal(pivotTotals(actualZero,0,'variance',false,{month:'2026-09',asOfUTC:AT_SEP}).varianceValue,0);
});

test('all reporting views use the same clock and switch an already-open app on the 15th', async () => {
  const {readFileSync}=await import('node:fs');
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const pivot=readFileSync(new URL('../src/ProjectBillingPivot.jsx',import.meta.url),'utf8');
  assert.match(app,/setInterval\([\s\S]*?60_000\)/);
  assert.match(app,/arizonaCalendarDay\(previous\) === arizonaCalendarDay\(now\)/);
  assert.match(app,/summarizePortfolioMonths\(monthRange, currentDetails, currentMonthly, bidDetails, bidMonthly, varianceAsOfUTC\)/);
  assert.match(app,/summarizeMonthlyTotals\(monthlyComparison, varianceAsOfUTC\)/);
  assert.match(app,/aggregateCurrentMonthly\(currentMonthly\.get\(row\.jobListId\), fromMonth, throughMonth, varianceAsOfUTC\)/);
  assert.match(app,/varianceAsOfUTC=\{varianceAsOfUTC\}/);
  assert.match(pivot,/pivotTotals\(rows, index, headerMetric, includeBids,[\s\S]*?asOfUTC: varianceAsOfUTC/);
  assert.match(pivot,/pivotTotals\(rows, null, headerMetric, includeBids,[\s\S]*?months, asOfUTC: varianceAsOfUTC/);
});


test('variance tooltip is concise and exposes actual, comparable, coverage and shown mode', () => {
  const numbers = {actualVariance:1131110,comparableVariance:-115470,compared:32,actualProjects:40};
  const format = n => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
  assert.equal(varianceTooltipText({...numbers,mode:'COMPARABLE'},format),
    'Actual: $1,131,110\nComparable: -$115,470 (shown)\n32/40 projects compared');
  assert.equal(varianceTooltipText({...numbers,mode:'ACTUAL'},format),
    'Actual: $1,131,110 (shown)\nComparable: -$115,470\n32/40 projects compared');
  assert.equal(varianceTooltipText({...numbers,mode:'MIXED',scope:'project-months'},format),
    'Actual: $1,131,110\nComparable: -$115,470\n32/40 project-months compared\nShown: monthly cutoff mix');
});
