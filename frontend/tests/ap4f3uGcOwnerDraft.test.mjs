import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {buildDraftChanges,applyDraftChanges,setPath,gcContactContextHasData} from '../src/projectSetupAuthoring.mjs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');

test('Form 140 contact email/address are read-only reference values using Design Team presentation',()=>{
  const editor=read('ProjectSetupEditor.jsx');
  assert.match(editor,/<DesignTeamContactDetails/);
  assert.match(editor,/selectedForm140\.email/);
  assert.match(editor,/selectedForm140\.streetAddress/);
  assert.match(editor,/selectedForm140\.cityStateZip/);
  assert.match(editor,/showSource=\{false\}/);
  assert.doesNotMatch(editor,/change\(`gcContactInfo\.\$\{key\}`/);
  assert.equal(existsSync(new URL('../src/ProjectSetupGcCompany.jsx',import.meta.url)),false);
  assert.equal(existsSync(new URL('../src/projectSetupGcCompany.mjs',import.meta.url)),false);
});

test('historic GC company values remain preserved when saving another project field',()=>{
  const base={projectOwnerInfo:{name:'Original owner',streetAddress:'10 Main',cityStateZip:'Mesa, AZ',email:'owner@example.test'},
    gcContactInfo:{generalEmail:'saved@historical.test',streetAddress:'Old address',pm:{name:'Primary'},teamMembers:[]}};
  const changed=setPath(base,'projectOwnerInfo.email','');
  const edits=buildDraftChanges(base,changed,new Set(['projectOwnerInfo.email']));
  assert.deepEqual(edits,{projectOwnerInfo:{email:null}});
  const saved=applyDraftChanges(base,edits);
  assert.equal(saved.projectOwnerInfo.name,'Original owner');
  assert.equal(saved.gcContactInfo.generalEmail,'saved@historical.test');
  assert.equal(saved.gcContactInfo.streetAddress,'Old address');
  assert.equal(saved.gcContactInfo.pm.name,'Primary');
});

test('switching a saved verified GC still protects legacy contacts and history',()=>{
  assert.equal(gcContactContextHasData({teamMembers:[],pm:{},superintendent:{},generalEmail:null}),false);
  for(const contactInfo of [{teamMembers:[{memberId:'x'}]},{generalEmail:''},{streetAddress:'a'},
    {pm:{name:'a'}},{superintendent:{mobile:'a'}}]) assert.equal(gcContactContextHasData(contactInfo),true);
  assert.match(read('ProjectSetupEditor.jsx'),/gcContactContextHasData\(form\?\.gcContactInfo\)/);
});

test('retired GC override CSS is removed; Design Team CSS stays in its existing stylesheet',()=>{
  const css=read('styles/10-active-projects.css');
  assert.doesNotMatch(css,/\.project-setup-gc-company/);
  assert.match(css,/\.design-team-contact-details/);
});
