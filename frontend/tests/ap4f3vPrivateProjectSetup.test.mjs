import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayAuthor,mayInspectSetup} from '../src/projectSetupAuthoring.mjs';
const file = name => readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const app = file('App.jsx');
const workspace = file('ActiveProjectsWorkspace.jsx');

test('ADMIN writes; MANAGEMENT_ADMIN gets read-only preview; other roles denied',()=>{
 const admin={appRole:'ADMIN',canReviewProjectSetup:true,canEditProjectSetup:true};
 const manager={appRole:'MANAGEMENT_ADMIN',canReviewProjectSetup:true,canEditProjectSetup:false};
 assert.equal(mayAuthor(admin),true);
 assert.equal(mayInspectSetup(admin),true);
 assert.equal(mayInspectSetup(manager),true);
 assert.equal(mayAuthor(manager),false);
 for(const user of [{appRole:'ADMIN'}, {appRole:'ADMIN',canReviewProjectSetup:false},
    {appRole:'OPERATIONS',canReviewProjectSetup:true},{appRole:'VIEWER',canReviewProjectSetup:true}]) {
   assert.equal(mayInspectSetup(user),false);
   assert.equal(mayAuthor(user),false);
 }
});
test('navigation offers preview opening existing saved drafts without enabling award start',()=>{
 assert.match(app,/const canViewSetupSummary = canViewBidLog && user\?\.canReviewProjectSetup === true/);
 assert.match(workspace,/const canReadSetupSummary = user\?\.canReviewProjectSetup === true/);
 assert.match(workspace,/canReadSetupSummary && setupIntent && \(canAuthorSetup \|\| Boolean\(setupIntent\.setupId\)\)/);
 assert.match(workspace,/onResume=\{onSetupIntentChanged \?/);
 const editor=file('ProjectSetupEditor.jsx');
 assert.match(editor,/if \(!author && !selection\?\.setupId\)/);
 assert.match(editor,/if \(saving\.current \|\| busy \|\| !record \|\| !author \|\| conflict\) return/);
});
