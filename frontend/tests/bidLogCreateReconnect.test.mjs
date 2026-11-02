import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDelegatedReconnectError} from '../src/delegatedReconnect.js';

const source = readFileSync(new URL('../src/BidLogCreateDrawer.jsx', import.meta.url), 'utf8');

// Exercise the actual non-React classification helper.
test('only delegated-session 401 errors trigger Microsoft reconnect UI', () => {
  assert.equal(isDelegatedReconnectError({status:401, message:'delegated_session_expired'}), true);
  assert.equal(isDelegatedReconnectError({status:401, message:'delegated_session_required'}), true);
  assert.equal(isDelegatedReconnectError({status:401, message:'unrelated_login_failure'}), false);
  assert.equal(isDelegatedReconnectError({status:503, message:'delegated_session_expired'}), false);
  assert.equal(isDelegatedReconnectError(null), false);
});

test('Create Bid shows reconnect and check-connection actions while preserving draft', () => {
  assert.match(source, /if \(isDelegatedReconnectError\(error\)\) \{\s*setReconnectNeeded\(true\)/);
  assert.match(source, /reconnectNeeded &&/);
  assert.match(source, /Reconnect Microsoft/);
  assert.match(source, /Check connection/);
  assert.match(source, /await reconnectMicrosoft\(\)/);
  assert.match(source, /await checkMicrosoftReconnect\(\)/);
  assert.match(source, /Your new bid details are still here/);
  assert.match(source, /click Create Bid again/);
});

test('Reauthentication does not replay Create Bid automatically', () => {
  const start = source.indexOf('async function reconnectCreateMicrosoft()');
  const end = source.indexOf('  if (!open) {', start);
  assert.ok(start > 0 && end > start);
  const handlers = source.slice(start, end);
  assert.doesNotMatch(handlers, /createBid\s*\(/);
  assert.doesNotMatch(handlers, /requestJson\s*\(/);
});

test('New-bid PM label documents server-owned Assigned status', () => {
  assert.match(source, /Selecting a PM starts this bid as Assigned/);
});
