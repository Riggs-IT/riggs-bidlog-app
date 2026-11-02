import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeAdministration} from '../src/administrationSignals.mjs';

const component = readFileSync(new URL('../src/AdministrationTerminalIncidents.jsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../backend/app/main.py', import.meta.url), 'utf8');

test('Incident panel uses only owner-gated passive GET and no mutation controls', () => {
  assert.match(component, /fetch\('\/api\/admin\/terminal-incidents'/);
  assert.match(component, /'X-Riggs-Passive-Read': '1'/);
  assert.match(component, /document.visibilityState !== 'visible'/);
  assert.match(component, /controller\.abort\(\)/);
  assert.doesNotMatch(component, /method: 'POST'|rawError|lastError|fetch\(.*webhook/);
  assert.match(backend, /@app.get\("\/api\/admin\/terminal-incidents"\)[\s\S]*?Depends\(require_administration_owner\)/);
});

test('History is presented as recorded evidence rather than live worker health', () => {
  assert.match(component, /Incidents are audit receipts, not a live source scan/);
  assert.match(component, /captureHealth === 'NOT_COLLECTED'/);
  assert.match(component, /No incident records have been captured/);
  assert.match(component, /lastGood\.incidents\.map\(/);
});

test('Blocked and uncertain incident counts generate one attention entry', () => {
  const result = summarizeAdministration({}, {availability:'AVAILABLE',totalCount:4,blockedCount:3,uncertainCount:1});
  const incident = result.issues.filter(x => x.id === 'terminal-incidents');
  assert.equal(incident.length, 1);
  assert.match(incident[0].description, /3 blocked and 1 uncertain/);
});
