import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateForm206Directory} from '../src/projectSetupAuthoring.mjs';

const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url),'utf8');

test('Form206 directory retains verified identity and typed contact metadata',()=>{
  const data = {source:'RIGGSDATAHUB_FORM206_MIRROR', persistence:'SQL_DRAFT_ONLY',
    externalState:'NOT_CONNECTED', selectionVerification:'COGNITO_REST_ON_DRAFT_SAVE', externalWrites:0,
    architects:[{id:'206-4',label:'Verified Architect',email:'architect@example.test',address:'10 Main St\nPhoenix, AZ 85001'}],
    engineers:[{id:'206-7',label:'Verified Engineer',email:null,address:null}]};
  assert.equal(validateForm206Directory(data),data);
  for(const bad of [
    {...data,architects:[{...data.architects[0],email:{unsafe:true}}]},
    {...data,architects:[{...data.architects[0],address:'x'.repeat(2001)}]},
    {...data,engineers:[{...data.engineers[0],id:'140-7'}]},
  ]) assert.throws(()=>validateForm206Directory(bad));
});

test('draft Design Team contains two verified single-select form206 lookups and contact details',()=>{
  const code = source('ProjectSetupEditor.jsx');
  assert.match(code,/id="setup-section-design"/);
  assert.match(code,/form206Directory\?\.architects/);
  assert.match(code,/form206Directory\?\.engineers/);
  assert.match(code,/change\('architectLookupId',value\)/);
  assert.match(code,/change\('structuralEngineerLookupId',value\)/);
  assert.match(code,/DesignTeamContactDetails/);
  assert.doesNotMatch(code,/details className="project-setup-secondary-details project-setup-design-details"/);
});

test('active Design Team uses saved Form19 details and candidate preview never writes project edits',()=>{
  const drawer=source('ActiveProjectEditDrawer.jsx');
  const component=source('ActiveProjectDesignTeam.jsx');
  const details=source('DesignTeamContactDetails.jsx');
  assert.match(drawer,/ActiveProjectDesignTeam/);
  assert.match(drawer,/architectOfRecord\?\.aorName\?\.id/);
  assert.match(drawer,/structuralEngineerOfRecord\?\.seorName\?\.id/);
  assert.match(component,/Not saved · Preview only/);
  assert.doesNotMatch(component,/Current JIS:/);
  assert.match(component,/setPreviewId/);
  assert.doesNotMatch(component,/onChange\('(?:architectLookupId|structuralEngineerLookupId)'/);
  assert.doesNotMatch(component,/editor\.edit/);
  assert.match(details,/fallbackEmail \|\| contact\?\.email/);
  assert.match(details,/fallbackAddress \|\| contact\?\.address/);
});

test('compact JIS reference no longer duplicates Design Team',()=>{
  const sections=source('ActiveProjectCognitoSections.jsx');
  const compact=sections.split('if (compact) return (')[1]?.split('\n  return (')[0]||'';
  assert.doesNotMatch(compact,/Subheading>Design Team/);
  assert.match(compact,/Buildings & Contract Details/);
});

test('design contact CSS remains responsive',()=>{
  const css=readFileSync(new URL('../src/styles/10-active-projects.css', import.meta.url),'utf8');
  assert.match(css,/\.project-setup-design-grid/);
  assert.match(css,/@media \(max-width:820px\)/);
});
