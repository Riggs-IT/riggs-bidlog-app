import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  calculateBidMergePreview,
  MAX_BID_MERGE_SOURCES,
  validMergeBid,
} from '../src/bidMerge.js';

test('merge preview preserves target notes and appends distinct nonblank sources', () => {
  const result = calculateBidMergePreview(
    {notes:'Original', generalContractors:'Target GC¡ Common'},
    [
      {notes:' New note ', generalContractors:'Common¡ GC Two'},
      {notes:'new NOTE', generalContractors:'gc two¡ GC Three'},
      {notes:'', generalContractors:null},
    ],
  );
  assert.equal(result.notes, 'Original\n\nNew note');
  assert.deepEqual(result.generalContractors, ['Common','GC Two','GC Three','Target GC']);
});

test('empty notes and source duplicate text do not create blank paragraphs', () => {
  assert.equal(calculateBidMergePreview({notes: 'Original'}, [{notes: ''}]).notes, 'Original');
  assert.equal(calculateBidMergePreview({notes: ''}, [{notes: 'A'}, {notes: 'A'}]).notes, 'A');
});

test('only active Potential and Assigned bids may enter a merge', () => {
  assert.ok(validMergeBid({sharePointItemId:12, status:'potential'}));
  assert.ok(validMergeBid({sharePointItemId:13, status:'Assigned'}));
  for (const status of ['Awarded','Lost','Dead','Merged','Not Pursuing']) {
    assert.equal(validMergeBid({sharePointItemId:12,status}), false);
  }
  assert.equal(MAX_BID_MERGE_SOURCES,15);
});

test('merge is a separately guarded edit, never ordinary status Patch', () => {
  const ui = readFileSync(new URL('../src/BidLogWorkspace.jsx',import.meta.url),'utf8');
  const modal = readFileSync(new URL('../src/BidLogMergeDialog.jsx',import.meta.url),'utf8');
  const backend = readFileSync(new URL('../../backend/app/main.py',import.meta.url),'utf8');
  assert.match(ui,/canEdit && activeView/);
  assert.match(ui,/onMergeRequested=\{target =>/);
  assert.match(modal,/\/api\/bid-log\/active\/merge/);
  assert.match(modal,/targetExpectedEtag: review\.target\.etag/);
  assert.match(modal,/BidLogConfirmDialog/);
  assert.match(backend,/_require_bid_log_editor\(current_user\)/);
  assert.match(backend,/def bid_log_active_merge_proxy/);
});
