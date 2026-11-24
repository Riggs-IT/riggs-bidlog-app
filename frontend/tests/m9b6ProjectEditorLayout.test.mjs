import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectEditorSectionFields,savedReferenceContact} from '../src/projectEditorLayout.mjs';
const read = name => readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const unnumbered=read('UnnumberedProjectEditor.jsx');
const numbered=read('ActiveProjectEditDrawer.jsx');
const compact=read('ActiveProjectCognitoSections.jsx');
const design=read('ActiveProjectDesignTeam.jsx');

test('deferred scheduling fields hidden without changing the field catalog; duplicate job number omitted',()=>{
  const fields=[{key:'streetAddress',section:'location'},{key:'scheduleNotes',section:'location'},
    {key:'comments',section:'scope'},{key:'jobNumber',section:'services'},{key:'teamDistributionList',section:'services'}];
  const keys=section=>projectEditorSectionFields(fields,section).map(f=>f.key);
  assert.deepEqual(keys('location'),['streetAddress']);
  assert.deepEqual(keys('scope'),['comments']);
  assert.deepEqual(keys('services'),['teamDistributionList']);
  assert.equal(fields[1].section,'location');
  assert.equal(fields.length,5);
});
test('GC and design contact readouts belong only to the saved selected identity',()=>{
  const gc={selectionId:'140-138'};
  const fields=new Map([['email',{value:'gc@example.test'}],['street',{value:'10 Main St'}],['city',{value:'Phoenix, AZ'}]]);
  assert.deepEqual(savedReferenceContact(gc,'140-138',fields,'email',['street','city']),{email:'gc@example.test',address:'10 Main St\nPhoenix, AZ'});
  assert.equal(savedReferenceContact(gc,'140-139',fields,'email',['street','city']),null);
  assert.equal(savedReferenceContact(gc,null,fields,'email',['street','city']),null);
  assert.deepEqual(savedReferenceContact({selectionId:null},null,new Map(),'email',['street']),{email:null,address:null});
});
test('both editor states use existing contact cards and preserve verified selection callbacks',()=>{
  for(const s of [numbered,unnumbered]){
    assert.match(s,/active-project-parties-grid/);
    assert.match(s,/active-project-party-block/);
    assert.match(s,/design-team-person-card/);
    assert.match(s,/DesignTeamContactDetails/);
    assert.match(s,/active-project-scope-grid/);
  }
  assert.match(design,/project-setup-design-grid/);
  assert.match(unnumbered,/project-setup-design-grid/);
  assert.match(unnumbered,/contactCard\('gcLookupId'/);
  assert.match(unnumbered,/contactCard\('architectLookupId'/);
  assert.match(unnumbered,/contactCard\('structuralEngineerLookupId'/);
  assert.match(unnumbered,/onChange=\{value=>change\(field,value\)\}/);
  for(const key of ['ownerName','ownerEmail','ownerStreetAddress','ownerCityStateZip'])assert.match(unnumbered,new RegExp(`namedField\\('${key}'`));
  assert.match(unnumbered,/DesignTeamContactDetails contact=\{contact\} showSource=\{false\}/);
});
test('both keep project notes and header identity while deferring scheduling controls',()=>{
  const location=numbered.split('sectionId="location"')[1].split('</ActiveProjectSection>')[0];
  const scope=numbered.split('sectionId="scope"')[1].split('</ActiveProjectSection>')[0];
  assert.match(location,/label="Anticipated Start"/);
  assert.match(location,/label="Estimated duration \(months\)"/);
  assert.match(scope,/Project notes/);
  assert.doesNotMatch(numbered,/label="(?:Schedule Notes|Planned Start|Planned End)"|>Planned duration</);
  assert.doesNotMatch(unnumbered,/namedField\('scheduleNotes'\)/);
  assert.match(unnumbered,/namedField\('comments'\)/);
  const information=compact.split('sectionId="services"')[1].split('</ActiveProjectSection>')[0];
  assert.doesNotMatch(information,/Job Number|jobNumber/);
  assert.match(information,/Project email/);
  assert.match(information,/Dropbox folder/);
  assert.match(numbered,/subtitle=\{job.jobNumber/);
  assert.match(unnumbered,/subtitle=\{detail\?'Job number pending'/);
});
