import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isRiggsDefaultEnvironment, flowStateLabel, runStatusLabel,
  powerAutomateFlowUrl, powerAutomateRunUrl, selectedFlowInspection, inspectionMessage,
} from '../src/administrationFlowInspection.mjs';

const flow={name:'Vendor Update Cognito to SQL',environmentId:'Default-11111111-1111-4111-8111-111111111111',
  environmentName:'Riggs Companies (default)',workflowId:'22222222-2222-4222-8222-222222222222'};
const other={...flow,environmentId:'33333333-3333-4333-8333-333333333333',environmentName:'Non-production Sandbox'};
const ui=readFileSync(new URL('../src/AdministrationPowerAutomate.jsx',import.meta.url),'utf8');
const bff=readFileSync(new URL('../../backend/app/power_platform_routes.py',import.meta.url),'utf8');

test('Riggs default environment is quiet; other environments get an exception star',()=>{
  assert.equal(isRiggsDefaultEnvironment(flow),true);
  assert.equal(isRiggsDefaultEnvironment(other),false);
  assert.equal(isRiggsDefaultEnvironment({...flow,environmentName:'Renamed',environmentId:'Default-11111111-1111-4111-8111-111111111111'}),true);
  assert.match(ui, /riggs-flow-other-star/);
  assert.match(ui, /Other environment: /);
  assert.doesNotMatch(ui, /<th>Environment<\/th>/);
});

test('unknown state is not silently interpreted as on/off or healthy',()=>{
  assert.equal(flowStateLabel('UNKNOWN'),'Not reported');
  assert.equal(flowStateLabel('PUBLISHED'),'Published');
  assert.equal(flowStateLabel('ACTIVATED'),'Activated');
  assert.equal(flowStateLabel('OFF'),'Off');
  assert.equal(runStatusLabel('FAILED'),'Failed');
  assert.match(ui, /Tenant inventory does not report whether this flow is enabled/);
});

test('selected flow reads are opt-in and provider writes remain absent',()=>{
  assert.match(ui, /onClick=\{\(\) => void readRuns\(flow\)\}/);
  assert.match(ui, /\/inspect`/);
  assert.match(bff, /Depends\(require_administration_owner\)/);
  assert.match(bff, /@router.get\("\/environments\/\{environment_id\}\/flows\/\{resource_id\}\/inspect"\)/);
  assert.doesNotMatch(bff, /@router.post\("\/environments/);
});

test('a supported return keeps last-success bounded and sorts returned runs by start',()=>{
  const ev=selectedFlowInspection({
    details:{availability:'AVAILABLE',platformState:'PUBLISHED',stateSource:'DIRECT_CLOUD_FLOW_READ'},
    runIdentitySource:'DIRECT_CLOUD_FLOW_READ',
    runHistory:{availability:'PARTIAL',hasMore:true,lastSuccessInReturnedSampleUTC:'2026-10-25T09:00:00Z',
      runs:[{runId:'run2',status:'FAILED',startedAtUTC:'2026-10-24T08:00:00Z'},
        {runId:'run1',status:'SUCCEEDED',startedAtUTC:'2026-10-25T08:00:00Z'}]},
  });
  assert.equal(ev.valid,true);
  assert.deepEqual(ev.runs.map(x=>x.runId),['run1','run2']);
  assert.equal(ev.lastSuccess,'2026-10-25T09:00:00Z');
  assert.equal(ev.lastFailure,'2026-10-24T08:00:00Z');
  assert.equal(ev.lastReturnedRun.status,'SUCCEEDED');
  assert.match(inspectionMessage(ev), /Only part/);
  assert.match(ui, /Not an all-time last success/);
  assert.match(ui, /does not prove SQL commit/);
});

test('404/403 are distinct from empty, malformed run data is rejected',()=>{
  const denied=selectedFlowInspection({details:{availability:'ACCESS_DENIED'},
    runIdentitySource:'NOT_CHECKED',runHistory:{availability:'NOT_CHECKED',runs:[],hasMore:null}});
  assert.equal(denied.valid,true);
  assert.match(inspectionMessage(denied), /not attempted/i);
  const notfound=selectedFlowInspection({details:{availability:'NO_DATAVERSE_OR_NOT_FOUND'},
    runHistory:{availability:'NO_DATAVERSE_OR_NOT_FOUND',runs:[],hasMore:null}});
  assert.match(inspectionMessage(notfound), /could not retrieve/);
  assert.equal(selectedFlowInspection({details:{availability:'AVAILABLE'},runHistory:{availability:'AVAILABLE',runs:new Array(21).fill({runId:'x'})}}).valid,false);
});

test('external portal links are fixed-host and safe for validated identity/run path only',()=>{
  assert.equal(powerAutomateFlowUrl(flow),
    'https://make.powerautomate.com/environments/Default-11111111-1111-4111-8111-111111111111/flows/22222222-2222-4222-8222-222222222222/details');
  assert.ok(powerAutomateRunUrl(flow,'08585abc-CU1').startsWith('https://make.powerautomate.com/'));
  assert.equal(powerAutomateRunUrl(flow,'evil/path'),null);
  assert.equal(powerAutomateFlowUrl({...flow,environmentId:'https://evil.invalid'}),null);
  assert.equal(powerAutomateFlowUrl({...flow,workflowId:'not-a-guid'}),null);
});
