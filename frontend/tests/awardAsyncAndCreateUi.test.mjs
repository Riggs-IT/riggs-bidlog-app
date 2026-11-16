import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = (s) => readFileSync(new URL(`../src/${s}`, import.meta.url), 'utf8');

test('Create Bid modal is scoped to its own shell, not the global editor', () => {
  const css = read('styles/11-lifecycle-feedback.css');
  assert.match(css, /\.floating-editor-surface\.bid-log-create-drawer/);
  assert.match(css, /max-width:\s*1024px/);
  assert.doesNotMatch(css, /\.floating-editor-surface\s*\{\s*width:\s*min\(1024px/);
});

test('delegated reconnect is always actionable in fixed Create Bid footer and error toast', () => {
  const source = read('BidLogCreateDrawer.jsx');
  assert.match(source, /footer=\{[\s\S]*?reconnectNeeded[\s\S]*?Reconnect Microsoft/);
  assert.match(source, /actionLabel=\{reconnectNeeded \? 'Reconnect Microsoft'/);
  assert.match(source, /onAction=\{reconnectNeeded \?/);
  assert.match(source, /Your entries are preserved/);
});

test('queued award is not misreported as a finished Award', () => {
  const source = read('BidLogEditDrawer.jsx');
  const workspace = read('BidLogWorkspace.jsx');
  assert.match(source, /lifecycleResult\?\.processing === true/);
  assert.match(source, /kind: 'award_queued'/);
  assert.match(workspace, /award-progress/);
  assert.match(workspace, /\['COMPLETE', 'DRAFT_REVIEW', 'REVIEW'\]/);
  assert.match(workspace, /Processing Award/);
  assert.match(workspace, /window\.sessionStorage\.setItem/);
  assert.match(workspace, /if \(state === 'REVIEW'\)/);
});
