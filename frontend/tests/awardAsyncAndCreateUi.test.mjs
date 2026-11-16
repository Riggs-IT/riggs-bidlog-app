import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = (s) => readFileSync(new URL(`../src/${s}`, import.meta.url), 'utf8');

test('all five master-record editors share Active Projects desktop dimensions', () => {
  const sharedCss = read('styles/10-active-projects.css');
  const createCss = read('styles/11-lifecycle-feedback.css');
  const create = read('BidLogCreateDrawer.jsx');
  const edit = read('BidLogEditDrawer.jsx');
  const outcome = read('BidLogOutcomeEditDrawer.jsx');
  const setup = read('ProjectSetupEditor.jsx');
  const active = read('ActiveProjectEditDrawer.jsx');
  const merge = read('BidLogMergeDialog.jsx');

  assert.match(sharedCss,
    /@media \(min-width:\s*761px\)\s*\{[\s\S]*?\.floating-editor-surface\.bid-log-edit-drawer\s*\{\s*max-width:\s*1640px;\s*margin-inline:\s*auto;/);
  assert.match(sharedCss,
    /\.floating-editor-surface,\s*\.floating-editor-surface\.bid-log-edit-drawer\s*\{\s*width:\s*100%;\s*height:\s*100%;/);
  assert.match(sharedCss, /@media \(max-width:\s*760px\)\s*\{[\s\S]*?\.floating-editor-surface\.bid-log-edit-drawer\s*\{\s*width:\s*100vw;\s*height:\s*100vh;/);
  assert.match(create, /className="bid-log-edit-drawer bid-log-create-drawer"/);
  assert.match(edit, /className="bid-log-edit-drawer"/);
  assert.match(outcome, /className="bid-log-edit-drawer bid-log-outcome-edit-drawer"/);
  assert.match(setup, /className=\{`bid-log-edit-drawer project-setup-editor/);
  assert.match(active, /className=\{`bid-log-edit-drawer active-project-edit-drawer/);
  assert.match(merge, /className="bid-merge-shell"/);
  assert.doesNotMatch(createCss, /\.floating-editor-surface\.bid-log-create-drawer\s*\{/);
  assert.doesNotMatch(createCss, /max-width:\s*(?:1024|1200)px/);
  assert.doesNotMatch(create, /Enter the core information used to start the Bid Log record/);
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
