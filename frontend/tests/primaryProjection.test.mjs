import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePrimaryPortfolio, validatePrimaryProjection, nullableAmount, sumAmounts, amountDifference,
  aggregateCurrentMonthly, summarizePortfolioMonths, summarizeMonthlyTotals, pivotCurrentCell, completedProjectPivotCell, pivotTotals,
  buildMonthlyProjectionExport, projectionSourceLabel, pmProjectionForVariance } from '../src/primaryProjection.js';

const clone = value => structuredClone(value);
function fixture() {
 const projects = [
  { jobListId:1,jobNumber:'TEST-1',jobName:'PM job',hasPmForecast:true,latestForecastVersionId:10,latestForecastVersionNumber:1,latestForecastVersionType:'PM_SUBMISSION',latestForecastMonthCount:2,primaryProjectionSource:'PM_FORECAST'},
  { jobListId:2,jobNumber:'TEST-2',jobName:'No submission',hasPmForecast:false,latestForecastVersionId:null,latestForecastVersionNumber:null,latestForecastVersionType:null,latestForecastMonthCount:null,primaryProjectionSource:'SYSTEM_BASELINE'},
 ];
 const row=(jobListId,monthStart,baseline,pm,actual) => ({jobListId,monthStart,
  primaryProjectionSource:projects[jobListId-1].primaryProjectionSource,primaryProjectedAmount:jobListId===1?pm:baseline,
  systemBaselineAmount:baseline,pmForecastAmount:pm,foundationActualAmount:actual,
  actualVsPrimaryVariance:amountDifference(actual,jobListId===1?pm:baseline),
  actualVsSystemBaselineVariance:amountDifference(actual,baseline),actualVsPmForecastVariance:amountDifference(actual,pm),
  latestForecastVersionId:projects[jobListId-1].latestForecastVersionId,monthLockDate:monthStart.slice(0,7)+'-15',
  monthEditState:'EDITABLE_FUTURE',isEditable:true,
 });
 const items=[row(1,'2026-10-01',100,0,0),row(1,'2026-11-01',100,null,50),row(1,'2027-03-01',null,275.19,null),row(2,'2026-10-01',125.55,null,100)];
 const summary=[...projects.map(p=>({jobListId:p.jobListId,jobName:p.jobName,jobNumber:p.jobNumber,projectCompleted:false,
  actualToDate:0, projectedTotal:200, projectedToDate:0, futureProjectedAmount:200, varianceToDate:0, effectiveAmount:999,
  originalContractAmount:888, gc:'Preserve GC',pm:'Preserve PM'})),{jobListId:3,jobNumber:'OLD',projectCompleted:true,projectedTotal:33,actualToDate:22}];
 const monthly={items:[1,2].map(jobListId=>({jobListId,items:items.filter(m=>m.jobListId===jobListId&&m.systemBaselineAmount!==null).map(m=>({monthStart:m.monthStart,projectedAmount:m.systemBaselineAmount,actualAmount:m.foundationActualAmount,marginCollected:m.foundationActualAmount===null?null:m.foundationActualAmount/10,missingMarginRows:0,marginDataComplete:true}))})).concat([{jobListId:3,items:[{monthStart:'2026-10-01',projectedAmount:33,actualAmount:22,marginCollected:2.2}]}])};
 return {summary,monthly,primary:{contractVersion:1,readCompletedAtUTC:'2026-09-30T22:30:00Z',projects,items}};
}
function merged(f=fixture()) { const out=mergePrimaryPortfolio(f.summary,f.monthly,f.primary);return {...out,map:new Map(out.monthly.items.map(p=>[p.jobListId,p.items]))}; }

test('merge carries the precise primary snapshot ID without changing project/month data', () => {
  const f = fixture();
  const snap = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  f.primary.primarySnapshotId = snap;
  const before = clone(f);
  const out = merged(f);
  assert.equal(out.primarySnapshotId, snap);
  assert.equal(out.projects[0].primarySnapshotId, undefined);
  assert.equal(out.map.get(1)[0].primarySnapshotId, undefined);
  assert.deepEqual(f, before);
});
test('old bridge or superseded primary snapshot retains rows but has no identity', () => {
  const old = fixture();
  assert.equal(merged(old).primarySnapshotId, null);
  const replaced = fixture();
  replaced.primary.primarySnapshotId = null;
  assert.equal(merged(replaced).primarySnapshotId, null);
});

