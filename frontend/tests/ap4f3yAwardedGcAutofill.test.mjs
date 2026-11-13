import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveAwardedGcSelection,currentAwardReference,buildDraftChanges,setPath} from '../src/projectSetupAuthoring.mjs';

const source=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const verified={gcs:[{id:'140-42',label:'20 Twenty Construction'},
  {id:'140-51',label:'Other Construction'}]};
const form140=[{sharePointItemId:7,cognitoLookupId:'140-42',name:'20 Twenty Construction',
  email:'test@example.invalid',streetAddress:'Example Street',cityStateZip:'Dallas, TX'},
  {sharePointItemId:9,cognitoLookupId:'140-51',name:'Other Construction'}];
const match=(label,sql=verified,forms=form140)=>resolveAwardedGcSelection(label,sql,forms);

test('exact active Form140 name and independently authorized 140-N identity resolve',()=>{
  assert.equal(match('20 Twenty Construction'),'140-42');
  assert.equal(match('  20  TWENTY  Construction '),'140-42');
});

test('unknown, absent, ambiguous, and multi-GC names never guess an identity',()=>{
  for (const label of [null,undefined,'','Unknown GC',
    '20 Twenty Construction¡Other Construction']) assert.equal(match(label),null);
  assert.equal(match('20 Twenty Construction',{gcs:[
    {id:'140-42',label:'20 Twenty Construction'},
    {id:'140-55',label:'20 Twenty Construction'},
  ]},form140),null);
  assert.equal(match('20 Twenty Construction',verified,[...form140,
    {sharePointItemId:15,cognitoLookupId:'140-44',name:'20 Twenty Construction'}]),null);
});

test('unverified provider IDs, mismatched names, and missing directories fail closed',()=>{
  assert.equal(match('20 Twenty Construction',verified,[
    {...form140[0],cognitoLookupId:'140-99'},form140[1]]),null);
  assert.equal(match('20 Twenty Construction',verified,[
    {...form140[0],name:'Other Name'},form140[1]]),null);
  assert.equal(match('20 Twenty Construction',null,form140),null);
  assert.equal(match('20 Twenty Construction',verified,null),null);
  assert.equal(match('20 Twenty Construction',{gcs:[{id:'999',label:'20 Twenty Construction'}]},form140),null);
});

test('only a clicked verified suggestion is a local draft edit; no implicit save',()=>{
  const base={gcLookupId:null,projectOwnerInfo:{name:'Owner'}};
  assert.deepEqual(buildDraftChanges(base,base,new Set()),{});
  const chosen=setPath(base,'gcLookupId',match('20 Twenty Construction'));
  assert.deepEqual(buildDraftChanges(base,chosen,new Set(['gcLookupId'])),{gcLookupId:'140-42'});
  assert.equal(base.gcLookupId,null);
});

test('current awarded reference stays passive and validates exact award identity',async()=>{
  const calls=[];
  const result=await currentAwardReference(4853,{request:async(path,options)=>{
    calls.push({path,options});
    return {originalBidLogId:4853,status:'Awarded',notes:'No external action',
      generalContractors:'20 Twenty Construction'};
  }});
  assert.equal(result.gcSourceLabel,'20 Twenty Construction');
  assert.equal(calls.length,1);
  assert.equal(calls[0].path,'/api/bid-log/outcomes/4853?status=Awarded');
  assert.equal(calls[0].options.method,undefined);
  await assert.rejects(currentAwardReference(5,{request:async()=>({
    originalBidLogId:5,status:'Lost',notes:null,generalContractors:'20 Twenty Construction',
  })}));
});

test('editor loads awarded reference on draft opening without a manual refresh control',()=>{
  const editor=source('ProjectSetupEditor.jsx');
  assert.match(editor,/currentAwardReference\(record\.originalBidLogId,\{signal:abort\.signal\}\)/);
  assert.match(editor,/referenceCycle,inspector/);
  assert.match(editor,/return \(\)=>abort\.abort\(\)/);
  assert.match(editor,/resolveAwardedGcSelection\(/);
  assert.match(editor,/onClick=\{\(\)=>change\('gcLookupId',awardedGcLookupId\)\}/);
  assert.match(editor,/gcHistoryBlocksSelection/);
  assert.doesNotMatch(editor,/Refresh reference|Load reference|Load current reference|loadReference\(/);
  assert.match(editor,/className="secondary-button project-setup-reference-use"/);
  const css=source('styles/10-active-projects.css');
  assert.match(css,/\.project-setup-party-block \.project-setup-reference-use/);
  assert.match(css,/min-height:28px/);
  assert.doesNotMatch(editor,/gcContactInfo\.streetAddress.*onChange/);
});

test('management preview still never writes, while ADMIN save stays explicit',()=>{
  const editor=source('ProjectSetupEditor.jsx');
  assert.match(editor,/const managementPreview = inspector && !author/);
  assert.match(editor,/if \(saving\.current \|\| busy \|\| !record \|\| !author \|\| conflict\) return/);
  assert.match(editor,/record && author &&/);
  assert.match(editor,/UNDER DEVELOPMENT · VIEW ONLY/);
});
