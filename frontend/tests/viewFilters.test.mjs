import test from 'node:test';
import assert from 'node:assert/strict';
import {facetRows,hasMonthlyValues,isCompleted,projectDirectoryRows,ALL_FILTER as ALL} from '../src/viewFilters.js';
import {aggregateCurrentMonthly,pivotCurrentCell,pivotTotals,summarizePortfolioMonths,summarizeMonthlyTotals} from '../src/primaryProjection.js';
import {canonicalDirectory,contractorFilterOptions,contractorTokens,contractorFilterMatch} from '../src/gcReference.js';
for(const value of [true,1,'1','true',' TRUE '])test(`Completed flag accepted: ${JSON.stringify(value)}`,()=>assert.equal(isCompleted({projectCompleted:value}),true));
for(const value of [false,0,'0','false',null,undefined])test(`Not completed: ${JSON.stringify(value)}`,()=>assert.equal(isCompleted({projectCompleted:value}),false));
test('active directory hides completed rows even in the active endpoint cache',()=>assert.deepEqual(projectDirectoryRows([{jobListId:1,projectCompleted:false},{jobListId:2,projectCompleted:true}]).map(r=>r.jobListId),[1]));
test('Completed toggle adds historical records once, retaining active records',()=>assert.deepEqual(projectDirectoryRows([{jobListId:1},{jobListId:2,projectCompleted:true}],[{jobListId:2,projectCompleted:true},{jobListId:3,projectCompleted:true}],true).map(r=>r.jobListId),[1,2,3]));
test('planned end date is not project completion authority',()=>assert.equal(projectDirectoryRows([{jobListId:1,projectCompleted:false,effectiveEndDate:'2000-01-01'}]).length,1));
for(const v of [0,'0',10,-5])test(`entered value participates in range: ${v}`,()=>assert.ok(hasMonthlyValues([{monthStart:'2026-10-01',projectedAmount:v}],'2026-10','2026-10',['projectedAmount'])));
for(const v of [null,undefined,'',NaN])test(`blank/nonfinite does not invent range values: ${v}`,()=>assert.equal(hasMonthlyValues([{monthStart:'2026-10-01',projectedAmount:v}],'2026-10','2026-10',['projectedAmount']),false));
test('dates are inclusive and outside months cannot create options',()=>{
 const rows=[{monthStart:'2026-11-01',projectedAmount:1}];
 assert.equal(hasMonthlyValues(rows,'2026-10','2026-10',['projectedAmount']),false);
 assert.equal(hasMonthlyValues(rows,'2026-10','2026-11',['projectedAmount']),true);
 assert.equal(hasMonthlyValues(rows,'2026-12','2026-10',['projectedAmount']),false);
});
test('baseline-only blank on a PM job does not invent a PM amount in range',()=>assert.equal(hasMonthlyValues([{monthStart:'2026-10-01',projectedAmount:null,systemBaselineAmount:100}],'2026-10','2026-10',['projectedAmount','actualAmount']),false));
test('actual-only months remain in the selected range including credits',()=>assert.ok(hasMonthlyValues([{monthStart:'2026-10-01',projectedAmount:null,actualAmount:-20}],'2026-10','2026-10',['projectedAmount','actualAmount'])));
const entries=[{pm:'A',type:'CIP',gc:'1'},{pm:'B',type:'CIP',gc:'2'},{pm:'C',type:'TILT',gc:'3'}];
const defs=Object.fromEntries(['pm','type','gc'].map(k=>[k,{values:r=>[r[k]]}]));
test('facets narrow by other selections but keep alternatives for their own field',()=>{
 const f=facetRows(entries,{pm:'A',type:'CIP',gc:ALL},defs);
 assert.deepEqual(f.rows,[entries[0]]);assert.deepEqual(f.options.pm,['A','B']);assert.deepEqual(f.options.gc,['1']);assert.deepEqual(f.options.type,['CIP']);
});
test('range change removes unavailable selected value rather than phantom option',()=>{
 const f=facetRows([entries[2]],{pm:'A',type:ALL,gc:ALL},defs);assert.equal(f.selections.pm,ALL);assert.deepEqual(f.options.pm,['C']);assert.deepEqual(f.rows,[entries[2]]);
});
test('empty population produces no facet values and clears old selections',()=>{
 const f=facetRows([],{pm:'A',type:'CIP',gc:'1'},defs);assert.deepEqual(f.rows,[]);assert.deepEqual(f.options,{pm:[],type:[],gc:[]});assert.ok(Object.values(f.selections).every(v=>v===ALL));
});
test('context change invalidating a combination removes only unavailable choices',()=>{
 const f=facetRows(entries,{pm:'A',type:'TILT',gc:ALL},defs);assert.equal(f.selections.pm,ALL);assert.equal(f.selections.type,ALL);assert.deepEqual(f.rows,entries);
});
test('project-only filters do not exclude unrelated potential-bid sources',()=>{
 const list=[{kind:'project',pe:'One'},{kind:'bid'}];const f=facetRows(list,{pe:'One'},{pe:{values:r=>r.kind==='project'?[r.pe]:[],matches:(r,v)=>r.kind!=='project'||r.pe===v}});
 assert.equal(f.rows.length,2);
});
test('GC facets resolve only the contractors in the supplied population',()=>{
 const d=canonicalDirectory([{sharePointItemId:1,name:'A.R. Mays Construction'},{sharePointItemId:2,name:'Never In Range'}]);
 assert.deepEqual(contractorFilterOptions(['AR MAYS','A.R. Mays Construction'],d).map(r=>r.label),['A.R. Mays Construction']);
 assert.equal(contractorFilterOptions([],d,'gc:2').length,0);
 assert.equal(contractorFilterMatch('AR MAYS','gc:1',ALL,d),true);
});
test('only an approved short alias collapses; unrelated shorthand remains unmatched',()=>{
 const d=canonicalDirectory([{sharePointItemId:1,name:'Willmeng Construction'},{sharePointItemId:2,name:'ESI Construction'}]);
 assert.equal(contractorTokens('Willmeng',d)[0].key,'gc:1');
 assert.notEqual(contractorTokens('ESI',d)[0].key,'gc:2');
});
test('duplicate directory identity is not invented from same company text',()=>{
 const d=canonicalDirectory([{sharePointItemId:1,name:'ESI',cityStateZip:'Denver'},{sharePointItemId:2,name:'ESI',cityStateZip:'Boise'}]);
 assert.equal(contractorTokens('ESI',d)[0].status,'AMBIGUOUS');assert.equal(d.items.length,2);
});
const sys={monthStart:'2026-10-01',primaryProjectionSource:'SYSTEM_BASELINE',projectedAmount:200,systemBaselineAmount:200,actualAmount:null};
const pm={monthStart:'2026-10-01',primaryProjectionSource:'PM_FORECAST',projectedAmount:0,systemBaselineAmount:100,actualAmount:null};
test('baseline origin is marked independently of missing PM coverage',()=>{
 assert.equal(pivotCurrentCell(sys,'2026-10').isSystemEstimate,true);assert.equal(pivotCurrentCell(pm,'2026-10').isSystemEstimate,false);
 const blank=pivotCurrentCell({...pm,projectedAmount:null,missingPmMonths:1},'2026-10');assert.equal(blank.projected,null);assert.equal(blank.isSystemEstimate,false);
});
test('baseline origin survives month and range totals without changing values',()=>{
 const a=aggregateCurrentMonthly([sys,pm],'2026-10','2026-10');assert.equal(a.projected,200);assert.equal(a.estimateValueCount,1);
 const rows=[{source:'current',cells:[pivotCurrentCell(sys,'2026-10')]},{source:'current',cells:[pivotCurrentCell(pm,'2026-10')]}];
 assert.equal(pivotTotals(rows,0,'projected',false).hasSystemEstimate,true);assert.equal(pivotTotals(rows,0,'projected',false).projectedValue,200);
});
test('all-PM totals have no baseline marker even with baseline comparison available',()=>{
 assert.equal(aggregateCurrentMonthly([pm],'2026-10','2026-10').estimateValueCount,0);
 assert.equal(pivotTotals([{source:'current',cells:[pivotCurrentCell(pm,'2026-10')]}],0,'projected',false).hasSystemEstimate,false);
});
test('filters never mutate source rows or independent inputs',()=>{
 const frozen=entries.map(e=>Object.freeze({...e}));const f=Object.freeze({pm:'A',gc:ALL,type:ALL});facetRows(frozen,f,defs);assert.equal(f.pm,'A');assert.deepEqual(frozen,entries);
});
const {canonicalFilterKey}=await import('../src/gcReference.js');
test('directory arrival upgrades a raw selection to canonical identity, not All',()=>{
 const d=canonicalDirectory([{sharePointItemId:1,name:'A.R. Mays Construction'}]);assert.equal(canonicalFilterKey('raw:ar mays',d),'gc:1');
});
test('stable selected ID is never silently moved to another directory record',()=>{
 const d=canonicalDirectory([{sharePointItemId:2,name:'A.R. Mays Construction'}]);assert.equal(canonicalFilterKey('gc:1',d),'gc:1');
});
