import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePrimaryPortfolio, validatePrimaryProjection, nullableAmount, sumAmounts, amountDifference,
  aggregateCurrentMonthly, summarizePortfolioMonths, summarizeMonthlyTotals, pivotCurrentCell, pivotTotals,
  buildMonthlyProjectionExport, projectionSourceLabel } from '../src/primaryProjection.js';

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

test('PM source is selected by version, not by a nonzero monthly value',()=>{ const r=merged();assert.equal(r.map.get(1)[0].projectedAmount,0);assert.equal(r.projects[0].primaryProjectionSource,'PM_FORECAST'); });
test('blank PM does not borrow baseline or become zero',()=>{const r=merged();const m=r.map.get(1)[1];assert.equal(m.projectedAmount,null);assert.equal(m.systemBaselineAmount,100);assert.equal(m.missingPmMonths,1);});
test('unsubmitted project uses System Estimate, including zero',()=>{const f=fixture();f.primary.items[3].primaryProjectedAmount=0;f.primary.items[3].systemBaselineAmount=0;const r=merged(f);assert.equal(r.map.get(2)[0].projectedAmount,0);assert.equal(projectionSourceLabel(r.projects[1]),'System Estimate');});
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
test('range totals sum entered values and carry blank count',()=>{const r=merged(),a=aggregateCurrentMonthly(r.map.get(1),'2026-10','2027-03');assert.equal(a.projected,275.19);assert.equal(a.baseline,200);assert.equal(a.missingPmMonths,1);assert.equal(a.variance,null);});
test('range with only a blank PM entry remains null, not zero',()=>{const r=merged(),a=aggregateCurrentMonthly(r.map.get(1),'2026-11','2026-11');assert.equal(a.projected,null);assert.equal(a.actual,50);assert.equal(a.variance,null);});
test('project range with explicit zero remains a genuine zero',()=>{const r=merged(),a=aggregateCurrentMonthly(r.map.get(1),'2026-10','2026-10');assert.equal(a.projected,0);assert.equal(a.variance,0);});
test('negative Foundation actual and historical margin are preserved',()=>{const f=fixture();f.primary.items[3].foundationActualAmount=-100;f.monthly.items[1].items[0].actualAmount=-100;f.monthly.items[1].items[0].marginCollected=-10;const r=merged(f);assert.equal(r.map.get(2)[0].actualAmount,-100);assert.equal(r.map.get(2)[0].marginCollected,-10);});
test('incomplete margin is never added as zero to assert completeness',()=>{const r=merged();r.map.get(1)[0].marginDataComplete=false;const a=aggregateCurrentMonthly(r.map.get(1),'2026-10','2027-03');assert.equal(a.marginCollected,null);assert.equal(a.marginDataComplete,false);});
test('selected date range includes PM-only month and excludes earlier entries',()=>{const r=merged(),a=aggregateCurrentMonthly(r.map.get(1),'2027-03','2027-03');assert.equal(a.projected,275.19);assert.equal(a.missingPmMonths,0);});
test('Arizona to-date boundary does not jump at UTC midnight',()=>{const f=fixture();f.primary.readCompletedAtUTC='2026-10-01T03:00:00Z';const r=merged(f);assert.equal(r.projects[0].projectionAsOfMonth,'2026-09');assert.equal(r.projects[0].projectedToDate,0);});
test('next Arizona month changes derived summary without changing saved amounts',()=>{const f=fixture();f.primary.readCompletedAtUTC='2026-11-01T07:00:00Z';const r=merged(f);assert.equal(r.projects[0].projectedToDate,0);assert.equal(r.projects[0].projectionToDateMissingPmMonths,1);assert.equal(r.projects[0].futureProjectedAmount,275.19);});
test('monthly totals and pivot totals agree, including weighted bids',()=>{
 const r=merged(),months=['2026-10','2026-11','2027-03']; const bp=[{sharePointItemId:88}],bm=new Map([[88,[{monthStart:'2026-10-01',weightedMonthlyForecastAmount:70}]]]);
 const rows=summarizePortfolioMonths(months,r.projects,r.map,bp,bm),total=summarizeMonthlyTotals(rows);
 assert.equal(total.currentProjected,433.74);assert.equal(total.weightedBids,70);assert.equal(total.combinedExpected,503.74);assert.equal(total.missingPmMonths,1);assert.equal(total.variance,null);
 const pivot=r.projects.map(p=>({source:'current',cells:months.map(month=>pivotCurrentCell(r.map.get(p.jobListId).find(m=>m.monthStart.startsWith(month)),month))}));
 pivot.push({source:'bid',cells:months.map((month,i)=>({projected:i===0?70:null,actual:null}))});
 for(let i=0;i<months.length;i++){const pt=pivotTotals(pivot,i,'projected',true);assert.equal(sumAmounts([pt.projectedValue,pt.bidProjectedValue]),rows[i].combinedExpected);}
});
test('monthly CSV retains null, zero, source, ID, outside-baseline months and filters',()=>{const r=merged(),out=buildMonthlyProjectionExport(r.projects,r.map,[],new Map(),'2026-10','2027-03');assert.equal(out.rows.length,5);const one=out.rows.filter(x=>x['Job List ID']===1);assert.deepEqual(one.map(x=>x['Primary Projected Amount']),[0,null,275.19]);assert.equal(one[0]['Projection Source'],'PM Projection');assert.equal(one[0]['Latest PM Version ID'],10);assert.equal(one[1]['PM Entry Present'],'No');});
test('monthly CSV hides margin columns and values from non-admin views',()=>{const r=merged(),a=buildMonthlyProjectionExport(r.projects,r.map,[],new Map(),'2026-01','2027-12',false);assert.ok(!a.headers.some(h=>h.includes('Margin')));assert.ok(a.rows.every(r=>!Object.keys(r).some(k=>k.includes('Margin'))));const b=buildMonthlyProjectionExport(r.projects,r.map,[],new Map(),'2026-01','2027-12',true);assert.ok(b.headers.includes('Margin Collected'));});
test('same latest version may acquire changed baseline/actual without altering PM amounts',()=>{const f=fixture(),first=merged(f);f.primary.items[0].systemBaselineAmount=555;f.monthly.items[0].items[0].projectedAmount=555;const second=merged(f);assert.equal(second.map.get(1)[0].projectedAmount,first.map.get(1)[0].projectedAmount);assert.equal(second.map.get(1)[0].systemBaselineAmount,555);});
test('old baseline-only month removed by new authoritative calendar cannot return as PM',()=>{const f=fixture();f.monthly.items[0].items.push({monthStart:'2028-01-01',projectedAmount:200,actualAmount:null});assert.ok(!merged(f).map.get(1).some(m=>m.monthStart==='2028-01-01'));});
