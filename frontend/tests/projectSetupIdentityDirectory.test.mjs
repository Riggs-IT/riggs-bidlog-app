import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDraftChanges,validateIdentityDirectory,validateForm206Directory} from '../src/projectSetupAuthoring.mjs';
import {setupReadiness} from '../src/projectSetupReadiness.mjs';

const directory={persistence:'SQL_DRAFT_ONLY',externalState:'NOT_CONNECTED',
 source:'RIGGSDATAHUB_VERIFIED_REFERENCES',unavailable:['architectLookupId','structuralEngineerLookupId'],
 gcs:[{id:'140-12',label:'Acme GC'}],itUsers:[{id:17,label:'PM'}],employees:[{id:70,label:'Superintendent'}]};

test('directory validates trusted namespaces and unavailable provider lookups',()=>{
 assert.equal(validateIdentityDirectory(directory),directory);
 for(const bad of [
  {...directory,gcs:[{id:12,label:'Acme'}]},
  {...directory,itUsers:[{id:'17',label:'PM'}]},
  {...directory,itUsers:[{id:17,label:'PM'},{id:17,label:'Duplicate'}]},
  {...directory,source:'browser'},
  {...directory,unavailable:[]}
 ]) assert.throws(()=>validateIdentityDirectory(bad));
});

test('normalization retains mixed provider vs internal identity types',()=>{
 const base={gcLookupId:null,pmITUserId:null,superintendentEid:null,foremanEids:[],additionalMemberITUserIds:[]};
 const edited={...base,gcLookupId:'140-12',pmITUserId:17,superintendentEid:70,
  foremanEids:[70],additionalMemberITUserIds:[17]};
 assert.deepEqual(buildDraftChanges(base,edited,new Set(Object.keys(base))),edited);
 for(const [field,value] of [['gcLookupId','Acme GC'],['pmITUserId','17'],['foremanEids',[70,70]],
  ['additionalMemberITUserIds',[true]],['superintendentEid',-1]]) {
    assert.throws(()=>buildDraftChanges(base,{...base,[field]:value},new Set([field])));
 }
});

test('checklist is advisory, never a Form 19 dispatch permission',()=>{
 const empty=setupReadiness({},directory);assert.equal(empty.filled,0);
 assert.equal(empty.advisory,true);assert.equal(empty.dispatchReady,false);
 const values={jobName:'Ready',gcLookupId:'140-99',pmITUserId:17};
 assert.deepEqual(setupReadiness(values,directory).unverified,['General contractor']);
});

test('editor preserves draft-only boundary and Form206 uses server-validated candidates',()=>{
 const source=readFileSync(new URL('../src/ProjectSetupEditor.jsx',import.meta.url),'utf8');
 assert.match(source,/ProjectSetupIdentityPicker/);
 assert.match(source,/form206Directory\?\.architects/);
 assert.match(source,/form206Directory\?\.engineers/);
 assert.match(source,/unavailable=\{!form206Directory\}/);
 assert.match(source,/readiness\?expected_revision=\$\{record\.revision\}/);
 assert.match(source,/validateSavedReadiness\(value,record\.setupId,record\.revision\)/);
 assert.match(source,/JIS blocked ·/);
 assert.doesNotMatch(source,/createEntry\(/);
});


test('Form206 options use typed verified format and block forged or duplicate IDs',()=>{
 const good={source:'RIGGSDATAHUB_FORM206_MIRROR',persistence:'SQL_DRAFT_ONLY',
   externalState:'NOT_CONNECTED',selectionVerification:'COGNITO_REST_ON_DRAFT_SAVE',externalWrites:0,
   architects:[{id:'206-4',label:'Architect'}],engineers:[{id:'206-7',label:'Engineer'}]};
 assert.equal(validateForm206Directory(good),good);
 for(const bad of [
  {...good,externalWrites:1},
  {...good,source:'browser'},
  {...good,architects:[{id:'140-4',label:'fake'}]},
  {...good,engineers:[{id:'206-4',label:'duplicate'}]},
  {...good,architects:[{id:'206-4',label:''}]},
 ]) assert.throws(()=>validateForm206Directory(bad));
 const base={architectLookupId:null,structuralEngineerLookupId:null};
 assert.deepEqual(buildDraftChanges(base,{architectLookupId:'206-4',structuralEngineerLookupId:'206-7'},
   new Set(['architectLookupId','structuralEngineerLookupId'])),
   {architectLookupId:'206-4',structuralEngineerLookupId:'206-7'});
 assert.throws(()=>buildDraftChanges(base,{...base,architectLookupId:'140-4'},new Set(['architectLookupId'])));
});
