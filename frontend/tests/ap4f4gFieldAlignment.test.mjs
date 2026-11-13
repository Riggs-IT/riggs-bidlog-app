import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const editor=readFileSync(new URL('../src/ProjectSetupEditor.jsx',import.meta.url),'utf8');
test('UI describes provider mapping checks, not invented signed-award approvals',()=>{
  assert.match(editor,/Form 19 integration checks/);
  assert.doesNotMatch(editor,/approval gates/);
  assert.doesNotMatch(editor,/Signed award confirmation/);
});
test('existing Operations editor retains owner and GC lookup inputs',()=>{
  for(const p of ['projectOwnerInfo.name','projectOwnerInfo.streetAddress','projectOwnerInfo.cityStateZip','projectOwnerInfo.email','gcLookupId'])
    assert.ok(editor.includes(p),p);
});
test('the UI does not add any Form19 POST or accounting JobNumber control',()=>{
  assert.doesNotMatch(editor,/\/forms\/19\/entries/);
  assert.doesNotMatch(editor,/jobNumber.*onChange=/);
});
