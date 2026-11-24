import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GROUPS,SUPPLIERS,validateJisList,validateJisDetail,validateNumberedJisDetail,buildJisChanges} from '../src/unnumberedProjectEditor.mjs';
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
  assert.match(source,/<ProjectSectionsToggle rootRef=\{root\}/);assert.match(source,/SUPPLIERS.map/);
  assert.match(source,/expectedEntryId:detail.cognitoEntryId/);assert.match(source,/expectedVersion:detail.entryVersion/);
  assert.doesNotMatch(workspace,/UnnumberedProjectsPanel/);
  assert.match(workspace,/projectDirectoryRows\(activeDirectoryItems,completedItems,showCompleted\)/);
  assert.match(workspace,/setupId=\{selectedProject\?\.jobListId==null\?selectedProject\?\.setupId:null\}/);
  assert.match(source,/canEdit=author&&detail\?\.writeEnabled===true&&!busy&&!uncertain/);
});

test('lookups use strict SQL identity and provider namespaces, never display names',()=>{
  const d=makeDetail();const add=(key,id,kind)=>({key,kind:'lookup',value:'Existing selection',label:key,section:'riggs',lane:'reference',mappedEdit:true,editable:true,choices:[],options:[{id,label:'Person or firm'},{id:kind==='staff'?52:kind==='gc'?'140-52':'206-52',label:'Other'}],selectionId:id});
  d.fields.splice(-3,3,add('pmITUserId',12,'staff'),add('gcLookupId','140-12','gc'),add('architectLookupId','206-12','design'));
  assert.equal(validateJisDetail(d,sid),d);
  assert.deepEqual(buildJisChanges(d,{pmITUserId:52,gcLookupId:'140-52',architectLookupId:'206-52'}),{pmITUserId:52,gcLookupId:'140-52',architectLookupId:'206-52'});
  assert.deepEqual(buildJisChanges(d,{pmITUserId:12}),{});
  for(const v of [{pmITUserId:'52'},{pmITUserId:'Person or firm'},{gcLookupId:'206-52'},{architectLookupId:null},{leed:'No'}])assert.throws(()=>buildJisChanges(d,v));
  d.fields.at(-1).options=[{id:'140-1',label:'Wrong namespace'}];assert.throws(()=>validateJisDetail(d,sid));
});
test('same identity picker as Project Setup; automatic fields use readouts',()=>{
  const editor=readFileSync(new URL('../src/UnnumberedProjectEditor.jsx',import.meta.url),'utf8');
  const numbered=readFileSync(new URL('../src/ActiveProjectCognitoSections.jsx',import.meta.url),'utf8');
  assert.match(editor,/<ProjectSetupIdentityPicker label=\{field.label\} value=\{value\}/);
  assert.match(editor,/options=\{field.options\|\|\[\]\}/);
  assert.match(editor,/allowClear=\{field.allowClear===true\}/);
  assert.match(editor,/field.section==='services'\)return <div className="project-information-item"/);
  assert.match(numbered,/title="Project Information"/);
});

test('existing entry requires an explicit accepted baseline; clears and building IDs preserved',()=>{
  const d=makeDetail();d.cognitoEntryId=1199;d.baselineAccepted=true;assert.equal(validateJisDetail(d,sid),d);
  d.fields.find(f=>f.key==='scope').allowClear=true;
  d.fields.find(f=>f.key==='requiredSubmittals').allowClear=true;
  d.fields.splice(-1,1,field('buildingNames','rows',[{id:'r1',name:'A'}],[],'buildings'));
  const rows=[{id:'r1',name:'B'},{id:null,name:'C'}];
  assert.deepEqual(buildJisChanges(d,{scope:'',requiredSubmittals:[],buildingNames:rows}),{scope:'',requiredSubmittals:[],buildingNames:rows});
  assert.throws(()=>buildJisChanges(d,{buildingNames:[{id:null,name:''}]}));
});

test('numbered contract validates real job and provider identity independently of SetupID',()=>{
 const d={...makeDetail(),setupId:null,originalBidLogId:null,jobListId:777,jobNumber:'30001',revision:1,externalState:'NUMBERED'};
 assert.equal(validateNumberedJisDetail(d,777),d);
 for(const change of [{jobListId:24},{jobNumber:'11111'},{setupId:sid},{cognitoEntryId:966},{cognitoEntryId:1199},{jobListId:778},{jobNumber:null}])assert.throws(()=>validateNumberedJisDetail({...d,...change},777));
 assert.deepEqual(buildJisChanges(d,{scope:'New',leed:false}),{scope:'New',leed:false});
});
