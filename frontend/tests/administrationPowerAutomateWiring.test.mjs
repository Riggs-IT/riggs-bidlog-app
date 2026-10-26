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
test('admin owner gate still authorizes the new router', () => {
  assert.match(authSource, /user\.eid != 2021/);
  assert.match(authSource, /configured_owner == current_oid == session_oid/);
  assert.match(main, /create_power_platform_router/);
});
test('monitoring never dispatches any flow mutation request', () => {
  assert.match(component, /Load flows/);
  assert.match(component, /Recent runs/);
  assert.doesNotMatch(component, /\/flows\/.*\/run\b/);
  assert.doesNotMatch(component, /restartFlow|resubmitRun|disableFlow|deleteFlow/);
});
test('status load is passive and source reads require click', () => {
  assert.match(component, /X-Riggs-Passive-Read/);
  assert.match(component, /List accessible environments/);
  assert.match(component, /Flow inventory: /);
});
test('flow run summary is explicitly bounded and never claims historic last success', () => {
  assert.match(component, /Last success in returned sample/);
  assert.match(component, /Not a guaranteed lifetime last success/);
});
