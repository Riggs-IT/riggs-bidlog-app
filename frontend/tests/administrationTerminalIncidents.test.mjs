import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeAdministration} from '../src/administrationSignals.mjs';

const component = readFileSync(new URL('../src/AdministrationTerminalIncidents.jsx', import.meta.url), 'utf8');
const adminCss = readFileSync(new URL('../src/AdministrationDashboard.css', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../backend/app/main.py', import.meta.url), 'utf8');

test('Incident panel is two-tab archive with row Resolve and on-demand live readback', () => {
  assert.match(component, /fetch\('\/api\/admin\/terminal-cases'/);
  assert.match(component, /'X-Riggs-Passive-Read': '1'/);
  assert.match(component, /document.visibilityState !== 'visible'/);
  assert.match(component, /controller\.abort\(\)/);
  assert.match(component, /Needs review/);
  assert.match(component, /Resolved/);
  assert.match(component, /onClick=\{\(\) => openReview\(row\)\}>Resolve<\/button>/);
  assert.match(component, /fetch\(`\/api\/admin\/terminal-cases\/\$\{row\.incidentId\}\/review`/);
  assert.match(component, /<TeamDialog eyebrow="ADMINISTRATION"/);
});

test('Resolve popup uses existing styling and never offers a retry/force action', () => {
  assert.match(component, /import \{TeamDialog\} from '.\/ProjectSetupTeamSections\.jsx'/);
  assert.match(component, /className="administration-tab-row administration-queue-actions"/);
  assert.match(adminCss, /\.administration-tab-row button\[aria-pressed="true"\]/);
  assert.match(component, /className="secondary-button"/);
  assert.match(component, /className="primary-button"/);
  assert.doesNotMatch(component, /RETRY_NOT_PURSUING|Review &amp; retry|window\.confirm/);
});

test('Resolution action requires live server evidence and a new idempotency UUID', () => {
  assert.match(component, /review\.canVerifyResolve/);
  assert.match(component, /review\.verifyResolveEnabled/);
  assert.match(component, /review\.sourcePresent \|\| !review\.sqlLifecycleComplete/);
  assert.match(component, /requestId: crypto\.randomUUID\(\)/);
  assert.match(component, /operation:'VERIFY_RESOLVED', confirmed:true/);
  assert.match(component, /setReview\(null\); \/\/ do not allow a new POST/);
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
