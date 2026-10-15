import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const backend = name => readFileSync(new URL(`../../backend/app/${name}`, import.meta.url), 'utf8');

test('toolbar starts one shared rebuild; reads each dataset only when this run finishes it', () => {
  const hook = src('useProjectedBillingsFreshness.js');
  assert.match(hook, /dashboard-cache\/refresh/);
  assert.match(hook, /method: 'POST'/);
  assert.match(hook, /status\.status === 'RUNNING'/);
  assert.match(hook, /progressive\.startReady\(status\)/);
  assert.match(hook, /progressive\.finish\(status, updateCacheStatus\)/);
  const successfulRefresh = hook.slice(hook.indexOf('const receipt = await'), hook.indexOf('if (isRefreshCooldown(error))'));
  assert.doesNotMatch(successfulRefresh, /const results = await batch\(\{ replace: true, passive: false \}\);/);
  assert.doesNotMatch(hook, /refreshAll: \(\) => reads\.batch\(\{[^}]*fresh: true/);
});

test('manual rebuild and status require real Projected Billings authorization', () => {
  const main = backend('main.py');
  for (const route of [
    'projected_billings_cache_status',
    'projected_billings_cache_refresh',
  ]) {
    const start = main.indexOf(`def ${route}(`);
    assert.notEqual(start, -1);
    const body = main.slice(start, start + 420);
    assert.match(body, /get_current_user/);
    assert.match(body, /_require_projected_workspace_access\(current_user\)/);
  }
});

test('Cloud Run reads bridge snapshots without retaining a second portfolio TTL', () => {
  const api = backend('data_api.py');
  for (const name of [
    'get_current_projected_billings',
    'get_current_projects_monthly_bulk',
    'get_active_bid_dashboard',
  ]) {
    const from = api.indexOf(`def ${name}(*, fresh: bool = False)`);
    assert.notEqual(from, -1);
    assert.doesNotMatch(api.slice(from, from + 200), /_dashboard_cached\(/);
  }
  assert.match(api, /data_api_dashboard_read_timeout_seconds/);
});

test('automatic refresh is passive and never activates the manual spinner', () => {
  const hook = src('useProjectedBillingsFreshness.js');
  assert.match(hook, /const showSpinner = !config\?\.passive/);
  assert.match(hook, /if \(showSpinner\) \{\s*state\.busy \+= 1;\s*setRefreshing\(true\)/);
  assert.match(hook, /watchVisibleReads\(reads\.batch/);
  assert.match(hook, /allowed: \(\) => reads\.usable\(\) && !reads\.state\.manualRefreshInProgress/);
});
