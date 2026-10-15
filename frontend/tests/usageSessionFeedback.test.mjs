import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isTerminalUsageHeartbeat } from '../src/usageSessionFeedback.js';

const id = '7800cee0-92d2-43b1-a7dc-7731e6bb8d55';
const another = '7800cee0-92d2-43b1-a7dc-7731e6bb8d56';

test('only a positive terminal flag for the currently submitted ID triggers recovery', () => {
  assert.equal(isTerminalUsageHeartbeat({sessionEnded:true,usageSessionId:id},id,id),true);
  assert.equal(isTerminalUsageHeartbeat({sessionEnded:true,usageSessionId:id.toUpperCase()},id,id),true);
  assert.equal(isTerminalUsageHeartbeat({sessionEnded:false,usageSessionId:id},id,id),false);
  assert.equal(isTerminalUsageHeartbeat({usageSessionId:id},id,id),false);
  assert.equal(isTerminalUsageHeartbeat({sessionEnded:1,usageSessionId:id},id,id),false);
  assert.equal(isTerminalUsageHeartbeat({sessionEnded:'true',usageSessionId:id},id,id),false);
});

test('stale, mismatched, missing or invalid IDs do not trigger recovery', () => {
  assert.equal(isTerminalUsageHeartbeat({sessionEnded:true,usageSessionId:another},id,id),false);
  assert.equal(isTerminalUsageHeartbeat({sessionEnded:true,usageSessionId:id},id,another),false);
  assert.equal(isTerminalUsageHeartbeat({sessionEnded:true},id,id),false);
  assert.equal(isTerminalUsageHeartbeat(null,id,id),false);
  assert.equal(isTerminalUsageHeartbeat({sessionEnded:true,usageSessionId:id},null,id),false);
});

test('React wiring includes one bounded retry and in-flight guard, without changing logout semantics', () => {
  const app = readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.match(app, /heartbeatInFlight = true/);
  assert.match(app, /heartbeatInFlight = false/);
  assert.match(app, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(app, /isTerminalUsageHeartbeat\(/);
  assert.match(app, /nextSessionId = createUsageSessionId\(\)/);
  assert.match(app, /sessionStorage\.setItem\(\s*USAGE_SESSION_STORAGE_KEY/);
  assert.match(app, /response\.status === 401/);
  assert.match(app, /if \(idleMs >= PASSIVE_IDLE_WINDOW_MS\) return;/);
  assert.match(app, /endReason:\s*'manual_logout'/);
  assert.match(app, /'inactivity_timeout'/);
});
