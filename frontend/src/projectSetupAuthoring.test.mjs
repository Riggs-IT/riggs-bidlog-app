import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyDraftChanges,awardCompleted,buildDraftChanges,currentAwardReference,mayAuthor,openSetup,requestSetup,
  setupError,setPath,validateDraft,validateEditReceipt} from './projectSetupAuthoring.mjs';
const SID='00000000-0000-4000-8000-000000000001',CID='00000000-0000-4000-8000-000000000002',OID='00000000-0000-4000-8000-000000000003';
const completed={action:'Awarded',finalStatus:'Awarded',transitionApplied:true,cloneCreationComplete:true,
  expectedCloneCount:0,createdCloneCount:0,sharePointItemId:101};
const saved=()=>({setup:{setupId:SID,childId:CID,originalBidLogId:101,revision:1,jobNumber:null,
  cognitoEntryId:null,jobListId:null,values:{jobName:'Example',comments:'Ops'},originatingBid:{originalBidLogId:101}},
  persistence:'SQL_DRAFT_ONLY',externalState:'NOT_CONNECTED',externalWrites:0});
const ctx=(mode,choices=[])=>({originalBidLogId:101,mode,choices,sourceVersion:'a'.repeat(64),
  persistence:'SQL_DRAFT_ONLY',externalState:'NOT_CONNECTED'});
