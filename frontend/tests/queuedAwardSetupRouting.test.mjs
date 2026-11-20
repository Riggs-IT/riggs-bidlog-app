import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {queuedAwardSourceId, queuedAwardProgress} from '../src/queuedAwardSetup.mjs';

const completed = {status:'COMPLETE', awardCompleted:true, draftReady:true,
  originalBidLogId:4931, sharePointItemId:4931};

test('only queue ACK supplies a positive integer SharePoint source ID', () => {
  assert.equal(queuedAwardSourceId({kind:'award_queued',sharePointItemId:4931}),4931);
  for (const value of [null,0,-1,1.5,'4931']) {
    assert.equal(queuedAwardSourceId({kind:'award_queued',sharePointItemId:value}),null);
  }
  assert.equal(queuedAwardSourceId({kind:'award_complete',sharePointItemId:4931}),null);
});

test('only SQL verified COMPLETE and ready draft route to setup', () => {
  assert.deepEqual(queuedAwardProgress(completed),{kind:'ready',originalBidLogId:4931});
  for(const status of ['QUEUED','CLAIMED','RUNNING','AWARDED']) {
    assert.deepEqual(queuedAwardProgress({...completed,status}),{kind:'pending'});
  }
  for(const patch of [{awardCompleted:false},{draftReady:false},
    {originalBidLogId:null},{originalBidLogId:'4931'}]) {
    assert.equal(queuedAwardProgress({...completed,...patch}).kind,'review');
  }
  for(const status of ['REVIEW','DRAFT_REVIEW']) {
    assert.equal(queuedAwardProgress({...completed,status}).kind,'review');
  }
});

test('award confirm dialog removed while Lost/Dead confirmation stays', () => {
  const source=readFileSync(new URL('../src/BidLogEditDrawer.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/Award this bid\?/);
  assert.match(source,/lifecycleAction !== 'Awarded' && !skipLifecycleConfirm/);
  assert.match(source,/onClick=\{\(\) => \{ void save\(\); \}\}/);
});

test('both Bid Log and Projected Billings queue into App-owned coordinator', () => {
  const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const workspace=readFileSync(new URL('../src/BidLogWorkspace.jsx',import.meta.url),'utf8');
  assert.match(app,/onAwardQueued=\{beginQueuedProjectSetup\}/);
  assert.match(workspace,/onAwardQueued\?\.\(id\) === true/);
  assert.match(app,/queuedAwardSourceId\(event\)/);
  assert.match(app,/beginQueuedProjectSetup\(queuedAwardSourceId\(event\)\)/);
  assert.match(app,/setEditProjectedBidId\(null\)/);
  assert.match(app,/setQueuedSetupSourceId\(sharePointItemId\)/);
  assert.match(app,/setActivePage\('active-projects'\)/);
  assert.match(app,/setProjectSetupIntent\(\{originalBidLogId: result\.originalBidLogId\}\)/);
  assert.match(app,/award-progress/);
  assert.match(app,/window\.sessionStorage\.setItem\(queuedSetupStoreKey/);
  assert.match(app,/window\.sessionStorage\.removeItem\(queuedSetupStoreKey/);
});