test('PM source is selected by version, not by a nonzero monthly value',()=>{ const r=merged();assert.equal(r.map.get(1)[0].projectedAmount,0);assert.equal(r.projects[0].primaryProjectionSource,'PM_FORECAST'); });
test('blank PM does not borrow baseline or become zero',()=>{const r=merged();const m=r.map.get(1)[1];assert.equal(m.projectedAmount,null);assert.equal(m.systemBaselineAmount,100);assert.equal(m.missingPmMonths,1);});
test('unsubmitted project has no projection even with a zero System Estimate',()=>{const f=fixture();f.primary.items[3].primaryProjectedAmount=0;f.primary.items[3].systemBaselineAmount=0;const r=merged(f);assert.equal(r.map.get(2)[0].projectedAmount,null);assert.equal(r.map.get(2)[0].systemBaselineAmount,0);assert.equal(projectionSourceLabel(r.projects[1]),'No PM Projection');assert.equal(r.projects[1].projectedTotal,null);});
test('PM-only month outside baseline survives',()=>{const r=merged();assert.equal(r.map.get(1).at(-1).monthStart,'2027-03-01');assert.equal(r.map.get(1).at(-1).projectedAmount,275.19);});
test('completed project data and original contract/GC fields are not reinterpreted',()=>{const f=fixture(),r=merged(f);assert.deepEqual(r.projects[2],f.summary[2]);assert.deepEqual(r.map.get(3),f.monthly.items[2].items);assert.equal(r.projects[0].effectiveAmount,999);assert.equal(r.projects[0].gc,'Preserve GC');});
test('merged objects do not mutate cached inputs',()=>{const f=fixture(),before=clone(f);merged(f);assert.deepEqual(f,before);});
test('all-zero submitted version never falls back',()=>{const f=fixture();for(const m of f.primary.items.filter(m=>m.jobListId===1&&m.pmForecastAmount!==null)){m.pmForecastAmount=0;m.primaryProjectedAmount=0;}const r=merged(f);assert.equal(r.projects[0].projectedTotal,0);assert.equal(r.projects[0].hasPmForecast,true);});
test('zero-month submitted version retains identity with null PM values',()=>{const f=fixture();for(const m of f.primary.items.filter(m=>m.jobListId===1)){m.pmForecastAmount=null;m.primaryProjectedAmount=null;}f.primary.projects[0].latestForecastMonthCount=0;const r=merged(f);assert.equal(r.projects[0].projectedTotal,null);assert.equal(r.projects[0].hasPmForecast,true);});
test('project without any month rows remains in portfolio',()=>{const f=fixture();f.primary.items=f.primary.items.filter(m=>m.jobListId!==2);f.monthly.items[1].items=[];const r=merged(f);assert.equal(r.projects.length,3);assert.deepEqual(r.map.get(2),[]);});
test('admin correction counts as submitted projection',()=>{const f=fixture();f.primary.projects[0].latestForecastVersionType='ADMIN_CORRECTION';assert.equal(merged(f).projects[0].hasPmForecast,true);});
for (const [name, change] of [
 ['wrong contract version',f=>f.primary.contractVersion=2],
 ['duplicate project',f=>f.primary.projects.push(clone(f.primary.projects[0]))],
 ['duplicate month',f=>f.primary.items.push(clone(f.primary.items[0]))],
 ['missing saved-month coverage',f=>f.primary.projects[0].latestForecastMonthCount=3],
 ['mixed version',f=>f.primary.items[0].latestForecastVersionId=11],
 ['source fallback within saved version',f=>f.primary.items[1].primaryProjectedAmount=100],
 ['NaN amount',f=>f.primary.items[0].pmForecastAmount=NaN],
 ['boolean amount',f=>f.primary.items[0].primaryProjectedAmount=false],
 ['invalid day',f=>f.primary.items[0].monthStart='2026-10-02'],
 ['invalid project identity',f=>f.primary.projects[0].jobListId=0],
 ['unknown project month',f=>f.primary.items[0].jobListId=999],
 ['missing active project metadata',f=>f.primary.projects.shift()],
 ['nonexistent summary project',f=>f.summary.shift()],
 ['active/completed status race',f=>f.summary[0].projectCompleted=true],
 ['mixed actual snapshots',f=>f.monthly.items[0].items[1].actualAmount=99],
 ['missing real actual/margin read',f=>f.monthly.items[1].items=[]],
 ['untyped PM existence',f=>f.primary.projects[0].hasPmForecast='true'],
 ['missing read clock',f=>f.primary.readCompletedAtUTC='invalid'],
]) test('rejects '+name+' rather than producing plausible wrong totals',()=>{const f=fixture();change(f);assert.throws(()=>merged(f));});

