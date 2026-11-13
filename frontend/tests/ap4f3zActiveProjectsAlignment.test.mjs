import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activeProjectGcContact} from '../src/gcReference.js';

const code = file => readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
const gc={gcName:'A Construction',gcEmail:'jis@example.invalid',
  gcStreetAddress:'Old address',gcCityStateZip:'Old city'};
const unique=[{id:'1',name:'A Construction',email:'form140@example.invalid',
  streetAddress:'123 Main',cityStateZip:'Phoenix, AZ',isActive:true}];

test('unique exact Form140 reference wins for the currently selected GC',()=>{
  assert.deepEqual(activeProjectGcContact({selectedName:' A Construction ',
    savedName:'A Construction', options:unique,cognito:gc}), {
      email:'form140@example.invalid',address:'123 Main\nPhoenix, AZ',source:'FORM140'});
});

test('unsaved replacement never displays the previous GC JIS email and address',()=>{
  const chosen='Other Contractor';
  const result=activeProjectGcContact({selectedName:chosen,savedName:'A Construction',
    options:[],cognito:gc});
  assert.deepEqual(result,{email:null,address:null,source:null});
});

test('preview of another verified contractor shows only its Form140 details',()=>{
  const result=activeProjectGcContact({selectedName:'Other Contractor',
    savedName:'A Construction', options:[...unique,{id:'2',name:'Other Contractor',
    email:'other@example.invalid',streetAddress:'88 Second',cityStateZip:'Mesa, AZ'}],cognito:gc});
  assert.equal(result.email,'other@example.invalid');
  assert.equal(result.address,'88 Second\nMesa, AZ');
});

test('ambiguous Form140 names fail closed, even when JIS has a name match',()=>{
  assert.deepEqual(activeProjectGcContact({selectedName:'A Construction',savedName:'A Construction',
    options:[...unique,{...unique[0],id:'3'}],cognito:gc}),
    {email:null,address:null,source:null});
});

test('multi-GC names, missing and inactive references cannot invent a company',()=>{
  for(const value of ['A Construction¡Another Co','',null]) {
    assert.equal(activeProjectGcContact({selectedName:value,savedName:'A Construction',options:unique,cognito:gc}).source,null);
  }
  assert.equal(activeProjectGcContact({selectedName:'Another Co',savedName:'A Construction',
    options:[{id:'3',name:'Another Co',isActive:false}],cognito:gc}).source,null);
});

test('Cognito fallback only for the saved company and independently matching name',()=>{
  assert.deepEqual(activeProjectGcContact({selectedName:'A Construction',
    savedName:'A Construction',options:[],cognito:gc}), {
      email:'jis@example.invalid',address:'Old address\nOld city',source:'COGNITO_JIS'});
  assert.equal(activeProjectGcContact({selectedName:'A Construction',savedName:'A Construction',
    options:[],cognito:{...gc,gcName:'Different JIS company'}}).source,null);
});

test('role-gated browsing uses the existing GET and management cannot call save',()=>{
  const drawer=code('ActiveProjectEditDrawer.jsx');
  const routes=code('../../backend/app/project_setup_authoring.py');
  const picker=code('ActiveProjectDesignTeam.jsx');
  assert.match(drawer,/const canInspectChoices = canEdit \|\| managementPreview/);
  assert.match(drawer,/useGcReference\(canInspectChoices\)/);
  assert.match(drawer,/if \(!canInspectChoices \|\| !jobListId\)/);
  assert.match(drawer,/editable=\{canInspectChoices && !saving\}/);
  assert.match(drawer,/managementPreview \? setGcPreviewName\(value\) : updateField\('gc',value\)/);
  assert.match(drawer,/canEdit && !loading && !loadError/);
  assert.match(drawer,/gcPreviewName.*?\[jobListId\]/s);
  assert.match(picker,/Not saved · Preview only/);
  assert.match(routes,/@router.get\("\/form206"\)/);
  assert.match(routes,/current_user: CurrentUser = Depends\(_reader\)/);
});

test('GC reference uses the same Design Team card and no new CSS pathway',()=>{
  const drawer=code('ActiveProjectEditDrawer.jsx');
  assert.match(drawer,/className="design-team-person-card"/);
  assert.match(drawer,/<DesignTeamContactDetails\s+contact=\{gcContact\} showSource=\{false\}/);
  assert.doesNotMatch(drawer,/GC Email<\/span>/);
  assert.doesNotMatch(drawer,/GC Address<\/span>/);
  assert.doesNotMatch(drawer,/GC City \/ State \/ ZIP<\/span>/);
});
