import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activePmChoices, asyncAwardSetupId} from '../src/bidLogWorkspaceRules.mjs';

const directory = [
  {pm: 'Darron Cook', pmSeparated: true, pmSelectable: false, pmInitials: 'DC'},
  {pm: 'Josh Erlandson', pmSeparated: false, pmSelectable: true, pmInitials: 'JE'},
  {pm: 'Micah Madden', pmSeparated: false, pmSelectable: true},
  {pm: 'Never Assigned Operations', pmSeparated: false, pmSelectable: true},
  {pm: 'Accounting Person', pmSeparated: false, pmSelectable: false, pmInitials: 'AP'},
  {pm: 'Unknown Directory Person', pmSeparated: false, pmInitials: 'UD'},
];

test('all non-separated Operations directory users are selectable, even with no bid or badge', () => {
  assert.deepEqual(activePmChoices(directory), [
    'Josh Erlandson', 'Micah Madden', 'Never Assigned Operations',
  ]);
  assert.deepEqual(activePmChoices([]), []);
});

test('separated and non-Operations identities cannot be selected even with badge metadata', () => {
  assert.deepEqual(activePmChoices([
    {pm: 'Inactive', pmSeparated: true, pmSelectable: true, pmInitials: 'IA'},
    {pm: 'Other Department', pmSeparated: false, pmSelectable: false, pmHexColor: '#112233'},
    {pm: 'Badged But Unverified', pmInitials: 'BU'},
    {pm: 'No PM Assigned', pmSeparated: false, pmSelectable: true},
  ]), []);
});

test('duplicate directory identities fail closed', () => {
  assert.deepEqual(activePmChoices([
    {pm: 'Josh Erlandson', pmSeparated: false, pmSelectable: true},
    {pm: ' josh erlandson ', pmSeparated: false, pmSelectable: true},
  ]), []);
});

test('historical PM read/filter paths remain independent of selectable Operations directory', () => {
  const source = readFileSync(new URL('../src/BidLogWorkspace.jsx', import.meta.url), 'utf8');
  assert.match(source, /activePmChoices\(pmBadgeDirectory\)/);
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /activePmChoices\(teamBadgeDirectory\)/);
  assert.match(source, /const historicalPmOptions = useMemo/);
  assert.match(source, /const allPmOptions=useMemo/);
});

test('only verified COMPLETE plus draftReady and original identity can navigate to setup', () => {
  const done = {status: 'COMPLETE', awardCompleted: true,
    draftReady: true, originalBidLogId: 4931};
  assert.equal(asyncAwardSetupId(done, true), 4931);
  assert.equal(asyncAwardSetupId(done, false), null);
  for (const state of ['QUEUED','RUNNING','AWARDED','DRAFT_REVIEW','REVIEW']) {
    assert.equal(asyncAwardSetupId({...done, status: state}, true), null);
  }
  assert.equal(asyncAwardSetupId({...done, draftReady: false}, true), null);
  assert.equal(asyncAwardSetupId({...done, awardCompleted: false}, true), null);
  assert.equal(asyncAwardSetupId({...done, originalBidLogId: null}, true), null);
  assert.equal(asyncAwardSetupId({...done, originalBidLogId: 0}, true), null);
  assert.equal(asyncAwardSetupId({...done, originalBidLogId: '4931'}, true), null);
});

test('queued award is quiet; a verified complete award navigates without an Attention toast', () => {
  const source = readFileSync(new URL('../src/BidLogWorkspace.jsx', import.meta.url), 'utf8');
  assert.match(source, /asyncAwardSetupId\(value, mayAuthor\(user\)\)/);
  assert.match(source, /onOpenProjectSetup\(setupBidId\)/);
  assert.match(source, /window\.sessionStorage\.setItem\(\s*pendingAwardStoreKey/);
  assert.doesNotMatch(source, /showActionToast\('info', 'Award processing in the background/);
  assert.match(source, /state === 'DRAFT_REVIEW'/);
  assert.doesNotMatch(source, /'Processing Award'/);
});