test('nullable amounts preserve zero and negative credits, reject blank strings',()=>{assert.equal(nullableAmount(null),null);assert.equal(nullableAmount(0),0);assert.equal(nullableAmount('-1.25'),-1.25);assert.throws(()=>nullableAmount(''));});
test('cent sums have no binary floating tail',()=>{assert.equal(sumAmounts([0.1,0.2,null]),0.3);assert.equal(sumAmounts([null]),null);assert.equal(sumAmounts([null],0),0);});
test('zero actual is distinct from absent actual for variance',()=>{assert.equal(amountDifference(0,75),-75);assert.equal(amountDifference(null,75),null);assert.equal(amountDifference(75,null),null);});
test('range variance reconciles actual minus submitted PM totals even when coverage is incomplete',()=>{const r=merged(),a=aggregateCurrentMonthly(r.map.get(1),'2026-10','2027-03');assert.equal(a.projected,275.19);assert.equal(a.baseline,200);assert.equal(a.missingPmMonths,1);assert.equal(a.variance,-225.19);assert.equal(a.varianceComparableRows,1);assert.equal(a.varianceMissingEditableRows,1);assert.equal(a.varianceHistoricalUnavailableRows,0);});
test('range with only a blank editable PM entry remains incomplete',()=>{const r=merged(),a=aggregateCurrentMonthly(r.map.get(1),'2026-11','2026-11');assert.equal(a.projected,null);assert.equal(a.actual,50);assert.equal(a.variance,null);assert.equal(a.varianceMissingEditableRows,1);assert.equal(a.varianceHistoricalUnavailableRows,0);});
test('project range with explicit zero remains a genuine zero',()=>{const r=merged(),a=aggregateCurrentMonthly(r.map.get(1),'2026-10','2026-10');assert.equal(a.projected,0);assert.equal(a.variance,0);});
test('negative Foundation actual and historical margin are preserved',()=>{const f=fixture();f.primary.items[3].foundationActualAmount=-100;f.monthly.items[1].items[0].actualAmount=-100;f.monthly.items[1].items[0].marginCollected=-10;const r=merged(f);assert.equal(r.map.get(2)[0].actualAmount,-100);assert.equal(r.map.get(2)[0].marginCollected,-10);});
test('incomplete margin is never added as zero to assert completeness',()=>{const r=merged();r.map.get(1)[0].marginDataComplete=false;const a=aggregateCurrentMonthly(r.map.get(1),'2026-10','2027-03');assert.equal(a.marginCollected,null);assert.equal(a.marginDataComplete,false);});
test('selected date range includes PM-only month and excludes earlier entries',()=>{const r=merged(),a=aggregateCurrentMonthly(r.map.get(1),'2027-03','2027-03');assert.equal(a.projected,275.19);assert.equal(a.missingPmMonths,0);});
test('Arizona to-date boundary does not jump at UTC midnight',()=>{const f=fixture();f.primary.readCompletedAtUTC='2026-10-01T03:00:00Z';const r=merged(f);assert.equal(r.projects[0].projectionAsOfMonth,'2026-09');assert.equal(r.projects[0].projectedToDate,0);});
test('next Arizona month changes derived summary without changing saved amounts',()=>{const f=fixture();f.primary.readCompletedAtUTC='2026-11-01T07:00:00Z';const r=merged(f);assert.equal(r.projects[0].projectedToDate,0);assert.equal(r.projects[0].projectionToDateMissingPmMonths,1);assert.equal(r.projects[0].futureProjectedAmount,275.19);});
test('monthly totals and pivot totals agree, including weighted bids',()=>{
 const r=merged(),months=['2026-10','2026-11','2027-03']; const bp=[{sharePointItemId:88}],bm=new Map([[88,[{monthStart:'2026-10-01',weightedMonthlyForecastAmount:70}]]]);
 const rows=summarizePortfolioMonths(months,r.projects,r.map,bp,bm),total=summarizeMonthlyTotals(rows);
 assert.equal(total.currentProjected,275.19);assert.equal(total.weightedBids,70);assert.equal(total.combinedExpected,345.19);assert.equal(total.missingPmMonths,1);assert.equal(total.variance,-103.19);assert.equal(total.varianceNoPmForecastRows,1);
 const pivot=r.projects.map(p=>({source:'current',cells:months.map(month=>(p.projectCompleted?completedProjectPivotCell:pivotCurrentCell)(r.map.get(p.jobListId).find(m=>m.monthStart.startsWith(month)),month))}));
 pivot.push({source:'bid',cells:months.map((month,i)=>({projected:i===0?70:null,actual:null}))});
 for(let i=0;i<months.length;i++){const pt=pivotTotals(pivot,i,'projected',true);assert.equal(sumAmounts([pt.projectedValue,pt.bidProjectedValue]),rows[i].combinedExpected);}
});
test('pivot header total forecast includes bids while performance variance stays active-project only',()=>{
 const rows=[
  {source:'current',cells:[{projected:100,actual:90,variance:-10,marginCollected:5,missingPmMonths:0,baseline:100,isSystemEstimate:false,isPmVarianceComparable:true,hasPmForecast:true}]},
  {source:'bid',cells:[{projected:50,actual:null,variance:null,marginCollected:null,missingPmMonths:0}]},
 ];
 const totals=pivotTotals(rows,0,'variance',true);
 assert.equal(totals.projectedValue,100);
 assert.equal(totals.bidProjectedValue,50);
 assert.equal(totals.totalForecastValue,150);
 assert.equal(totals.actualValue,90);
 assert.equal(totals.varianceValue,-10);
 assert.equal(totals.value,-10);
});
test('pivot variance uses displayed totals while comparable subset remains diagnostic',()=>{
 const rows=[
  {source:'current',cells:[{projected:100,actual:110,variance:10,marginCollected:5,missingPmMonths:0,isEditable:false,projectCompleted:false,isPmVarianceComparable:true,hasPmForecast:true}]},
  {source:'current',cells:[{projected:null,actual:50,variance:null,marginCollected:2,missingPmMonths:1,isEditable:true,projectCompleted:false,isPmVarianceComparable:false,hasPmForecast:true}]},
  {source:'current',cells:[{projected:null,actual:25,variance:null,marginCollected:1,missingPmMonths:1,isEditable:false,projectCompleted:false,isPmVarianceComparable:false,hasPmForecast:true}]},
 ];
 const totals=pivotTotals(rows,0,'variance',false);
 assert.equal(totals.actualValue,185);
 assert.equal(totals.varianceProjectedValue,100);
 assert.equal(totals.varianceActualValue,110);
 assert.equal(totals.varianceValue,85); // (110 + 50 + 25) actual - 100 PM
 assert.equal(totals.varianceComparableProjects,1);
 assert.equal(totals.varianceActualProjects,3);
 assert.equal(totals.varianceMissingEditableProjects,1);
 assert.equal(totals.varianceHistoricalUnavailableProjects,1);
});
test('locked PM gap is historical, not an actionable missing projection',()=>{
 const f=fixture();
 f.primary.items[1].monthEditState='LOCKED_PAST';
 f.primary.items[1].isEditable=false;
 const r=merged(f),a=aggregateCurrentMonthly(r.map.get(1),'2026-11','2026-11');
 assert.equal(a.variance,null);
 assert.equal(a.varianceMissingEditableRows,0);
 assert.equal(a.varianceHistoricalUnavailableRows,1);
});
test('completed project pivot cell contributes actual history but no forecast or variance',()=>{
 const c=completedProjectPivotCell({projectedAmount:100,actualAmount:90,marginCollected:9},'2026-10');
 assert.equal(c.projected,null);assert.equal(c.actual,90);assert.equal(c.variance,null);assert.equal(c.projectCompleted,true);assert.equal(c.isEditable,false);
});

