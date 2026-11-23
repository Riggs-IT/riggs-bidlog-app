import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GROUPS,SUPPLIERS,validateJisList,validateJisDetail,buildJisChanges} from '../src/unnumberedProjectEditor.mjs';
const sid='b83c8aa6-558b-545e-8bf8-7779236745f8';
const row={setupId:sid,originalBidLogId:4970,revision:2,cognitoEntryId:1200,jobName:'TEST BID RODNEY 2'};
const field=(key,kind,value,choices=[],section='scope',editable=true)=>({key,kind,value,choices,section,label:key,lane:editable?'ordinary':'reference',mappedEdit:editable,editable});
const makeDetail=()=>{
  const fields=[field('scope','textarea','old'),field('leed','boolean',true),field('ndaRequired','boolean',false),field('numberOfBuildings','integer',2),field('jobName','text','TEST BID RODNEY 2',[],'basics',false),field('requiredSubmittals','multiChoice',['A'],['A','B'],'detailing')];
  for(const [key] of SUPPLIERS){fields.push(field(key+'Supplier','choice','A',['A','B'],'suppliers'),field(key+'Amount','number',1,[],'suppliers'),field(key+'Files','files',[],[],'suppliers',false));}
  for(let i=fields.length;i<95;i++)fields.push(field('reference'+i,'text',null,[],'accounting',false));
  return {...row,externalState:'CREATED_UNNUMBERED',jobListId:null,jobNumber:null,entryVersion:1,writeEnabled:true,fields};
};
test('created list rejects protected job, duplicate setup and malformed identities',()=>{
  assert.deepEqual(validateJisList({externalState:'CREATED_UNNUMBERED',items:[row]}),[row]);
  for(const items of [[{...row,cognitoEntryId:966}],[row,row],[{...row,revision:0}]])assert.throws(()=>validateJisList({externalState:'CREATED_UNNUMBERED',items}));
});
test('unnumbered detail retains actual SetupID and excludes fake JobListID and old canary writes',()=>{
  const d=makeDetail();assert.equal(validateJisDetail(d,sid),d);
  for(const patch of [{jobListId:24},{jobNumber:'12345'},{cognitoEntryId:966},{cognitoEntryId:1199},{fields:d.fields.slice(1)}])assert.throws(()=>validateJisDetail({...d,...patch},sid));
});
test('false and zero are preserved, unchanged fields and non-editable lanes omitted',()=>{
  assert.deepEqual(buildJisChanges(makeDetail(),{leed:false,primaryConcreteAmount:'0',scope:'old',jobName:'do not write',unknown:'x'}),{leed:false,primaryConcreteAmount:0});
});
test('clears, invalid number, fractional building count and unverified choices rejected',()=>{
  for(const values of [{scope:''},{primaryConcreteAmount:''},{primaryConcreteAmount:'-1'},{numberOfBuildings:'2.5'},{primaryConcreteSupplier:'Fake'},{requiredSubmittals:[]},{requiredSubmittals:['Fake']}])assert.throws(()=>buildJisChanges(makeDetail(),values));
});
test('read-only server capabilities defeat browser field values',()=>{
  const d=makeDetail();d.fields=d.fields.map(f=>({...f,editable:false}));d.writeEnabled=false;
  assert.deepEqual(buildJisChanges(d,{leed:false,scope:'new'}),{});
});
test('all 15 sections and 7 supplier rows are integrated into existing editor shell',()=>{
  assert.equal(GROUPS.length,15);assert.equal(SUPPLIERS.length,7);
  const source=readFileSync(new URL('../src/UnnumberedProjectEditor.jsx',import.meta.url),'utf8');
  const workspace=readFileSync(new URL('../src/ActiveProjectsWorkspace.jsx',import.meta.url),'utf8');
  assert.match(source,/<FloatingEditorShell/);assert.match(source,/<ActiveProjectSection/);
  assert.match(source,/setProjectSectionsOpen\(root.current,true\)/);assert.match(source,/SUPPLIERS.map/);
  assert.match(source,/expectedEntryId:detail.cognitoEntryId/);assert.match(source,/expectedVersion:detail.entryVersion/);
  assert.match(workspace,/canReadSetupSummary && !setupIntent && !editProjectId && !showCompleted && <UnnumberedProjectsPanel/);
  assert.match(source,/canEdit=author&&detail\?\.writeEnabled===true&&!busy&&!uncertain/);
});