const source=name=>readFileSync(new URL(name,import.meta.url),'utf8');
test('only complete confirmed award opens setup',()=>assert.equal(awardCompleted(completed),true));
test('partial clone result never opens setup',()=>{
  for(const change of [{transitionApplied:false},{cloneCreationComplete:false},{expectedCloneCount:2},{finalStatus:'Active'},{sharePointItemId:'101'}])
    assert.equal(awardCompleted({...completed,...change}),false);
});
test('other terminal actions never open setup',()=>assert.equal(awardCompleted({...completed,action:'Lost'}),false));
test('ADMIN only and no role inheritance',()=>{
 assert.equal(mayAuthor({appRole:'ADMIN'}),true);
 for(const role of ['OPERATIONS','MANAGEMENT_ADMIN','VIEWER','PM',''])assert.equal(mayAuthor({appRole:role}),false);
});
test('create uses trusted context version not browser seed',async()=>{
 const calls=[];const request=async(path,options)=>{calls.push({path,options});return calls.length===1?ctx('CREATE_INITIAL'):saved();};
 const result=await openSetup({originalBidLogId:101},{operationId:OID,request});
 assert.equal(result.setup.setupId,SID);assert.equal(calls.length,2);assert.equal(result.reference.sourceVersion,'a'.repeat(64));
 assert.deepEqual(calls[1].options.body,{operationId:OID,expectedSourceVersion:'a'.repeat(64)});
 assert.equal(calls[1].options.method,'POST');
});
test('known setup resumes without reseeding and optional current reference is read-only',async()=>{
 const refCalls=[];const ref=await currentAwardReference(101,{request:async(path,options)=>{refCalls.push({path,options});return {originalBidLogId:101,status:'Awarded',notes:'Current notes',generalContractors:'GC'};}});
 assert.equal(ref.bidNotes,'Current notes');assert.equal(refCalls[0].options.method,undefined);
 await assert.rejects(currentAwardReference(101,{request:async()=>({originalBidLogId:999,status:'Awarded',notes:null,generalContractors:null})}));
 const calls=[];await openSetup({setupId:SID},{request:async(path,options)=>{calls.push([path,options]);return saved();}});
 assert.equal(calls.length,1);assert.equal(calls[0][0],`/api/project-setups/drafts/${SID}`);
 assert.equal(calls[0][1].method,undefined);
});
test('single existing child chooses existing ID not a new POST',async()=>{
 const calls=[];await openSetup({originalBidLogId:101},{operationId:OID,request:async(path,options)=>{
 calls.push(path);return calls.length===1?ctx('RESUME',[{setupId:SID,childId:CID}]):saved();}});
 assert.equal(calls.length,2);assert.ok(calls[1].endsWith(SID));
});
test('multi-child stops for explicit choice',async()=>{
 let count=0;const context=ctx('CHOOSE_CHILD',[{setupId:SID,childId:CID},{setupId:OID,childId:SID}]);
 const result=await openSetup({originalBidLogId:101},{operationId:OID,request:async()=>{count++;return context;}});
 assert.equal(result.context.mode,'CHOOSE_CHILD');assert.equal(count,1);
});
test('existing job linkage never starts a fresh child automatically',async()=>{
 let count=0;const result=await openSetup({originalBidLogId:101},{operationId:OID,request:async()=>{count++;return ctx('EXISTING_JOB_REVIEW');}});
 assert.equal(count,1);assert.equal(result.context.mode,'EXISTING_JOB_REVIEW');
});
test('wrong returned draft identity rejected',async()=>{
 const bad=saved();bad.setup.setupId=OID;
 await assert.rejects(openSetup({setupId:SID},{request:async()=>bad}));
});
test('real external identities cannot masquerade as draft-only',()=>{
 for(const field of ['jobNumber','cognitoEntryId','jobListId']) {const bad=saved();bad.setup[field]=1;assert.throws(()=>validateDraft(bad));}
});
test('read is passive and never includes employee identity',async()=>{
 let options;await requestSetup('/api/example',{fetcher:async(p,o)=>{options=o;return{ok:true,json:async()=>saved()};}});
 assert.equal(options.credentials,'same-origin');assert.equal(options.headers['X-Riggs-Passive-Read'],'1');
 assert.equal(options.headers['X-Riggs-User-EID'],undefined);assert.equal(options.cache,'no-store');
});
test('write carries CSRF header and no passive marker',async()=>{
 let options;await requestSetup('/api/example',{method:'PATCH',body:{operationId:OID},fetcher:async(p,o)=>{options=o;return{ok:true,json:async()=>saved()};}});
 assert.equal(options.headers['X-Riggs-Setup-Write'],'1');assert.equal(options.headers['X-Riggs-Passive-Read'],undefined);
});
test('unknown save is not automatically repeated',async()=>{
 let count=0;await assert.rejects(requestSetup('/api/example',{method:'PATCH',body:{},fetcher:async()=>{count++;throw Error('offline');}}));
 assert.equal(count,1);
});
test('disabled is error not empty success',async()=>{
 await assert.rejects(requestSetup('/api/example',{fetcher:async()=>({ok:false,status:503,json:async()=>({detail:'project_setup_writes_disabled'})})}),e=>e.code==='project_setup_writes_disabled');
});
test('touched-only changes preserve omitted fields',()=>{
 const base={jobName:'Original',comments:'Ops',scope:'Keep'};const form={...base,comments:'New'};
 assert.deepEqual(buildDraftChanges(base,form,new Set(['comments'])),{comments:'New'});
});
test('explicit empty scalar clears to null',()=>assert.deepEqual(buildDraftChanges({comments:'Old'},{comments:''},new Set(['comments'])),{comments:null}));
test('false and zero remain explicit values',()=>{
 assert.deepEqual(buildDraftChanges({leed:true,numberOfBuildings:3},{leed:'false',numberOfBuildings:'0'},new Set(['leed','numberOfBuildings'])),{leed:false,numberOfBuildings:0});
});
test('decimal normalization does not round large money',()=>{
 const amount='123456789012345.1234';assert.deepEqual(buildDraftChanges({contractAmount:null},{contractAmount:amount},new Set(['contractAmount'])),{contractAmount:amount});
});
test('invalid duration percent decimals rejected',()=>{
 for(const [path,value] of [['estimatedDurationMonths','0'],['estimatedDurationMonths','1.5'],['retentionPercent','101'],['contractAmount','-5'],['leed','maybe']])
   assert.throws(()=>buildDraftChanges({[path]:null},{[path]:value},new Set([path])));
});
test('nested edit includes only supplied leaf',()=>{
 const base={gcContactInfo:{pm:{name:'Person',email:'old'}}};const form=setPath(base,'gcContactInfo.pm.email','');
 const patch=buildDraftChanges(base,form,new Set(['gcContactInfo.pm.email']));
 assert.deepEqual(patch,{gcContactInfo:{pm:{email:null}}});
 assert.deepEqual(applyDraftChanges(base,patch),{gcContactInfo:{pm:{name:'Person',email:null}}});
});
test('empty list clears building names explicitly',()=>{
 assert.deepEqual(buildDraftChanges({buildingNames:[{cognitoRowId:null,name:'A'}]},{buildingNames:[]},new Set(['buildingNames'])),{buildingNames:[]});
});
test('equal normalized values do not make dirty changes',()=>{
 assert.deepEqual(buildDraftChanges({contractAmount:'100.2500'},{contractAmount:'100.25'},new Set(['contractAmount'])),{});
});
test('save receipt bound to revision and exact operation',()=>{
 const body={operationId:OID,expectedRevision:1};const receipt={setupId:SID,operationId:OID,revision:2,action:'UPDATED',replayed:false,
  persisted:true,externalWrites:0,persistence:'SQL_DRAFT_ONLY',sharedChangesState:'NOT_DISPATCHED'};
 assert.equal(validateEditReceipt(receipt,SID,body),receipt);
 for(const change of [{revision:3},{operationId:CID},{externalWrites:1},{persisted:false}])assert.throws(()=>validateEditReceipt({...receipt,...change},SID,body));
});
test('error text never instructs repeating award',()=>{
 assert.match(setupError({code:'project_setup_award_sync_pending'}),/do not award the bid again/);
 assert.match(setupError({status:409}),/entries remain here/);
});
test('editor save-and-later follows confirmed receipt; warnings and exact retry retained',()=>{
 const s=source('ProjectSetupEditor.jsx');
 assert.ok(s.indexOf('validateEditReceipt(response')<s.indexOf('if (leaveAfter) {onLeave();return;}'));
 assert.match(s,/pending.current=\{operationId:crypto.randomUUID\(\),expectedRevision:record.revision,changes\}/);
 assert.match(s,/if \(!unknown\) pending.current=null/);
 assert.match(s,/beforeunload/);assert.match(s,/window.confirm/);
 assert.match(s,/Copy original Bid Notes into Comments/);assert.match(s,/current \? `\$\{current\}\\n\\n\$\{notes\}` : notes/);
 assert.doesNotMatch(s,/\/cognito|createEntry\(/);
});
test('complete award wires to setup; partial keeps warning and never navigates',()=>{
 const drawer=source('BidLogEditDrawer.jsx'),workspace=source('BidLogWorkspace.jsx');
 assert.match(drawer,/kind: awardCompleted\(lifecycleResult\) \? 'award_complete'/);
 assert.match(drawer,/kind: 'award_partial'/);
 assert.match(workspace,/event\?\.kind === 'award_complete' && mayAuthor\(user\)/);
 assert.match(workspace,/if \(event\?\.kind !== 'award_partial'\) setEditSelection\(null\)/);
});
test('Awaiting resume only receives ADMIN callback; misleading directory count suppressed',()=>{
 const s=source('ActiveProjectsWorkspace.jsx');assert.match(s,/onResume=\{canEdit && onSetupIntentChanged/);
 assert.match(s,/!showAwaiting &&\s*<div className="bid-log-workspace-count"/);
 assert.match(source('ProjectSetupAwaitingPanel.jsx'),/Continue setup/);
});
test('manual awarded recovery exists, protected by role and unsaved state',()=>{
 const s=source('BidLogOutcomeEditDrawer.jsx');assert.match(s,/role === 'ADMIN' && outcomeStatus === 'Awarded'/);
 assert.match(s,/disabled=\{saving \|\| hasUnsavedChanges\}/);
 assert.match(s,/Start \/ continue project setup/);
});
