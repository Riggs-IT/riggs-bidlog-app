import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const drawer=readFileSync(new URL('../src/BidLogEditDrawer.jsx',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../src/BidLogWorkspace.jsx',import.meta.url),'utf8');
const setup=readFileSync(new URL('../src/projectSetupAuthoring.mjs',import.meta.url),'utf8');
const backend=readFileSync(new URL('../../backend/app/data_api.py',import.meta.url),'utf8');

test('Not Pursuing is an explicit lifecycle action',()=>{
  assert.match(drawer,/const LIFECYCLE_STATUSES = \[[\s\S]*'Not Pursuing'/);
  assert.match(drawer,/lifecycleAction === 'Not Pursuing'[\s\S]*optionalText\(lifecycleReason\)/);
});

test('lifecycle copy no longer promises Power Automate movement',()=>{
  assert.match(drawer,/server will preserve history, verify the destination record, synchronize SQL, and then remove the Active Bid source/);
  assert.doesNotMatch(drawer,/existing Power Automate workflow will move the completed record/);
});

test('Dead and Not Pursuing invalidate the correct destination caches',()=>{
  assert.match(workspace,/Dead: 'lost'/);
  assert.match(workspace,/'Not Pursuing': 'unpursued'/);
});

test('Award setup follows stable logical bid identity when supplied',()=>{
  assert.match(workspace,/event\.lifecycleResult\.originalBidLogId \?\? updatedIdentity/);
  assert.match(workspace,/onOpenProjectSetup\?\.\(setupBidId\)/);
});

test('cutover 503 details are preserved by the BFF lifecycle client',()=>{
  const start=backend.indexOf('def transition_active_bid_lifecycle(');
  assert.ok(start>=0);
  const region=backend.slice(start,start+4500);
  assert.match(region,/502,\s*503,/s);
});

test('setup pending wording no longer assumes a legacy mirror flow',()=>{
  assert.match(setup,/has not finished its SQL handoff yet/);
  assert.doesNotMatch(setup,/awaiting its existing mirror update/);
});
