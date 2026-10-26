import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {unifiedFlowInventoryEvidence} from '../src/administrationPowerAutomateEvidence.mjs';

const F='33333333-3333-4333-8333-333333333333';
const E='Default-11111111-1111-4111-8111-111111111111';
const base={availability:'PARTIAL',coverage:'BOUNDED_ACCESSIBLE_ENVIRONMENTS_ONLY',
  coverageComplete:false,hasMore:true,environments:[],flows:[],providerResults:[
    {provider:'POWER_PLATFORM_TENANT_INVENTORY',availability:'ACCESS_DENIED',rows:0,hasMore:null},
    {provider:'DATAVERSE_ENVIRONMENT_API',availability:'AVAILABLE',rows:0,hasMore:false},
  ]};

test('tenant permission denied never becomes a verified zero',()=>{
  const r=unifiedFlowInventoryEvidence(base);
  assert.equal(r.count,null);
  assert.match(r.message,/does not verify/);
  assert.equal(r.providers[0].availability,'ACCESS_DENIED');
});
test('tenant-sourced flow renders with explicit unverified run history',()=>{
  const r=unifiedFlowInventoryEvidence({...base,availability:'AVAILABLE',flows:[{
    workflowId:F,environmentId:E,environmentName:'Riggs Default',name:'Foundation Import',
    platformState:'UNKNOWN',lastRunState:'NOT_COLLECTED',runLookupVerified:false,
    modifiedAtUTC:'2026-10-26T12:00:00Z',
  }]});
  assert.equal(r.count,1);
  assert.equal(r.flows[0].runLookupVerified,false);
});
test('one Administration table reports provider coverage and permits selected-only run lookup',()=>{
  const src=fs.readFileSync(new URL('../src/AdministrationPowerAutomate.jsx',import.meta.url),'utf8');
  assert.match(src,/Microsoft flow inventory providers/);
  assert.match(src,/riggs-flow-clickable-row/);
  assert.match(src,/\/inspect`/);
  assert.ok(!src.includes('select_account'));
});
