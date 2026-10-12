import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workspace = readFileSync(new URL('../src/BidLogWorkspace.jsx', import.meta.url), 'utf8');
const editor = readFileSync(new URL('../src/BidLogEditDrawer.jsx', import.meta.url), 'utf8');
const dialog = readFileSync(new URL('../src/BidLogMergeDialog.jsx', import.meta.url), 'utf8');

test('merge begins from the target bid editor, not the page toolbar', () => {
  assert.match(editor, /<h3>Bid & Assignment<\/h3>[\s\S]*?Merge Bids/);
  assert.match(editor, /onMergeRequested\(\{/);
  assert.match(workspace, /onMergeRequested=\{target =>/);
  assert.doesNotMatch(workspace, /bid-log-merge-button/);
});

test('merge target is fixed by its editor; only source bids can be selected', () => {
  assert.match(dialog, /targetId = Number\(targetBid\?\.sharePointItemId\)/);
  assert.doesNotMatch(dialog, /setTargetId/);
  assert.doesNotMatch(dialog, /Select target bid/);
  assert.match(dialog, /Number\(row.sharePointItemId\) === Number\(targetId\)/);
});

test('unsaved target edits cannot be abandoned to start a merge', () => {
  assert.match(editor, /disabled=\{saving \|\| lifecycleComplete \|\| !detail.etag \|\| hasUnsavedChanges\}/);
  assert.match(editor, /Save or discard your edits before merging duplicates/);
});


test('Merge Bids appears only beside Bid & Assignment; footer remains clean', () => {
  const headingStart = editor.indexOf('<h3>Bid & Assignment</h3>');
  const headingEnd = editor.indexOf('<div className="bid-edit-grid three-column">', headingStart);
  assert.ok(headingStart >= 0 && headingEnd > headingStart);
  const heading = editor.slice(headingStart, headingEnd);
  assert.match(heading, /bid-log-merge-from-editor/);
  assert.match(heading, />\s*Merge Bids\s*<\/button>/);
  assert.doesNotMatch(heading, /Optimistic concurrency enabled/);

  const footerStart = editor.indexOf('<footer className="bid-log-edit-footer');
  const footerEnd = editor.indexOf('</footer>', footerStart);
  assert.ok(footerStart >= 0 && footerEnd > footerStart);
  const footer = editor.slice(footerStart, footerEnd);
  assert.doesNotMatch(footer, /bid-log-merge-from-editor/);
  assert.doesNotMatch(footer, /Save updates the live SharePoint Bid Log item/);
  assert.match(footer, /Unsaved changes/);
  assert.match(footer, /Save Bid/);
  assert.match(footer, /Back to Bid Log/);
  assert.equal((editor.match(/className="secondary-button bid-log-merge-from-editor"/g) || []).length, 1);
});

test('closing Merge Bids dismisses the whole editor instead of reopening the target bid', () => {
  const start = workspace.indexOf('{activeView && mergeTargetBid && (');
  const end = workspace.indexOf('<BidLogCreateDrawer', start);
  assert.ok(start >= 0 && end > start, 'merge dialog must be mounted in the workspace');
  const mount = workspace.slice(start, end);
  assert.match(mount, /onClose=\{\(\) => \{\s*setMergeTargetBid\(null\);\s*setEditSelection\(null\);/);
  assert.doesNotMatch(mount, /setEditSelection\(\{/);
  assert.match(mount, /onMerged=\{handleBidsMerged\}/);
  const shell = readFileSync(new URL('../src/FloatingEditorShell.jsx', import.meta.url), 'utf8');
  assert.match(shell, /className="billing-drawer-close floating-editor-close"\s+onClick=\{onClose\}/);
  assert.match(dialog, /onClose=\{onClose\}/);
});