test('monthly CSV retains null, zero, source, ID, outside-baseline months and filters',()=>{const r=merged(),out=buildMonthlyProjectionExport(r.projects,r.map,[],new Map(),'2026-10','2027-03');assert.equal(out.rows.length,5);const one=out.rows.filter(x=>x['Job List ID']===1);assert.deepEqual(one.map(x=>x['Primary Projected Amount']),[0,null,275.19]);assert.equal(one[0]['Projection Source'],'PM Projection');assert.equal(one[0]['Latest PM Version ID'],10);assert.equal(one[1]['PM Entry Present'],'No');});
test('monthly CSV hides margin columns and values from non-admin views',()=>{const r=merged(),a=buildMonthlyProjectionExport(r.projects,r.map,[],new Map(),'2026-01','2027-12',false);assert.ok(!a.headers.some(h=>h.includes('Margin')));assert.ok(a.rows.every(r=>!Object.keys(r).some(k=>k.includes('Margin'))));const b=buildMonthlyProjectionExport(r.projects,r.map,[],new Map(),'2026-01','2027-12',true);assert.ok(b.headers.includes('Margin Collected'));});
test('same latest version may acquire changed baseline/actual without altering PM amounts',()=>{const f=fixture(),first=merged(f);f.primary.items[0].systemBaselineAmount=555;f.monthly.items[0].items[0].projectedAmount=555;const second=merged(f);assert.equal(second.map.get(1)[0].projectedAmount,first.map.get(1)[0].projectedAmount);assert.equal(second.map.get(1)[0].systemBaselineAmount,555);});
test('old baseline-only month removed by new authoritative calendar cannot return as PM',()=>{const f=fixture();f.monthly.items[0].items.push({monthStart:'2028-01-01',projectedAmount:200,actualAmount:null});assert.ok(!merged(f).map.get(1).some(m=>m.monthStart==='2028-01-01'));});


