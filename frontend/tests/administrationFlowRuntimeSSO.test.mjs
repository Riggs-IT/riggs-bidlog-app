import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {selectedFlowInspection, verifiedRunObservation, inspectionMessage} from '../src/administrationFlowInspection.mjs';

const src = readFileSync(new URL('../src/AdministrationPowerAutomate.jsx', import.meta.url), 'utf8');

const good = {
  environmentId: 'Default-6b230179-bcf9-4193-928b-727447b8e954',
  resourceId: '9f0c7436-813c-4980-9f2c-67073fe89290',
  details: {availability:'NOT_CHECKED',platformState:'UNKNOWN',stateSource:'NOT_VERIFIED'},
  runIdentitySource:'RUNTIME_EXACT_RESOURCE_ENDPOINT',
  runHistory: {availability:'AVAILABLE', hasMore:false, lastSuccessInReturnedSampleUTC:'2026-10-26T16:29:19Z', runs:[
    {runId:'run-1', status:'SUCCEEDED',startedAtUTC:'2026-10-26T16:29:19Z',endedAtUTC:'2026-10-26T16:29:19Z'},
    {runId:'run-2', status:'FAILED',startedAtUTC:'2026-10-21T20:08:31Z',endedAtUTC:'2026-10-21T20:08:31Z'},
  ]}
};

test('exact resource runtime response supports true latest run marker', () => {
  const selected = selectedFlowInspection(good);
  assert.equal(selected.valid, true);
  assert.equal(selected.runs.length, 2);
  assert.equal(verifiedRunObservation(selected)?.status, 'SUCCEEDED');
  assert.equal(verifiedRunObservation(selected)?.startedAtUTC,'2026-10-26T16:29:19Z');
});

test('unsupported runtime grant never becomes green or zero verified history', () => {
  for (const status of ['RUNTIME_TOKEN_GRANT_REJECTED','RUNTIME_CREDENTIAL_UNAVAILABLE','RUN_DATA_UNVERIFIABLE']) {
    const evidence = selectedFlowInspection({...good,runIdentitySource:'NOT_VERIFIED',runHistory:{availability:status,runs:[],hasMore:null}});
    assert.equal(verifiedRunObservation(evidence),null);
    assert.ok(inspectionMessage(evidence).length > 30);
  }
});

test('UI retains whole-row and modal behavior but hides redundant connect check under SSO', () => {
  assert.match(src,/onClick=\{event => void readRuns\(flow, event\.currentTarget\)\}/);
  assert.match(src,/createPortal\(/);
  assert.match(src,/connection\.singleSignOn/);
  assert.match(src,/Grant Microsoft permission if required/);
  assert.doesNotMatch(src,/runIdentitySource\s*===\s*['"]UNKNOWN['"]\s*\?\s*['"]SUCCEEDED/);
});
