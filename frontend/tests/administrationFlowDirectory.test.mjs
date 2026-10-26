import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {flowDirectoryEnvironments, flowDirectoryPage} from '../src/administrationPowerAutomateEvidence.mjs';

const guid = index => `00000000-0000-4000-8000-${String(index).padStart(12,'0')}`;
const sample = Array.from({length: 60}, (_, index) => ({
  name: index === 4 ? 'Vendor Delete Cognito to SQL' : `Flow ${String(index).padStart(2,'0')}`,
  environmentId: index % 2 === 0 ? 'Default-riggs' : 'Production-riggs',
  environmentName: index % 2 === 0 ? 'Riggs Default' : 'Riggs Production',
  workflowId: guid(index + 1), platformState: 'UNKNOWN', runLookupVerified: false,
  lastRunState:'NOT_COLLECTED', modifiedAtUTC: null,
}));
const component = readFileSync(new URL('../src/AdministrationPowerAutomate.jsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../backend/app/power_platform_routes.py', import.meta.url), 'utf8');

test('directory displays 25 rows, pages through sample without extra provider calls', () => {
  const first = flowDirectoryPage(sample);
  assert.deepEqual([first.matched, first.pages, first.page, first.start, first.end, first.rows.length],
    [60, 3, 1, 1, 25, 25]);
  const second = flowDirectoryPage(sample, {page:2});
  assert.deepEqual([second.start,second.end,second.rows[0].workflowId], [26,50,guid(26)]);
  const final = flowDirectoryPage(sample, {page:999});
  assert.deepEqual([final.page,final.start,final.end,final.rows.length], [3,51,60,10]);
});

test('search trims and matches flow names case-insensitively, preserving server ordering', () => {
  const result = flowDirectoryPage(sample,{search:'  COGNITO TO SQL  '});
  assert.equal(result.matched, 1);
  assert.equal(result.rows[0].name, 'Vendor Delete Cognito to SQL');
  assert.equal(result.pages,1);
});

test('environment filter uses stable ID, permits 50 rows, and never fabricates a total', () => {
  const environments = flowDirectoryEnvironments(sample);
  assert.deepEqual(environments.map(e => e.id), ['Default-riggs','Production-riggs']);
  const result = flowDirectoryPage(sample,{environmentId:'Default-riggs', pageSize:50});
  assert.equal(result.matched,30);
  assert.ok(result.rows.every(f => f.environmentId === 'Default-riggs'));
  assert.deepEqual(flowDirectoryPage(sample,{search:'does not exist'}).rows, []);
  assert.deepEqual(flowDirectoryPage(null).rows, []);
});

test('connection effects are stable across parent renders and idle status checks', () => {
  assert.match(component, /const sessionCallback = useRef\(onSessionError\)/);
  assert.match(component, /const checkConnection = useCallback/);
  assert.match(component, /setConnection\(previous => previous\?\.connected === next.connected/);
  assert.match(component, /if \(!visibleNow\(\) \|\| statusRequest.current\) return/);
  assert.match(component, /if \(!visibleNow\(\) \|\| !connectionRef.current\?\.connected \|\| inventoryRequest.current/);
  assert.match(component, /setInventoryPhase\(inventoryRef.current \? 'refreshing' : 'loading'\)/);
  assert.match(component, /\['idle', 'paused'\]\.includes\(inventoryPhase\)/);
  assert.match(component, /document.addEventListener\('visibilitychange', onVisibility\)/);
  assert.doesNotMatch(component, /\[connection, handleReadError\]/);
});

test('role denial revokes private results, provider denial does not masquerade as role loss', () => {
  assert.match(component, /response.status === 403\) return \{error: 'ADMIN_ACCESS_DENIED'\}/);
  assert.match(component, /SAFE_READ_ERRORS.has\(body\?\.detail\)/);
  assert.match(component, /\['SESSION_EXPIRED', 'ADMIN_ACCESS_DENIED', 'RECONNECT_REQUIRED'\]/);
  assert.match(component, /setInventoryResult\(null\)/);
  assert.match(component, /\/inspect`/);
  assert.doesNotMatch(component, /flow\.runLookupVerified !== true/);
  assert.match(component, /sessionCallback.current\?\.\(\{status: 401/);
  assert.match(backend, /Depends\(require_administration_owner\)/);
  assert.doesNotMatch(component, /resubmitRun|restartFlow|deleteFlow|generic-crud/);
});
