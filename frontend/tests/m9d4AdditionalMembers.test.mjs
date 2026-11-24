import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {additionalMemberScope,validRoster,validRosterIdentity,rosterCanEdit} from '../src/additionalMemberRoster.mjs';
const sid='b83c8aa6-558b-545e-8bf8-7779236745f8',scope=additionalMemberScope({setupId:sid});
const roster={setupId:sid,jobListId:null,persistence:'SQL_ROSTER_ONLY',externalWrites:0,rosterRevision:2,canEdit:true,canDistribute:false,members:[{itUserId:11,label:'One'},{itUserId:22,label:'Two'}],directory:[{id:11,label:'One'},{id:22,label:'Two'}],timeline:[]};
test('supports both real identities and rejects ambiguous identity',()=>{
 assert.deepEqual(scope,{setupId:sid,jobListId:null,url:`/api/project-setups/jis/${sid}/additional-members`});
 assert.deepEqual(additionalMemberScope({setupId:sid.toUpperCase()}),scope);
 assert.deepEqual(additionalMemberScope({jobListId:55}),{jobListId:55,url:'/api/active-projects/55/additional-members'});
 for(const input of [{setupId:sid,jobListId:55},{setupId:'not-real'},{jobListId:null},{jobListId:-1}]) assert.equal(additionalMemberScope(input),null);
});
test('roster response binds scope, revision, no external effects and unique identities',()=>{
 assert.ok(validRoster(roster,scope));
 for(const patch of [{setupId:'other'},{jobListId:55},{externalWrites:1},{rosterRevision:9007199254740992},{canEdit:1},{canDistribute:true},{members:[roster.members[0],roster.members[0]]},{directory:[{id:'11',label:'One'}]}]) assert.equal(validRoster({...roster,...patch},scope),false);
 assert.ok(validRosterIdentity({setupId:sid,jobListId:null,rosterRevision:3,persistence:'SQL_ROSTER_ONLY',externalWrites:0},scope));
});
test('permissions require both author and server edit capability',()=>{
 assert.equal(rosterCanEdit(true,roster,scope),true);assert.equal(rosterCanEdit(false,roster,scope),false);assert.equal(rosterCanEdit(true,{...roster,canEdit:false},scope),false);
 assert.equal(rosterCanEdit(true,null,scope),false);
});
test('same component mounts after field team and suppresses duplicate scalar roster field',()=>{
 const editor=readFileSync(new URL('../src/UnnumberedProjectEditor.jsx',import.meta.url),'utf8'),component=readFileSync(new URL('../src/ActiveProjectAdditionalMembers.jsx',import.meta.url),'utf8');
 assert.ok(editor.indexOf('<ProjectFieldTeam')<editor.indexOf('<ActiveProjectAdditionalMembers setupId={setupId}'));
 assert.match(editor,/\['superintendentEid','foremanEids','additionalMemberITUserIds'\]/);assert.match(editor,/onDirtyChange=\{setAdditionalDirty\} onSavingChange=\{setAdditionalSaving\}/);
 assert.match(component,/const body = operation.current/);assert.match(component,/\['UPDATED','UNCHANGED','REPLAY'\]/);assert.match(component,/setConflict\(true\)/);assert.match(component,/editable && <div className="additional-members-actions"/);
});
