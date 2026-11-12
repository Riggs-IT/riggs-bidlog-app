import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateForm206Directory} from '../src/projectSetupAuthoring.mjs';

const source = file => readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8');
const css = readFileSync(new URL('../src/styles/10-active-projects.css',import.meta.url),'utf8');
const prefix = {source:'RIGGSDATAHUB_FORM206_MIRROR',persistence:'SQL_DRAFT_ONLY',
  externalState:'NOT_CONNECTED',selectionVerification:'COGNITO_REST_ON_DRAFT_SAVE',externalWrites:0};

test('frontend accepts old and enriched directory without changing selected ID',()=>{
  const older = {...prefix,architects:[{id:'206-12',label:'Architect'}],engineers:[]};
  const newer = {...prefix,architects:[{id:'206-12',label:'Architect',email:null,address:'Phoenix, AZ'}],engineers:[]};
  assert.equal(validateForm206Directory(older),older);
  assert.equal(validateForm206Directory(newer),newer);
});

test('unavailable identity picker exposes saved ID, never replaces it with Not connected',()=>{
  const code=source('ProjectSetupIdentityPicker.jsx');
  assert.match(code,/Saved identity:/);
  assert.match(code,/Directory unavailable/);
  assert.doesNotMatch(code,/className="project-setup-identity-unavailable">Not connected/);
});

test('retry is read-only and explicit for both editors',()=>{
  const draft=source('ProjectSetupEditor.jsx');
  const active=source('ActiveProjectEditDrawer.jsx');
  const panel=source('ActiveProjectDesignTeam.jsx');
  assert.match(draft,/Retry contacts/);
  assert.match(active,/designDirectoryRetry/);
  assert.match(panel,/Retry contacts/);
  assert.doesNotMatch(panel,/editor\.edit|projectSetupSave|cognito.*PATCH/i);
});

test('Design Team matches neutral surface and text tokens',()=>{
  assert.match(css,/\.design-team-person-card \{background:var\(--surface-2\)/);
  assert.match(css,/\.design-team-directory-warning/);
  assert.match(css,/\.design-team-person-card \.project-setup-identity-unavailable/);
});
