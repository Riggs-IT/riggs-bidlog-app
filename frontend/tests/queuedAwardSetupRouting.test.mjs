import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {queuedAwardSourceId, queuedAwardProgress, resolveVerifiedPreviewSetupId} from '../src/queuedAwardSetup.mjs';

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
  assert.deepEqual(queuedAwardProgress({...completed,status:'RUNNING',winnerVerified:true}),
    {kind:'ready',originalBidLogId:4931});
  assert.equal(queuedAwardProgress({...completed,status:'RUNNING',winnerVerified:false}).kind,'pending');
  assert.equal(queuedAwardProgress({...completed,status:'REVIEW',winnerVerified:true}).kind,'review');
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
  const projects=readFileSync(new URL('../src/ActiveProjectsWorkspace.jsx',import.meta.url),'utf8');
  assert.match(app,/onAwardQueued=\{beginQueuedProjectSetup\}/);
  assert.match(workspace,/onAwardQueued\?\.\(id\) === true/);
  assert.match(app,/queuedAwardSourceId\(event\)/);
  assert.match(app,/beginQueuedProjectSetup\(queuedAwardSourceId\(event\)\)/);
  assert.match(app,/setEditProjectedBidId\(null\)/);
  assert.match(app,/setQueuedSetupSourceId\(sharePointItemId\)/);
  assert.match(app,/setProjectSetupIntent\(editorIntent\);\s*setActivePage\('active-projects'\)/);
  assert.doesNotMatch(app,/directQueuedSetupIntent|setDirectQueuedSetupIntent/);
  assert.match(app,/canAutoOpenSetup = canViewProjects && mayInspectSetup\(user\)/);
  assert.match(workspace,/mayInspectSetup\(user\) && onAwardQueued/);
  assert.match(app,/resolveVerifiedPreviewSetupId\(result.originalBidLogId/);
  assert.match(app,/editorIntent = \{setupId\}/);
  assert.match(app,/setProjectSetupIntent\(\{showDrafts: true\}\)/);
  assert.doesNotMatch(app,/canAutoOpenSetup = canViewProjects && mayAuthor\(user\)/);
  assert.doesNotMatch(app,/<ProjectSetupEditor/);
  assert.match(app,/<ActiveProjectsWorkspace/);
  assert.match(app,/setupIntent=\{projectSetupIntent\}/);
  assert.match(app,/onSetupIntentChanged=\{setProjectSetupIntent\}/);
  assert.match(projects,/<ProjectSetupEditor/);
  assert.match(projects,/setupIntent && \(canAuthorSetup \|\| Boolean\(setupIntent.setupId\)\)/);
  assert.match(projects,/useState\(\(\) => Boolean\(setupIntent\)\)/);
  assert.match(projects,/onLeave=\{\(\) => \{onSetupIntentChanged\?\.\(null\);setShowAwaiting\(true\)/);
  assert.match(app,/queuedSetupTerminal \? 'Award requires review' : 'Preparing Project Setup'/);
  assert.doesNotMatch(app,/queuedSetupSourceId !== null \? \(/);
  const accepted = app.split('function beginQueuedProjectSetup(sharePointItemId) {')[1]
    .split('function dismissQueuedProjectSetupReview() {')[0];
  assert.doesNotMatch(accepted,/setActivePage\(/);
  const ready = app.split("if (result.kind === 'ready') {")[1].split("} else if (result.kind === 'review')")[0];
  // Both roles navigate only after SQL readiness. MANAGEMENT_ADMIN first
  // resolves the saved SetupID; a failed identity lookup enters Drafts only.
  assert.match(ready,/setProjectSetupIntent\(editorIntent\);\s*setActivePage\('active-projects'\)/);
  assert.match(ready,/setProjectSetupIntent\(\{showDrafts: true\}\)/);
  assert.match(app,/award-progress/);
  assert.match(app,/window\.sessionStorage\.setItem\(queuedSetupStoreKey/);
  assert.match(app,/window\.sessionStorage\.removeItem\(queuedSetupStoreKey/);
});


const makeItem = (id, bidId, date) => ({
  setupId: id, childId: 'f2344f66-5e2e-4000-8000-111122223333',
  originalBidLogId: bidId, revision: 1, jobName: 'Test bid',
  createdAtUTC: date, updatedAtUTC: date,
  setupState: 'PENDING_SETUP', numberingState: 'AWAITING_JOB_NUMBER',
  externalState: 'NOT_CONNECTED',
});
const setup1 = '8be7540b-18a2-5692-b2a0-84b2c481c85f';
const setup2 = 'f28f4555-7f3d-49ff-a98d-9c26d1c38362';
const at1 = '2026-11-20T14:52:56.242Z';
const at2 = '2026-11-20T15:52:56.242Z';
const reply = (items, nextCursor = null) => ({
  ok: true, json: async () => ({items, nextCursor, persistence: 'SQL_DRAFT_ONLY'}),
});

test('management preview resolves exact SQL SetupID from read-only authorized list', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({url, init});
    if (calls.length === 1) return reply([makeItem(setup1, 4949, at1)],
      {createdAtUTC: at1, setupId: setup1});
    return reply([makeItem(setup2, 5000, at2)]);
  };
  assert.equal(await resolveVerifiedPreviewSetupId(5000, {fetcher}), setup2);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /after_setup_id=8be7540b/);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.credentials, 'same-origin');
  assert.equal(calls[0].init.headers['X-Riggs-Passive-Read'], '1');
});

test('management preview fails closed on missing/ambiguous/untrusted draft identities', async () => {
  const first = makeItem(setup1, 4949, at1);
  const second = makeItem(setup2, 4949, at2);
  await assert.rejects(resolveVerifiedPreviewSetupId(0, {fetcher:async () => reply([])}));
  await assert.rejects(resolveVerifiedPreviewSetupId(4949, {fetcher:async () => reply([])}));
  await assert.rejects(resolveVerifiedPreviewSetupId(4949, {
    fetcher:async () => reply([first, second]),
  }));
  await assert.rejects(resolveVerifiedPreviewSetupId(4949, {
    fetcher:async () => ({ok:false, status:403}),
  }));
  await assert.rejects(resolveVerifiedPreviewSetupId(4949, {
    fetcher:async () => reply([{...first, setupId:'not-an-id'}]),
  }));
});
