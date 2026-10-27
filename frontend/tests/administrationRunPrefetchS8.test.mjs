import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PAGE_RUN_CHECK_LIMIT, RUN_BATCH_SIZE, RUN_CACHE_TTL_MS, HALT_RUN_PREFETCH,
  pageRunCandidates, batchRunQuery, validateRunBatch,
} from '../src/administrationRunPrefetch.mjs';

const env='Default-11111111-1111-4111-8111-111111111111';
const flows = Array.from({length:300},(_,i)=>({
  environmentId:env,
  workflowId:`aaaaaaaa-aaaa-4aaa-8aaa-${String(i+1).padStart(12,'0')}`,
  name:`Flow ${i+1}`,
  modifiedAtUTC:`2026-10-${String(27-Math.floor(i/14)).padStart(2,'0')}T12:${String(59-(i%14)).padStart(2,'0')}:00Z`,
}));
const key=flow=>`${flow.environmentId}:${flow.workflowId}`;
const row=(flow,status='SUCCEEDED')=>({
  environmentId:flow.environmentId, resourceId:flow.workflowId,
  runIdentitySource:'RUNTIME_EXACT_RESOURCE_ENDPOINT',
  details:{availability:'NOT_CHECKED',platformState:'UNKNOWN',stateSource:'NOT_VERIFIED'},
  runHistory:{availability:'AVAILABLE',hasMore:false,runs:[
    {runId:'run-one',status,startedAtUTC:'2026-10-26T16:29:19Z'}]},
});

test('first page starts at 25 and never schedules the entire 300-flow inventory',()=>{
  assert.equal(PAGE_RUN_CHECK_LIMIT,25);
  assert.equal(RUN_BATCH_SIZE,4);
  const found=pageRunCandidates(flows,{page:1,pageSize:50,sortBy:'MODIFIED'}, {},new Map());
  assert.equal(found.length,25);
  assert.equal(found[0].workflowId,flows[0].workflowId);
  assert.equal(found.at(-1).workflowId,flows[24].workflowId);
});

test('checked first-page data stays in memory; expired entries can be refreshed',()=>{
  const now=1000000;
  const cache=new Map([[key(flows[0]),{checkedAt:now-15000}]]);
  assert.equal(pageRunCandidates(flows,{page:1,pageSize:25}, {},cache,now).length,24);
  cache.set(key(flows[0]),{checkedAt:now-RUN_CACHE_TTL_MS});
  assert.equal(pageRunCandidates(flows,{page:1,pageSize:25}, {},cache,now).length,25);
});

test('visited page scope is bounded even if checked failures change sort',()=>{
  const observations={[key(flows[44])]:{status:'FAILED',startedAtUTC:'2026-10-27T12:00:00Z'}};
  const page=pageRunCandidates(flows,{page:2,pageSize:25,sortBy:'RUNS'}, observations,new Map());
  assert.equal(page.length,25);
  assert.equal(page[0].workflowId,flows[24].workflowId);
  assert.notEqual(page[0].workflowId,flows[44].workflowId);
});

test('batch query exact keys, not arbitrary URLs or a 25-flow request',()=>{
  const query=batchRunQuery(flows.slice(0,4));
  const q=new URLSearchParams(query);
  assert.deepEqual(q.getAll('flow'),flows.slice(0,4).map(key));
  assert.equal(batchRunQuery(flows.slice(0,5)),null);
  assert.equal(batchRunQuery([]),null);
  assert.equal(batchRunQuery([{...flows[0],workflowId:'../../run'}]),null);
  assert.equal(batchRunQuery([{...flows[0],environmentId:'https://evil'}]),null);
});

test('only matched, verified status is returned; unavailable cannot produce green status',()=>{
  const flows2=flows.slice(0,2);
  const results=[row(flows2[0]),{...row(flows2[1]),runIdentitySource:'NOT_VERIFIED',
    runHistory:{availability:'RUNTIME_TOKEN_REJECTED',runs:[],hasMore:null}}];
  const parsed=validateRunBatch(flows2,{results});
  assert.equal(parsed.length,2);
  assert.equal(parsed[0].observation.status,'SUCCEEDED');
  assert.equal(parsed[1].observation,null);
  assert.equal(parsed[1].availability,'RUNTIME_TOKEN_REJECTED');
  assert.equal(HALT_RUN_PREFETCH.has(parsed[1].availability),true);
});

test('cross-flow, missing and malformed batch evidence is discarded completely',()=>{
  const candidates=flows.slice(0,2);
  assert.equal(validateRunBatch(candidates,{results:[row(candidates[0])]}),null);
  assert.equal(validateRunBatch(candidates,{results:[row(candidates[0]),row(candidates[0])]}),null);
  assert.equal(validateRunBatch(candidates,{results:[row(candidates[0]),{...row(candidates[1]),runHistory:{availability:'AVAILABLE',runs:[]}}]}),null);
});

test('background lifecycle is page-bound, abortable, passive and preserves manual inspector',()=>{
  const ui=readFileSync(new URL('../src/AdministrationPowerAutomate.jsx',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../../backend/app/power_platform_routes.py',import.meta.url),'utf8');
  assert.match(ui,/readJson\(`\/runtime-run-batch\?\$\{query\}`/);
  assert.match(ui,/controller\.signal\.aborted/);
  assert.match(ui,/backgroundRequest\.current\?\.abort\(\)/);
  assert.match(ui,/Checking this page's runs in the background/);
  assert.match(ui,/cached\.payload/);
  assert.match(ui,/onClick=\{event => void readRuns\(flow, event\.currentTarget\)\}/);
  assert.match(ui,/X-Riggs-Passive-Read/);
  assert.match(routes,/Depends\(require_administration_owner\)/);
  assert.match(routes,/ThreadPoolExecutor\(max_workers=2\)/);
  assert.match(routes,/if not 1 <= len\(flow\) <= 4:/);
  assert.doesNotMatch(routes,/def (?:delete_flow|restart_flow|resubmit_run)/);
});