test('All monthly totals include completed and active Foundation margin without bids', () => {
  const rows = [
    {source:'current',cells:[{projected:300,actual:200,marginCollected:20}]},
    {source:'current',cells:[{projected:null,actual:50,marginCollected:5}]},
    {source:'bid',cells:[{projected:500,actual:null,marginCollected:null}]},
  ];
  const all = pivotTotals(rows,0,'projected',true);
  const margin = pivotTotals(rows,0,'marginCollected',true);
  assert.equal(all.projectedValue,300);
  assert.equal(all.totalForecastValue,800);
  assert.equal(all.marginCollectedValue,25);
  assert.equal(margin.value,25);
});

test('All header margin does not show partial collected margin as a valid total', () => {
  const rows = [
    {source:'current',cells:[{projected:100,actual:200,marginCollected:20}]},
    {source:'current',cells:[{projected:50,actual:300,marginCollected:null}]},
  ];
  assert.equal(pivotTotals(rows,0,'projected',false).marginCollectedValue,null);
  assert.equal(pivotTotals(rows,0,'marginCollected',false).value,null);
});


test('System Estimate remains a reference and NEVER enters Projected, counts or variance', () => {
  const r = merged();
  const noPm = r.map.get(2)[0];
  assert.equal(noPm.projectedAmount, null);
  assert.equal(noPm.systemBaselineAmount, 125.55);
  assert.equal(noPm.actualAmount, 100);
  assert.equal(pmProjectionForVariance(noPm), null);
  assert.equal(noPm.monthlyVariance, null);
  const a = aggregateCurrentMonthly(r.map.get(2), '2026-10', '2026-10');
  assert.equal(a.projected, null);
  assert.equal(a.baseline, 125.55);
  assert.equal(a.estimateValueCount, 1);
  assert.equal(a.projectionValueCount, 0);
  assert.equal(a.actual, 100);
  assert.equal(a.variance, null);
  assert.equal(a.varianceComparableRows, 0);
  assert.equal(a.varianceNoPmForecastRows, 1);
  assert.equal(a.varianceMissingEditableRows, 0);
  assert.equal(a.varianceHistoricalUnavailableRows, 0);
  const cell = pivotCurrentCell(noPm, '2026-10');
  assert.equal(cell.projected, null);
  assert.equal(cell.baseline, 125.55);
  assert.equal(cell.actual, 100);
  assert.equal(cell.isPmVarianceComparable, false);
  assert.equal(cell.variance, null);
  const pivot = pivotTotals([{source:'current',cells:[cell]}],0,'variance',false);
  assert.equal(pivot.projectedValue, null);
  assert.equal(pivot.value, null); // Missing PM is not a $0 forecast.
  assert.equal(pivot.activeProjectsProjected, 0);
  assert.equal(pivot.baselineValue, 125.55);
  assert.equal(pivot.actualValue, 100);
  assert.equal(pivot.varianceValue, null);
  assert.equal(pivot.varianceNoPmForecastProjects, 1);
  assert.equal(pivot.varianceComparableProjects, 0);
  const csv = buildMonthlyProjectionExport(r.projects,r.map,[],new Map(),'2026-10','2026-10');
  const csvRow = csv.rows.find(row=>row['Job List ID']===2);
  assert.equal(csvRow['Variance vs Primary'],null);
  assert.equal(csvRow['Primary Projected Amount'],null);
  assert.equal(csvRow['PM Projection Amount'],null);
  assert.equal(csvRow['System Estimate Amount'],125.55);
  assert.equal(csvRow['Projection Source'],'No PM Projection');
});

