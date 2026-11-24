import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = (name) => readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), 'utf8');

test('management can edit eligible numbered projects and metrics', () => {
  const page = source('ActiveProjectsWorkspace.jsx');
  const drawer = source('ActiveProjectEditDrawer.jsx');
  assert.match(page, /const canEdit = \['ADMIN','OPERATIONS','MANAGEMENT_ADMIN'\].includes\(role\)/);
  assert.match(drawer, /const canEdit = \['ADMIN','OPERATIONS','MANAGEMENT_ADMIN'\].includes\(role\) && Number\(jobListId\) !== 24/);
  assert.match(drawer, /useNumberedProjectJis\(jobListId,canEdit/);
  assert.match(drawer, /job\.entryLink/);
  assert.match(drawer, /\(canEdit \|\| canEditMetrics\) && !loading && !loadError && payload && form/);
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
