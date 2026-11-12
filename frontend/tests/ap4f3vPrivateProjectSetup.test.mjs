import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayAuthor} from '../src/projectSetupAuthoring.mjs';
const file = name => readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const app = file('App.jsx');
const workspace = file('ActiveProjectsWorkspace.jsx');

test('only server-authorized two reviewer sessions can author setup',()=>{
 assert.equal(mayAuthor({appRole:'ADMIN',canReviewProjectSetup:true}),true);
 for(const user of [{appRole:'ADMIN'}, {appRole:'ADMIN',canReviewProjectSetup:false},
                    {appRole:'OPERATIONS',canReviewProjectSetup:true}]) assert.equal(mayAuthor(user),false);
});
test('navigation hides setup summaries and award-open action for others',()=>{
 assert.match(app,/const canViewSetupSummary = canViewBidLog && user\?\.canReviewProjectSetup === true/);
 assert.match(app,/if \(user\?\.canReviewProjectSetup !== true\) return;/);
 assert.match(workspace,/const canReadSetupSummary = user\?\.canReviewProjectSetup === true/);
 assert.match(workspace,/canEdit && canReadSetupSummary && setupIntent/);
});