test('PM-zero and Admin Correction compare actual; no PM month never borrows baseline', () => {
  const f = fixture();
  f.primary.projects[0].latestForecastVersionType = 'ADMIN_CORRECTION';
  f.primary.items[0].foundationActualAmount = 25;
  f.primary.items[0].actualVsPmForecastVariance = 25;
  f.primary.items[0].actualVsPrimaryVariance = 25;
  f.monthly.items[0].items[0].actualAmount = 25;
  const r = merged(f);
  const zeroPm = r.map.get(1)[0];
  assert.equal(pmProjectionForVariance(zeroPm),0);
  assert.equal(zeroPm.monthlyVariance,25);
  const monthTotal = aggregateCurrentMonthly(r.map.get(1),'2026-10','2026-10');
  assert.equal(monthTotal.variance,25);
  assert.equal(monthTotal.varianceComparableRows,1);
  const cell = pivotCurrentCell(zeroPm,'2026-10');
  assert.equal(cell.isPmVarianceComparable,true);
  assert.equal(cell.variance,25);
  assert.equal(pivotTotals([{source:'current',cells:[cell]}],0,'variance',false).varianceValue,25);
  const blankPm = r.map.get(1)[1];
  assert.equal(blankPm.projectedAmount,null);
  assert.equal(blankPm.systemBaselineAmount,100);
  assert.equal(pmProjectionForVariance(blankPm),null);
  assert.equal(pivotCurrentCell(blankPm,'2026-11').variance,null);
});

