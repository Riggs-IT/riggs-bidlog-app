import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  classifyWriteAuthFailure,
  notifyWriteAuthFailure,
  APPLICATION_WRITE_AUTH_EXPIRED_EVENT,
} from '../src/writeAuthRecovery.mjs';

const source = path => readFileSync(new URL(path, import.meta.url),'utf8');

test('only application-session 401 on a business write routes to existing sign-in', () => {
  for (const code of ['application_updated','invalid_session','authentication_required','session_inactive_timeout']) {
    assert.equal(classifyWriteAuthFailure(401, code, 'POST'), 'application', code);
  }
  assert.equal(classifyWriteAuthFailure(401, {code:'invalid_session'}, 'DELETE'), 'application');
  assert.equal(classifyWriteAuthFailure(401, {detail:'application_updated'}, 'PUT'), 'application');
  assert.equal(classifyWriteAuthFailure(401, 'application_updated', 'GET'), null);
  assert.equal(classifyWriteAuthFailure(401, 'authentication_required', 'OPTIONS'), null);
  assert.equal(classifyWriteAuthFailure(403, 'authentication_required', 'PATCH'), null);
  assert.equal(classifyWriteAuthFailure(409, 'invalid_session', 'PATCH'), null);
});

test('delegated Microsoft errors do not dispatch application sign-in', () => {
  for (const method of ['POST','PATCH','PUT','DELETE']) {
    assert.equal(classifyWriteAuthFailure(401, 'delegated_session_required', method), null);
    assert.equal(classifyWriteAuthFailure(401, 'delegated_session_expired', method), null);
  }
  assert.equal(classifyWriteAuthFailure(401, 'bid_log_outcome_changed', 'PATCH'), null);
});

test('events only carry a safe reason, never request bodies, credentials, or response data', () => {
  const beforeWindow=globalThis.window;
  const beforeEvent=globalThis.CustomEvent;
  const events=[];
  globalThis.CustomEvent=class MockEvent {constructor(type, config){this.type=type;this.detail=config.detail;}};
  globalThis.window={dispatchEvent: event=>{events.push(event);return true;}};
  try {
    assert.equal(notifyWriteAuthFailure(401, 'application_updated', 'PUT'), 'application');
    assert.equal(notifyWriteAuthFailure(401, 'invalid_session', 'POST'), 'application');
    assert.equal(notifyWriteAuthFailure(401, 'delegated_session_required', 'PATCH'), null);
    assert.equal(notifyWriteAuthFailure(403, 'invalid_session', 'PATCH'), null);
    assert.equal(events.length,2);
    assert.equal(events[0].type,APPLICATION_WRITE_AUTH_EXPIRED_EVENT);
    assert.deepEqual(events[0].detail,{reason:'application_updated'});
    assert.deepEqual(events[1].detail,{reason:'authentication_required'});
  } finally {globalThis.window=beforeWindow;globalThis.CustomEvent=beforeEvent;}
});

test('App handles application writes via existing redirect, without another login component', () => {
  const app=source('../src/App.jsx');
  assert.match(app,/window\.addEventListener\(APPLICATION_WRITE_AUTH_EXPIRED_EVENT, onApplicationWriteSessionExpired\)/);
  assert.match(app,/handleReadSessionError\(\{/);
  assert.match(app,/window\.location\.replace\(error\.detail === 'application_updated'/);
  assert.doesNotMatch(app,/WriteAuthRecoveryBanner/);
  assert.doesNotMatch(source('../src/writeAuthRecovery.mjs'),/\/api\/auth\/login|\/api\/auth\/me|reconnectMicrosoft/);
});

test('write surfaces reuse application sign-in only; outcome delegates to its own editor', () => {
  for (const file of [
    'BidLogCreateDrawer.jsx','BidLogEditDrawer.jsx','BidLogMergeDialog.jsx',
    'BidLogOutcomeEditDrawer.jsx', 'PMForecastPanel.jsx', 'ActiveBidBillingDrawer.jsx',
    'ActiveProjectEditDrawer.jsx', 'activeProjectSave.js', 'OriginatingBidPanel.jsx',
  ]) {
    const contents=source(`../src/${file}`);
    assert.match(contents,/notifyWriteAuthFailure\(/,file);
  }
  const outcome=source('../src/BidLogOutcomeEditDrawer.jsx');
  assert.match(outcome,/if \(isDelegatedReconnectError\(error\)\)/);
  assert.match(outcome,/await reconnectMicrosoft\(\)/);
  assert.doesNotMatch(outcome,/WriteAuthRecoveryBanner/);
  const create=source('../src/BidLogCreateDrawer.jsx');
  assert.match(create,/if \(!isDelegatedReconnectError\(error\)\) notifyWriteAuthFailure/);
});
