import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateOpsSetupList} from '../src/opsSetupListContract.mjs';
const SID='00000000-0000-4000-8000-000000000001';
const CID='00000000-0000-4000-8000-000000000002';
const D='2026-10-28T17:00:00Z';
const row={setupId:SID,childId:CID,originalBidLogId:12,revision:1,jobName:'Draft',
  createdAtUTC:D,updatedAtUTC:D,setupState:'PENDING_SETUP',
  numberingState:'AWAITING_JOB_NUMBER',externalState:'NOT_CONNECTED'};
const data=()=>({items:[{...row}],nextCursor:null,persistence:'SQL_DRAFT_ONLY'});
test('valid summary and true empty are distinct verified successes',()=>{
  assert.equal(validateOpsSetupList(data()).items.length,1);
  assert.equal(validateOpsSetupList({...data(),items:[]}).items.length,0);
});
test('reject raw SQL values JSON and job numbers',()=>{
  for(const field of ['valuesJson','originatingBid','cognitoEntryId','jobListId','jobNumber'])
    assert.throws(()=>validateOpsSetupList({...data(),items:[{...row,[field]:'sensitive'}]}));
});
test('reject fake linked status and false revision',()=>{
  assert.throws(()=>validateOpsSetupList({...data(),items:[{...row,externalState:'CONNECTED'}]}));
  assert.throws(()=>validateOpsSetupList({...data(),items:[{...row,revision:0}]}));
});
test('reject malformed cursor and unmatched continuation',()=>{
  assert.throws(()=>validateOpsSetupList({...data(),nextCursor:{setupId:CID,createdAtUTC:D}}));
  assert.doesNotThrow(()=>validateOpsSetupList({...data(),nextCursor:{setupId:SID,createdAtUTC:D}}));
});
test('reject duplicates, malformed IDs, unzoned timestamps',()=>{
  assert.throws(()=>validateOpsSetupList({...data(),items:[row,row]}));
  assert.throws(()=>validateOpsSetupList({...data(),items:[{...row,setupId:'bad'}]}));
  assert.throws(()=>validateOpsSetupList({...data(),items:[{...row,createdAtUTC:'2026-10-28T17:00:00'}]}));
});
test('reject more rows than requested page limit',()=>{
  assert.throws(()=>validateOpsSetupList({...data(),items:[row,row]},1));
});

test('Ops narrow navigation remains separate from broader project-directory access',()=>{
  const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  assert.match(source, /canViewSetupSummary\s*=\s*canViewBidLog/);
  assert.match(source, /\['ADMIN', 'OPERATIONS'\]/);
  assert.match(source, /canViewSetupSummary\s*&&\s*!canViewProjects/);
  assert.match(source, /activePage === 'project-setups'/);
});
