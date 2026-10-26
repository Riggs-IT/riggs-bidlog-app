import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {describeSourceTimestamp, validSourceEvidence} from '../src/administrationSourceEvidence.mjs';

const fixture = () => ({
  readOnly: true, availability: 'AVAILABLE', source: 'RIGGSDATAHUB_SOURCE_EVIDENCE',
  observedAtUTC: '2026-10-26T16:00:00+00:00',
  rows: [
    {sourceKey:'foundation_jobs', evidenceType:'SOURCE_LAST_MODIFIED', timestampBasis:'UTC', recordFound:true, lastRecordedValue:'2026-10-26T15:00:00.000'},
    {sourceKey:'foundation_billings', evidenceType:'SOURCE_LAST_MODIFIED', timestampBasis:'UNVERIFIED_SOURCE_CLOCK', recordFound:true, lastRecordedValue:'2026-10-26T11:00:00.000'},
    {sourceKey:'sharepoint_bids', evidenceType:'MIRROR_ITEM_SYNC', timestampBasis:'UTC', recordFound:true, lastRecordedValue:'2026-10-26T14:00:00'},
    {sourceKey:'sharepoint_orders', evidenceType:'MIRROR_ITEM_SYNC', timestampBasis:'UTC', recordFound:false, lastRecordedValue:null},
    {sourceKey:'ops_projects', evidenceType:'SOURCE_LAST_MODIFIED', timestampBasis:'UNVERIFIED_SOURCE_CLOCK', recordFound:true, lastRecordedValue:null},
  ],
});

test('five grounded source records validate; real null differs from missing records', () => {
  assert.equal(validSourceEvidence(fixture()), true);
  const missing = fixture(); missing.rows[3].lastRecordedValue = null;
  assert.equal(validSourceEvidence(missing), true);
  assert.match(describeSourceTimestamp(missing.rows[3], missing.observedAtUTC).value, /No source row/);
  assert.match(describeSourceTimestamp(missing.rows[4], missing.observedAtUTC).value, /Not recorded/);
});

test('never attach UTC or calculate age on unverified source clocks', () => {
  const d = fixture();
  const unverified = describeSourceTimestamp(d.rows[1], d.observedAtUTC);
  assert.match(unverified.detail, /timezone unverified; no age calculated/);
  const utc = describeSourceTimestamp(d.rows[0], d.observedAtUTC);
  assert.match(utc.detail, /1 hr since recorded event/);
});

test('reject missing, extra, mislabelled, timezone-forged or non-readonly records', () => {
  const mutate = [
    d => d.rows.pop(),
    d => d.rows.push({...d.rows[0]}),
    d => {d.rows[0].sourceKey = 'arbitrary_sql';},
    d => {d.rows[1].timestampBasis = 'UTC';},
    d => {d.rows[2].lastRecordedValue = '2026-10-26T14:00:00Z';},
    d => {d.rows[0].payload = 'SENSITIVE'; d.rows[0].lastRecordedValue = 'EXPOSED';},
    d => {d.rows[0].lastRecordedValue = null; d.rows[0].recordFound = 'true';},
    d => {d.readOnly = false;},
    d => {d.availability = 'UNAVAILABLE';},
  ];
  for (const m of mutate) {const d = fixture(); m(d); assert.equal(validSourceEvidence(d),false);}
});

test('source fetch is explicit, passive, abortable; owner route and no local preview', () => {
  const ui = readFileSync(new URL('../src/AdministrationSources.jsx',import.meta.url),'utf8');
  const dashboard = readFileSync(new URL('../src/AdministrationDashboard.jsx',import.meta.url),'utf8');
  const backend = readFileSync(new URL('../../backend/app/main.py',import.meta.url),'utf8');
  const auth = readFileSync(new URL('../../backend/app/auth.py',import.meta.url),'utf8');
  assert.match(ui, /fetch\('\/api\/admin\/source-evidence'/);
  assert.match(ui, /'X-Riggs-Passive-Read': '1'/);
  assert.doesNotMatch(ui, /setInterval|setTimeout|POST|restart|replay|adminPreview/);
  assert.match(ui, /document\.visibilityState/);
  assert.match(ui, /pending\.current\?\.abort\(\)/);
  assert.match(dashboard, /<AdministrationSources onSessionError=\{onSessionError\}\/>/);
  assert.match(backend, /@app\.get\("\/api\/admin\/source-evidence"\)/);
  assert.match(backend, /Depends\(require_administration_owner\)/);
  assert.match(auth, /admin_owner_entra_object_id/);
  assert.match(auth, /"\/api\/admin\/source-evidence"/);
  assert.doesNotMatch(backend, /@app\.post\("\/api\/admin\/source-evidence"\)/);
});
