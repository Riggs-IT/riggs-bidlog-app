import test from 'node:test';
import assert from 'node:assert/strict';
import {flowInventoryEvidence,flowRunEvidence} from '../src/administrationPowerAutomateEvidence.mjs';
const base = {availability:'AVAILABLE',hasMore:false,coverage:'SELECTED_ENVIRONMENT_ONLY',flows:[]};

test('real zero flows is 0 only with verified response',()=>{
  assert.deepEqual(flowInventoryEvidence(base),{availability:'AVAILABLE',flows:[],count:0,isComplete:true});
  assert.equal(flowInventoryEvidence(null).count,null);
});
test('access denied is unknown not zero',()=>{
  const v=flowInventoryEvidence({availability:'ACCESS_DENIED',flows:[]});
  assert.equal(v.count,null);
  assert.equal(v.isComplete,false);
});
test('partial inventory is not advertised as complete',()=>{
  const v=flowInventoryEvidence({...base,availability:'PARTIAL',hasMore:true});
  assert.equal(v.isComplete,false);
});
test('backend contract must identify last run as not collected',()=>{
  const f={environmentId:'Default-demo',workflowId:'12345678-1234-4234-8234-123456789012',name:'Test Flow',platformState:'UNKNOWN',lastRunState:'NOT_COLLECTED'};
  assert.equal(flowInventoryEvidence({...base,flows:[f]}).count,1);
  assert.equal(flowInventoryEvidence({...base,flows:[{...f,lastRunState:'SUCCEEDED'}]}).availability,'UNVERIFIED');
});
test('unknown upstream availability never turns into healthy zero',()=>{
  assert.equal(flowInventoryEvidence({...base,availability:'NOT_SUPPORTED'}).count,null);
});
test('run summary explains bounded sample',()=>{
  const v=flowRunEvidence({availability:'AVAILABLE',runs:[],coverage:'BOUNDED_SELECTED_FLOW_SAMPLE_ONLY',lastSuccessInReturnedSampleUTC:null});
  assert.equal(v.observedRuns,0);
  assert.match(v.caveat,/returned sample/);
});
test('unavailable run results have no synthetic success',()=>{
  const v=flowRunEvidence({availability:'THROTTLED',runs:[]});
  assert.equal(v.observedRuns,null);
  assert.equal(v.lastSuccessInReturnedSampleUTC,null);
});
