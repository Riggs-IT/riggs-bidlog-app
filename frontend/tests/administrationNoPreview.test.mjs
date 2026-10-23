import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('there is no synthetic/local Administration preview or alternate navigation', () => {
  const app = source('../src/App.jsx');
  for (const removed of [
    'adminPreview', 'AdministrationPreview', 'administration-preview',
    'localAdminPreview', 'shouldOfferAdministrationPreview',
    'Administration preview (sample)',
  ]) assert.equal(app.includes(removed), false, `Unexpected preview wiring: ${removed}`);

  for (const removedPath of [
    '../src/AdministrationPreview.jsx',
    '../src/administrationPreviewData.mjs',
    '../src/administrationPreviewGate.mjs',
    './administrationLocalPreview.test.mjs',
  ]) assert.equal(existsSync(new URL(removedPath, import.meta.url)), false, removedPath);
});

test('the actual tab and endpoints still require the unchanged server-owned identity', () => {
  const app = source('../src/App.jsx');
  const main = source('../../backend/app/main.py');
  const auth = source('../../backend/app/auth.py');
  assert.match(app, /const canViewAdministration = user\?\.canViewAdministration === true/);
  assert.match(app, /\{canViewAdministration && \(/);
  assert.match(app, /activePage === 'administration'\s*&& canViewAdministration/);
  assert.match(main, /Depends\(require_administration_owner\)/);
  assert.match(auth, /settings\.auth_mode != "entra"/);
  assert.match(auth, /user\.eid != 2021/);
  assert.match(auth, /configured_owner == current_oid == session_oid/);
  assert.match(auth, /configured_tenant == current_tenant == session_tenant/);
});

test('existing monitoring, passive reads and queue aging survive preview removal', () => {
  const dashboard = source('../src/AdministrationDashboard.jsx');
  assert.match(dashboard, /summarizeAdministration\(overview\)/);
  assert.match(dashboard, /queueEvidence\(monitoring\.queues, monitoring\.observedAtUTC\)/);
  assert.match(dashboard, /queueAgeLabel\(item\.oldestPendingAgeSeconds\)/);
  assert.match(dashboard, /X-Riggs-Passive-Read/);
  assert.match(dashboard, /document\.visibilityState !== 'visible'/);
  assert.match(dashboard, /setInterval\(refreshVisible, 60_000\)/);
  assert.doesNotMatch(dashboard, /method:\s*'POST'|\/api\/admin\/restart/);
});
