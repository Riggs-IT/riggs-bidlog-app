import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {flowDirectoryPage} from '../src/administrationPowerAutomateEvidence.mjs';
import {selectedFlowInspection, verifiedRunObservation, checkedFlowKey, inspectionMessage} from '../src/administrationFlowInspection.mjs';

const flows = Array.from({length:5},(_,i)=>({
  environmentId:'Default-11111111-1111-4111-8111-111111111111',
  workflowId:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,
  name:`Flow ${i+1}`, modifiedAtUTC:`2026-10-2${i}T20:00:00Z`,
}));
const key=i=>checkedFlowKey(flows[i]);

test('checked failures rank before other checked latest runs; unchecked retain modification order',()=>{
  const observations={
    [key(0)]:{status:'SUCCEEDED',startedAtUTC:'2026-10-26T12:00:00Z'},
    [key(1)]:{status:'FAILED',startedAtUTC:'2026-10-25T12:00:00Z'},
    [key(2)]:{status:'FAILED',startedAtUTC:'2026-10-26T07:00:00Z'},
  };
  const view=flowDirectoryPage(flows,{sortBy:'RUNS',observations});
  assert.deepEqual(view.rows.map(x=>x.name),['Flow 3','Flow 2','Flow 1','Flow 5','Flow 4']);
  assert.equal(view.matched,5);
  assert.equal(flowDirectoryPage(flows,{sortBy:'MODIFIED'}).rows[0].name,'Flow 1');
});

test('empty or unverified identity never earns green check or failure rank',()=>{
  const empty=selectedFlowInspection({details:{availability:'UNVERIFIED_EMPTY'},
    runIdentitySource:'NOT_VERIFIED',runHistory:{availability:'IDENTITY_NOT_VERIFIED',runs:[],hasMore:null}});
  assert.equal(empty.valid,true);
  assert.equal(verifiedRunObservation(empty),null);
  assert.match(inspectionMessage(empty),/could not verify run history/);
  const falsePositive=selectedFlowInspection({details:{availability:'AVAILABLE'},
    runIdentitySource:'NOT_VERIFIED',runHistory:{availability:'AVAILABLE',runs:[
      {runId:'x',status:'SUCCEEDED',startedAtUTC:'2026-10-26T10:00:00Z'}],hasMore:false}});
  assert.equal(verifiedRunObservation(falsePositive),null);
  const verified=selectedFlowInspection({details:{availability:'UNVERIFIED_EMPTY'},
    runIdentitySource:'TENANT_WORKFLOW_ENTITY_ID',runHistory:{availability:'AVAILABLE',runs:[
      {runId:'good',status:'FAILED',startedAtUTC:'2026-10-26T10:00:00Z'}],hasMore:false}});
  assert.equal(verifiedRunObservation(verified).status,'FAILED');
});

test('main admin page places people beside needs attention without a new read',()=>{
  const ui=readFileSync(new URL('../src/AdministrationDashboard.jsx', import.meta.url),'utf8');
  assert.match(ui, /className="administration-top-grid"[\s\S]{0,180}<AdministrationAttention overview=\{overview\}/);
  assert.match(ui, /<AdministrationUsagePanel[\s\S]{0,400}<\/div>/);
  assert.equal((ui.match(/<AdministrationUsagePanel/g)||[]).length,1);
  assert.match(ui, /<AdministrationPowerAutomate onSessionError=/);
  assert.ok(ui.indexOf('id="administration-queues"') < ui.indexOf('id="administration-cache"'));
  assert.equal((ui.match(/className="administration-advanced-details"/g)||[]).length,1);
});

test('whole row remains clickable; no details arrow; modal supports backdrop and button-style portal',()=>{
  const ui=readFileSync(new URL('../src/AdministrationPowerAutomate.jsx', import.meta.url),'utf8');
  assert.match(ui, /onClick=\{event => void readRuns\(flow, event.currentTarget\)\}/);
  assert.doesNotMatch(ui, /riggs-flow-row-chevron|<th[^>]*>Details<\/th>/);
  assert.match(ui, /getBoundingClientRect\(\)/);
  assert.match(ui, /riggs-flow-portal-button/);
  assert.match(ui, /Latest verified run/);
});
