import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { selectedFlowInspection, verifiedRunObservation, inspectionMessage } from '../src/administrationFlowInspection.mjs';

const p = '../src/administrationFlowInspection.mjs';
const source = readFileSync(new URL(p, import.meta.url), 'utf8');

test('UX5 explicit returned workflow ID may verify selected-flow run evidence', () => {
  const evidence = selectedFlowInspection({
    details: { availability: 'UNVERIFIED_EMPTY', platformState: 'UNKNOWN' },
    runIdentitySource: 'RESOURCE_RUN_RESPONSE_MATCH',
    runHistory: { availability: 'AVAILABLE', runs: [
      { runId: 'safe', status: 'FAILED', startedAtUTC: '2026-10-26T16:00:00Z', endedAtUTC: '2026-10-26T16:02:00Z' },
    ] },
  });
  assert.equal(evidence.valid, true);
  assert.equal(verifiedRunObservation(evidence).status, 'FAILED');
});

test('UX5 empty probe remains identity-unverified without a fake green check', () => {
  const evidence = selectedFlowInspection({
    details: { availability: 'UNVERIFIED_EMPTY' },
    runIdentitySource: 'NOT_VERIFIED',
    runHistory: { availability: 'IDENTITY_NOT_VERIFIED',
      reasonCode: 'RESOURCE_ID_PROBE_EMPTY', runs: [] },
  });
  assert.equal(verifiedRunObservation(evidence), null);
  assert.match(inspectionMessage(evidence), /could not verify run history/i);
  assert.match(source, /RESOURCE_RUN_RESPONSE_MATCH/);
});
