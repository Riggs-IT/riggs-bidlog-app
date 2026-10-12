import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveSessionIdleTimeoutMs, DEFAULT_SESSION_IDLE_TIMEOUT_SECONDS } from '../src/sessionPolicy.js';

test('browser session inactivity follows server-configured one-hour timeout', () => {
  assert.equal(resolveSessionIdleTimeoutMs({sessionIdleTimeoutSeconds: 3600}), 3_600_000);
  assert.equal(resolveSessionIdleTimeoutMs({sessionIdleTimeoutSeconds: 7200}), 7_200_000);
});

test('missing or invalid server timeout falls back to one hour', () => {
  assert.equal(DEFAULT_SESSION_IDLE_TIMEOUT_SECONDS, 3600);
  for (const value of [undefined, null, 0, -1, 12.5, '1200']) {
    assert.equal(resolveSessionIdleTimeoutMs({sessionIdleTimeoutSeconds:value}), 3_600_000);
  }
  assert.equal(resolveSessionIdleTimeoutMs(null), 3_600_000);
});

test('frontend checks use the session policy rather than a 20-minute constant', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /resolveSessionIdleTimeoutMs\(user\)/);
  assert.doesNotMatch(app, /INACTIVITY_TIMEOUT_MS/);
  assert.doesNotMatch(app, /20 minutes of inactivity/);
  assert.equal((app.match(/>= inactivityTimeoutMs/g) || []).length, 3);
});

test('authenticated backend response supplies its actual inactivity setting', () => {
  const main = readFileSync(new URL('../../backend/app/main.py', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../../backend/app/config.py', import.meta.url), 'utf8');
  assert.match(main, /payload\["sessionIdleTimeoutSeconds"\] = settings\.session_idle_timeout_seconds/);
  assert.match(config, /session_idle_timeout_seconds: int = 3600/);
});
