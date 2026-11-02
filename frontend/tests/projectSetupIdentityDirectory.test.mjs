import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDraftChanges,validateIdentityDirectory} from '../src/projectSetupAuthoring.mjs';
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

test('editor preserves draft-only boundary and unverified lookups are disabled',()=>{
 const source=readFileSync(new URL('../src/ProjectSetupEditor.jsx',import.meta.url),'utf8');
 assert.match(source,/ProjectSetupIdentityPicker/);
 assert.match(source,/unavailable help="Needs the Cognito AOR reference/);
 assert.match(source,/SQL_DRAFT_ONLY|Not yet sent to Cognito/);
 assert.doesNotMatch(source,/createEntry\(/);
});
