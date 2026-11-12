import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDraftChanges,applyDraftChanges,setPath} from '../src/projectSetupAuthoring.mjs';
import {GC_COMPANY_FIELDS,GC_COMPANY_PATHS,gcCompanyFieldState,gcContactContextHasData} from '../src/projectSetupGcCompany.mjs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');

test('three company overrides correspond exactly to approved SQL draft leaves',()=>{
  assert.deepEqual(GC_COMPANY_FIELDS.map(f=>f.key),['streetAddress','cityStateZip','generalEmail']);
  assert.equal(GC_COMPANY_PATHS.size,3);
  for(const path of ['gcContactInfo.streetAddress','gcContactInfo.cityStateZip','gcContactInfo.generalEmail'])
    assert.equal(GC_COMPANY_PATHS.has(path),true);
});

test('null means Form 140 default, not a copied SQL draft override',()=>{
  const source={streetAddress:'10 Source Ave',cityStateZip:'Phoenix, AZ 85001',email:'source@example.test'};
  const state=gcCompanyFieldState({streetAddress:null},source,'streetAddress');
  assert.equal(state.hasOverride,false);
  assert.equal(state.effective,'10 Source Ave');
  assert.equal(state.reference,'10 Source Ave');
  assert.deepEqual(buildDraftChanges({gcContactInfo:{streetAddress:null}},
    {gcContactInfo:{streetAddress:null}},new Set(['gcContactInfo.streetAddress'])),{});
});

test('Ops override persists through changed Form 140 reference, without contacting Form 140',()=>{
  const base={gcContactInfo:{streetAddress:null,cityStateZip:null,generalEmail:null,pm:{name:'Historical'},teamMembers:[]}};
  const form=setPath(base,'gcContactInfo.generalEmail','job@example.test');
  const changes=buildDraftChanges(base,form,new Set(['gcContactInfo.generalEmail']));
  assert.deepEqual(changes,{gcContactInfo:{generalEmail:'job@example.test'}});
  const saved=applyDraftChanges(base,changes);
  assert.equal(saved.gcContactInfo.pm.name,'Historical');
  for(const email of ['oldmaster@example.test','newmaster@example.test']) {
    const state=gcCompanyFieldState(saved.gcContactInfo,{email},'generalEmail');
    assert.equal(state.effective,'job@example.test');
    assert.equal(state.hasOverride,true);
    assert.equal(state.reference,email);
  }
});

test('explicit blank project override differs from null/inherit and can be reset',()=>{
  const base={gcContactInfo:{generalEmail:'old@example.test'}};
  const blank=setPath(base,'gcContactInfo.generalEmail','');
  const patch=buildDraftChanges(base,blank,new Set(['gcContactInfo.generalEmail']));
  assert.deepEqual(patch,{gcContactInfo:{generalEmail:''}});
  const projected=applyDraftChanges(base,patch);
  const state=gcCompanyFieldState(projected.gcContactInfo,{email:'master@example.test'},'generalEmail');
  assert.equal(state.hasOverride,true);
  assert.equal(state.effective,null);
  const reset=buildDraftChanges(projected,setPath(projected,'gcContactInfo.generalEmail',null),
    new Set(['gcContactInfo.generalEmail']));
  assert.deepEqual(reset,{gcContactInfo:{generalEmail:null}});
  assert.equal(gcCompanyFieldState(applyDraftChanges(projected,reset).gcContactInfo,{email:'master@example.test'},'generalEmail').effective,
    'master@example.test');
});

test('Owner form remains four independently editable leaves; no GC parent clobber',()=>{
  const base={projectOwnerInfo:{name:'Original owner',streetAddress:'10 Main',cityStateZip:'Mesa, AZ',email:'owner@example.test'},
    gcContactInfo:{generalEmail:'gc@example.test'}};
  const updated=setPath(base,'projectOwnerInfo.email','');
  const changes=buildDraftChanges(base,updated,new Set(['projectOwnerInfo.email']));
  assert.deepEqual(changes,{projectOwnerInfo:{email:null}});
  const saved=applyDraftChanges(base,changes);
  assert.equal(saved.projectOwnerInfo.name,'Original owner');
  assert.equal(saved.gcContactInfo.generalEmail,'gc@example.test');
});

test('GC reassignment requires separate contact-history review when existing data exists',()=>{
  assert.equal(gcContactContextHasData({teamMembers:[],pm:{},superintendent:{},generalEmail:null}),false);
  for(const info of [{teamMembers:[{memberId:'x'}]},{generalEmail:''},{streetAddress:'a'},
    {pm:{name:'a'}},{superintendent:{mobile:'a'}}]) assert.equal(gcContactContextHasData(info),true);
  const editor=read('ProjectSetupEditor.jsx');
  assert.match(editor,/path==='gcLookupId' && form\?\.gcLookupId!==value && gcContactContextHasData/);
  assert.match(editor,/requires a separate contact-history review/);
});

test('company editor never performs provider writes; saves via normal leaf changes',()=>{
  const editor=read('ProjectSetupEditor.jsx');
  const component=read('ProjectSetupGcCompany.jsx');
  assert.match(editor,/change\(`gcContactInfo\.\$\{key\}`,value\)/);
  assert.match(component,/Use Form 140 default/);
  assert.match(component,/onChange\(field.key,null\)/);
  assert.match(component,/Saved draft override/);
  assert.match(component,/Form 19 currently calculates company fields from Form 140/);
  assert.doesNotMatch(component,/fetch\(|axios|CognitoClient|POST|PATCH|createEntry/);
});

test('responsive implementation remains inside the established CSS owner',()=>{
  const css=read('styles/10-active-projects.css');
  assert.match(css,/\.project-setup-gc-company-grid/);
  assert.match(css,/@media\(max-width:700px\)/);
});