test('portfolio monthly comparison uses PM-only projected total while preserving actuals and reference',()=>{
  const r=merged(), month='2026-10';
  const rows=summarizePortfolioMonths([month],r.projects,r.map,[],new Map());
  assert.equal(rows[0].currentProjected,0); // Submitted PM 0; baseline-only project contributes nothing
  assert.equal(rows[0].currentBaseline,225.55); // reference is available separately
  assert.equal(rows[0].currentActual,122); // PM 0 + system 100 + completed 22
  assert.equal(rows[0].variance,122); // 122 actual - submitted PM 0
  assert.equal(rows[0].varianceComparableRows,1);
  assert.equal(rows[0].varianceNoPmForecastRows,1);
  assert.equal(rows[0].varianceHistoricalUnavailableRows,1);
  const sum=summarizeMonthlyTotals(rows);
  assert.equal(sum.currentProjected,0);
  assert.equal(sum.variance,122);
  assert.equal(sum.varianceNoPmForecastRows,1);
  const cells=r.projects.map(p=>({source:'current',cells:[(p.projectCompleted?completedProjectPivotCell:pivotCurrentCell)(r.map.get(p.jobListId).find(m=>m.monthStart.startsWith(month)),month)]}));
  const totals=pivotTotals(cells,0,'variance',false);
  assert.equal(totals.varianceValue,122);
  assert.equal(totals.varianceComparableProjects,1);
  assert.equal(totals.varianceNoPmForecastProjects,1);
  assert.equal(totals.varianceHistoricalUnavailableProjects,1);
});

// Regression for September's real displayed headline amounts. The diagnostic
// comparable-only result (-115470) is different and must NOT appear as the
// month-header variance for P=14628551 and A=15759661.
test('September header variance is the subtraction of its two displayed PM/actual totals', () => {
  const rows = [
    {source:'current',cells:[{projected:14542693,actual:14427223,marginCollected:10,isPmVarianceComparable:true,hasPmForecast:true,isSystemEstimate:false}]},
    {source:'current',cells:[{projected:85858,actual:null,marginCollected:null,isPmVarianceComparable:false,hasPmForecast:true,isSystemEstimate:false}]},
    {source:'current',cells:[{projected:null,actual:1332438,marginCollected:5,isPmVarianceComparable:false,hasPmForecast:false,isSystemEstimate:true,baseline:9999999}]},
  ];
  const totals=pivotTotals(rows,0,'all',false);
  assert.equal(totals.projectedValue,14628551);
  assert.equal(totals.actualValue,15759661);
  assert.equal(totals.varianceValue,1131110);
  assert.equal(totals.varianceProjectedValue,14542693); // diagnostic only
  assert.equal(totals.varianceActualValue,14427223); // diagnostic only
  assert.equal(totals.baselineValue,9999999); // reference-only
  assert.equal(totals.activeProjectsProjected,2); // baseline-only row excluded
  assert.equal(pivotTotals(rows,0,'variance',false).value,1131110);
  assert.equal(pivotTotals(rows,0,'actual',false).value,15759661);
  assert.equal(pivotTotals(rows,0,'projected',false).value,14628551);
});

test('no PM anywhere keeps portfolio variance unavailable instead of using baseline or zero', () => {
  const rows=[{source:'current',cells:[{projected:null,actual:100,baseline:1500,isSystemEstimate:true,isPmVarianceComparable:false}]}];
  const out=pivotTotals(rows,0,'variance',false);
  assert.equal(out.projectedValue,null);
  assert.equal(out.actualValue,100);
  assert.equal(out.varianceValue,null);
});

test('monthly comparison totals always subtract the same PM and actual sums they display', () => {
  const rows = [
    {month:'2026-09',currentProjected:14628551,currentActual:15759661,actualValueCount:40,projectionValueCount:33,
      varianceComparableRows:32,varianceProjected:14542693,varianceActual:14427223,currentMarginDataComplete:true,currentMarginCollected:1928109,missingPmMonths:0,currentMissingMarginRows:0},
  ];
  const t=summarizeMonthlyTotals(rows);
  assert.equal(t.currentProjected,14628551);
  assert.equal(t.currentActual,15759661);
  assert.equal(t.variance,1131110);
  assert.equal(t.currentMarginCollected,1928109);
});
