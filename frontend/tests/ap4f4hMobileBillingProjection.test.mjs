import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pivotCurrentCell, pivotTotals, summarizePortfolioMonths,
  summarizeMonthlyTotals, buildMonthlyProjectionExport,
} from '../src/primaryProjection.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const source = name => readFileSync(path.join(root, name), 'utf8');
const month = '2026-12';
const noPm = (amount, actual=null) => ({primaryProjectionSource:'SYSTEM_BASELINE', hasPmForecast:false,
  systemBaselineAmount:amount, pmForecastAmount:null, actualAmount:actual, monthStart:`${month}-01`});
const pm = (amount, baseline) => ({primaryProjectionSource:'PM_FORECAST', hasPmForecast:true,
  systemBaselineAmount:baseline, pmForecastAmount:amount, actualAmount:100, monthStart:`${month}-01`});
const current = (cell) => ({source:'current', cells:[cell], total:cell});
const bid = (amount) => ({source:'bid', cells:[{projected:amount}], total:{projected:amount}});

test('visible Projected/Total includes system estimates and weighted bids, canonical PM totals do not', () => {
  const rows=[current(pivotCurrentCell(pm(200,900), month)), current(pivotCurrentCell(noPm(450, 15), month)), bid(75)];
  const total=pivotTotals(rows,0,'projected',true,{month});
  assert.equal(total.projectedValue,200);
  assert.equal(total.bidProjectedValue,75);
  assert.equal(total.totalForecastValue,275);
  assert.equal(total.displayProjectedValue,650);
  assert.equal(total.displayTotalForecastValue,725);
  assert.equal(total.value,725);
  assert.equal(total.includedSystemEstimateValue,450);
  assert.equal(total.includedSystemEstimateCount,1);
  assert.equal(total.hasSystemEstimate,true);
  assert.equal(total.varianceProjectedValue,200);
  assert.equal(total.varianceActualValue,100);
  assert.equal(total.actualValue,115);
  const actual=pivotTotals(rows,0,'actual',true,{month});
  assert.equal(actual.value,115);
  assert.equal(actual.displayTotalForecastValue,725);
  const grand=pivotTotals(rows,null,'projected',true,{months:[month]});
  assert.equal(grand.displayTotalForecastValue,725);
});

test('system estimates are excluded if PM is present, completed, unavailable or not selected',()=>{
  const pmWithBaseline=current(pivotCurrentCell(pm(20,999),month));
  const noEstimate=current(pivotCurrentCell(noPm(null),month));
  const zero=current(pivotCurrentCell(noPm(0),month));
  const completed=current({projectCompleted:true, isSystemEstimate:false, projected:null, baseline:null, actual:200});
  const rows=[pmWithBaseline,noEstimate,zero,completed];
  const v=pivotTotals(rows,0,'projected',false,{month});
  assert.equal(v.projectedValue,20);
  assert.equal(v.displayProjectedValue,20);
  assert.equal(v.includedSystemEstimateValue,0);
  assert.equal(v.includedSystemEstimateCount,1);
  assert.equal(v.hasSystemEstimate,true); // An actual zero is a known estimate.
  assert.equal(v.varianceProjectedValue,20);
  assert.equal(v.varianceActualValue,100);
  assert.equal(v.actualValue,300);
  assert.equal(pivotTotals([pmWithBaseline],0,'projected',false).hasSystemEstimate,false);
});

test('By Month displayed totals align with per-project visible values without altering variance',()=>{
  const projects=[{jobListId:1},{jobListId:2}];
  const currentMonthly=new Map([[1,[pm(200,900)]],[2,[noPm(450,15)]]]);
  const bids=[{sharePointItemId:3}];
  const bidMonthly=new Map([[3,[{monthStart:`${month}-01`,weightedMonthlyForecastAmount:75}]]]);
  const rows=summarizePortfolioMonths([month],projects,currentMonthly,bids,bidMonthly);
  assert.equal(rows[0].currentProjected,200);
  assert.equal(rows[0].weightedBids,75);
  assert.equal(rows[0].combinedExpected,275);
  assert.equal(rows[0].displayCurrentProjected,650);
  assert.equal(rows[0].displayCombinedExpected,725);
  assert.equal(rows[0].displaySystemEstimateValue,450);
  assert.equal(rows[0].displaySystemEstimateCount,1);
  const result=summarizeMonthlyTotals(rows);
  assert.equal(result.currentProjected,200);
  assert.equal(result.combinedExpected,275);
  assert.equal(result.displayCombinedExpected,725);
  assert.equal(result.displaySystemEstimateCount,1);
  assert.equal(result.variance, rows[0].variance);
});

test('no estimate means no estimate tooltip, no count and original PM totals',()=>{
  const cell=pivotCurrentCell(pm(40,80),month);
  const t=pivotTotals([current(cell)],0,'projected',false,{month});
  assert.equal(t.displayProjectedValue,40);
  assert.equal(t.includedSystemEstimateCount,0);
  assert.equal(t.hasSystemEstimate,false);
});

test('mobile layout preserves one sticky project identity and scrollable monthly values',()=>{
  const pivot=source('styles/05-project-pivot.css');
  const shell=source('styles/01-foundations.css');
  const app=source('App.jsx');
  assert.match(pivot, /@media \(max-width: 700px\)/);
  assert.match(pivot, /\.project-pivot-wrap\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(pivot, /th\.pivot-project-column,\s*\.project-pivot-table td\.pivot-project-column\s*\{[^}]*position:\s*sticky/s);
  assert.match(pivot, /\.pivot-metric-labels-column/);
  assert.match(pivot, /data-metric-label/);
  assert.match(shell, /\.app-nav\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(shell, /\.monthly-summary-wrap\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(app, /displayCombinedExpected/);
});

test('asterisk is gone while names retain the warning treatment',()=>{
  const name=source('ProjectionDisplay.jsx');
  const pivot=source('ProjectBillingPivot.jsx');
  const app=source('App.jsx');
  assert.doesNotMatch(name,/ProjectionEstimateMarker/);
  assert.doesNotMatch(pivot,/<ProjectionEstimateMarker/);
  assert.doesNotMatch(app,/<ProjectionEstimateMarker/);
  assert.match(pivot,/data-no-pm=/);
  assert.match(name,/System estimate shown and included in displayed projected totals/);
  assert.match(pivot,/Includes system estimates for/);
  assert.match(app,/Includes system estimates for/);
});
