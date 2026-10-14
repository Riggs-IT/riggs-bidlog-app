import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = relativePath => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('browser never chooses a refresh actor; authenticated backend passes its own EID', () => {
  const main = source('../../backend/app/main.py');
  const start = main.indexOf('def projected_billings_cache_refresh(');
  assert.notEqual(start, -1);
  const route = main.slice(start, start + 750);
  assert.match(route, /get_current_user/);
  assert.match(route, /_require_projected_workspace_access\(current_user\)/);
  assert.match(route, /refresh_shared_dashboard_cache\(actor_eid=current_user\.eid\)/);
  assert.match(route, /DataAPISharedRefreshRateLimited/);
  assert.match(route, /Retry-After/);
});

test('manual cooldown is displayed as a limited request, not an outage', () => {
  const app = source('../src/App.jsx');
  assert.match(app, /shared_dashboard_refresh_rate_limited/);
  assert.match(app, /Retry-After/);
  assert.match(app, /existing cached data remains available/);
});
