import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root = new URL('../src/', import.meta.url);
const dashboard = readFileSync(new URL('AdministrationDashboard.jsx',root), 'utf8');
const component = readFileSync(new URL('AdministrationPowerAutomate.jsx',root), 'utf8');
const authSource = readFileSync(new URL('../../backend/app/auth.py',root), 'utf8');
const main = readFileSync(new URL('../../backend/app/main.py',root), 'utf8');

test('monitoring lives inside the established Administration page', () => {
  assert.match(dashboard, /<AdministrationPowerAutomate onSessionError=/);
  assert.doesNotMatch(main, /AdministrationPreview/);
});
test('two-account pinned Administration gate still protects the router', () => {
  assert.match(authSource, /if \(user\.eid, role\) == \(2021, "ADMIN"\)/);
  assert.match(authSource, /elif \(user\.eid, role\) == \(176, "MANAGEMENT_ADMIN"\)/);
  assert.match(authSource, /getattr\(settings, "admin_secondary_entra_object_id", ""\)/);
  assert.match(authSource, /configured_pin == current_oid == session_oid/);
  assert.match(main, /create_power_platform_router/);
});
test('monitoring never dispatches any flow mutation request', () => {
  assert.match(component, /Reload flows/);
  assert.match(component, /riggs-flow-clickable-row/);
  assert.match(component, /createPortal/);
  assert.match(component, /onClick=\{event => void readRuns\(flow, event.currentTarget\)\}/);
  assert.doesNotMatch(component, /\/flows\/.*\/run\b/);
  assert.doesNotMatch(component, /restartFlow|resubmitRun|disableFlow|deleteFlow/);
});
test('status and page-bounded background run reads remain passive; manual inspection is preserved', () => {
  assert.match(component, /X-Riggs-Passive-Read/);
  assert.match(component, /\/inventory/);
  assert.match(component, /Flow directory/);
  assert.match(component, /runtime-run-batch/);
  assert.match(component, /pageRunCandidates/);
  assert.match(component, /cached\.payload/);
});
test('flow run summary is explicitly bounded and never claims historic last success', () => {
  assert.match(component, /Last success \(returned runs\)/);
  assert.match(component, /does not prove SQL commit/);
});
