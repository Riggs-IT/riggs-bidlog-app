import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = (name) => readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8');

test('management role shows read-only Active Projects preview and Cognito instructions', () => {
  const page = source('ActiveProjectsWorkspace.jsx');
  assert.match(page, /role === 'MANAGEMENT_ADMIN'/);
  assert.match(page, /management-admin-preview/);
  assert.match(page, /UNDER DEVELOPMENT · VIEW ONLY/);
  assert.match(page, /Cognito’s Job Information Sheet/);
  const drawer = source('ActiveProjectEditDrawer.jsx');
  assert.match(drawer, /const canEdit = role === 'ADMIN'/);
  assert.match(drawer, /managementPreview/);
  assert.match(drawer, /Operations Schedule controls here are not the approved workflow/);
  assert.match(drawer, /job\.entryLink/);
  assert.match(drawer, /canEdit && !loading && !loadError && payload && form/);
});

test('management admin keeps Bid Log business editing, PM editing, and full financial details', () => {
  const files = ['BidLogWorkspace.jsx', 'BidLogEditDrawer.jsx', 'BidLogOutcomeEditDrawer.jsx',
    'ActiveBidBillingDrawer.jsx', 'OriginatingBidPanel.jsx', 'useGcReference.js',
    'App.jsx', 'CompletedProjectBillingDrawer.jsx', 'CurrentProjectBillingDrawer.jsx',
    'ProjectAccountability.jsx'];
  for (const filename of files) {
    assert.match(source(filename), /MANAGEMENT_ADMIN/, filename);
  }
});

test('management admin can submit forecast policy updates and Admin Corrections', () => {
  const panel = source('PMForecastPanel.jsx');
  assert.match(panel, /const isAdmin =\s*role === 'ADMIN' \|\| role === 'MANAGEMENT_ADMIN'/);
  assert.match(panel, /!isAdmin/);
  assert.match(panel, /\{isAdmin\s*&& policy/);
  assert.match(panel, /\{isAdmin\s*&& latest/);
  // The Active Projects master-edit shortcut remains strictly ADMIN-only.
  assert.match(source('CurrentProjectBillingDrawer.jsx'), /const canOpenEditor =\s*String\([\s\S]*?=== 'ADMIN'/);
});
