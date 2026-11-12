import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeAdministration} from '../src/administrationSignals.mjs';

const component = readFileSync(new URL('../src/AdministrationTerminalIncidents.jsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../backend/app/main.py', import.meta.url), 'utf8');

test('Incident panel is two-tab archive with on-demand readback', () => {
  assert.match(component, /fetch\('\/api\/admin\/terminal-cases'/);
  assert.match(component, /'X-Riggs-Passive-Read': '1'/);
  assert.match(component, /document.visibilityState !== 'visible'/);
  assert.match(component, /controller\.abort\(\)/);
  assert.match(component, /Needs review/);
  assert.match(component, /Resolved/);
  assert.match(component, /onClick=\{\(\) => openReview\(row\)\}/);
  assert.match(component, /fetch\(`\/api\/admin\/terminal-cases\/\$\{row\.incidentId\}\/review`/);
});

test('No blind force endpoint; all mutation controls have server-derived actor and confirmation', () => {
  assert.match(component, /review\.canVerifyResolve/);
  assert.match(component, /review\.canRetry/);
  assert.match(component, /review\.retryEnabled/);
  assert.match(component, /requestId: crypto\.randomUUID\(\)/);
  assert.match(component, /window\.confirm\(message\)/);
  assert.doesNotMatch(component, /force:\s*true|rawError|lastError|fetch\(.*webhook/);
  assert.match(backend, /Depends\(require_administration_owner\)/);
  assert.match(backend, /_admin_mutation_origin\(request\)/);
});

test('Only unresolved historic cases appear in Needs Attention', () => {
  const old = summarizeAdministration({}, {availability:'AVAILABLE',openCount:0,resolvedCount:10});
  assert.equal(old.issues.filter(x => x.id === 'terminal-incidents').length,0);
  const open = summarizeAdministration({}, {availability:'AVAILABLE',openCount:3,resolvedCount:10});
  assert.equal(open.issues.filter(x => x.id === 'terminal-incidents').length,1);
});
