import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDelegatedReconnectError} from '../src/delegatedReconnect.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('only delegated editing-session errors open the existing Microsoft reconnect flow', () => {
  assert.equal(isDelegatedReconnectError({status:401, message:'delegated_session_required'}), true);
  assert.equal(isDelegatedReconnectError({status:401, message:'delegated_session_expired'}), true);
  for (const detail of ['application_updated','authentication_required','invalid_session']) {
    assert.equal(isDelegatedReconnectError({status:401, message:detail}), false, detail);
  }
  assert.equal(isDelegatedReconnectError({status:403, message:'delegated_session_required'}), false);
  assert.equal(isDelegatedReconnectError({status:409, message:'bid_log_outcome_changed'}), false);
});

test('outcome editor preserves draft and provides one inline delegated-reconnect prompt', () => {
  const editor = source('../src/BidLogOutcomeEditDrawer.jsx');
  assert.match(editor, /if \(isDelegatedReconnectError\(error\)\)\s*\{\s*setReconnectNeeded\(true\)/);
  assert.match(editor, /await reconnectMicrosoft\(\)/);
  assert.match(editor, /await checkMicrosoftReconnect\(\)/);
  assert.match(editor, /reconnectNeeded\s*&&\s*\(/);
  assert.match(editor, /Reconnect Microsoft/);
  assert.match(editor, /Check connection/);
  assert.match(editor, /reconnectNeeded \|\| reconnecting/);
  assert.match(editor, /Your unsaved bid changes are still here/);
  for (const fn of ['reconnectOutcomeMicrosoft','checkOutcomeMicrosoft']) {
    const start = editor.indexOf(`async function ${fn}()`);
    const end = editor.indexOf('\n  }',start);
    assert.ok(start>0 && end>start);
    assert.doesNotMatch(editor.slice(start,end), /\brequestJson\(|\bfetch\(/,
      `${fn} must not replay a business write`);
  }
});

test('Create/Edit/Merge keep existing local reconnect; global deployment logout remains intact', () => {
  for (const file of ['BidLogCreateDrawer.jsx','BidLogEditDrawer.jsx','BidLogMergeDialog.jsx']) {
    const contents=source(`../src/${file}`);
    assert.match(contents, /reconnectMicrosoft\(/,file);
    assert.match(contents, /checkMicrosoftReconnect\(/,file);
  }
  const app=source('../src/App.jsx');
  assert.match(app,/window\.location\.replace\(error\.detail === 'application_updated'/);
  assert.match(app,/\/?auth_error=application_updated/);
  assert.doesNotMatch(app,/WriteAuthRecoveryBanner/);
  const outcome=source('../src/BidLogOutcomeEditDrawer.jsx');
  assert.doesNotMatch(outcome,/WriteAuthRecoveryBanner/);
});
