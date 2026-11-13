import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayAuthor,mayInspectSetup,openSetup,validId} from '../src/projectSetupAuthoring.mjs';
const s=n=>readFileSync(new URL('../src/'+n,import.meta.url),'utf8');
const SID='00000000-0000-4000-8000-000000000001';
const readDraft={setup:{setupId:SID,childId:'00000000-0000-4000-8000-000000000002',
 originalBidLogId:4,revision:3,jobNumber:null,cognitoEntryId:null,jobListId:null,
 values:{jobName:'Synthetic'},originatingBid:{originalBidLogId:4}},
 persistence:'SQL_DRAFT_ONLY',externalState:'NOT_CONNECTED'};
test('management sees only verified session flag and remains nonwriter',()=>{
 const user={appRole:'MANAGEMENT_ADMIN',canReviewProjectSetup:true,canEditProjectSetup:false};
 assert.equal(mayInspectSetup(user),true);
 assert.equal(mayAuthor(user),false);
 assert.equal(mayInspectSetup({...user,canReviewProjectSetup:false}),false);
 assert.equal(mayAuthor({...user,canEditProjectSetup:true}),false);
});
test('preview opening known SetupID performs one read-only GET, no POST',async()=>{
 const calls=[];
 const result=await openSetup({setupId:SID},{request:async(path,options)=>{
   calls.push({path,options});return readDraft;
 }});
 assert.equal(result.setup.revision,3);
 assert.deepEqual(calls.map(x=>x.path),[`/api/project-setups/drafts/${SID}`]);
 assert.equal(calls[0].options.method,undefined);
 assert.equal(validId(SID),true);
});
test('editor loads directories in preview and allows local selections but never Save',()=>{
 const editor=s('ProjectSetupEditor.jsx');
 assert.match(editor,/const inspector = mayInspectSetup\(user\)/);
 assert.match(editor,/useGcReference\(inspector\)/);
 assert.match(editor,/if \(!record\?\.setupId \|\| !inspector\)/);
 assert.match(editor,/managementPreview/);
 assert.match(editor,/UNDER DEVELOPMENT · VIEW ONLY/);
 assert.match(editor,/record && author &&/);
 assert.match(editor,/!author \|\| conflict\) return/);
 assert.match(editor,/!inspector\}>/);
 const css=s('styles/10-active-projects.css');
 assert.match(css,/project-setup-management-preview::after/);
 assert.match(css,/pointer-events: none/);
});
