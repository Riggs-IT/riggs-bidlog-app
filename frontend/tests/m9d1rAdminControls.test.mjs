import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectEditorSectionFields} from '../src/projectEditorLayout.mjs';
import {toggleSubmittal} from '../src/projectSubmittals.mjs';
import {buildJisChanges} from '../src/unnumberedProjectEditor.mjs';
import {mayAuthor,mayInspectSetup} from '../src/projectSetupAuthoring.mjs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');

test('one Admin card and Contract / LOI in basics even with older wire catalog',()=>{
  const fields=[{key:'contractFlag',section:'contract',value:false},{key:'retention',section:'contract'},
    {key:'lender',section:'accounting'},{key:'buildingNames',section:'buildings'},{key:'plannedStartDate',section:'location'},{key:'squareFootageSF',section:'basics'}];
  const keys=section=>projectEditorSectionFields(fields,section).map(f=>f.key);
  assert.deepEqual(keys('basics'),['contractFlag']);assert.deepEqual(keys('admin'),['retention','lender']);
  assert.deepEqual(keys('contract'),[]);assert.deepEqual(keys('accounting'),[]);assert.deepEqual(keys('buildings'),['buildingNames']);
  assert.deepEqual(keys('location'),[]);assert.deepEqual(keys('metrics'),['squareFootageSF']);assert.equal(fields[0].section,'contract');
});
test('submittal buttons toggle provider choices in stable order, including intentional empty',()=>{
  const choices=['Panel Book','3D Model','Footing Plan'];
  const initial=['3D Model'];
  assert.deepEqual(toggleSubmittal(choices,initial,'Panel Book'),['Panel Book','3D Model']);
  assert.deepEqual(initial,['3D Model']);assert.deepEqual(toggleSubmittal(choices,initial,'3D Model'),[]);
  assert.deepEqual(toggleSubmittal(choices,initial,'fake'),initial);
  assert.deepEqual(toggleSubmittal(choices,['old historical'],'old historical'),[]);
  const editor=read('UnnumberedProjectEditor.jsx');assert.doesNotMatch(editor,/<select multiple/);assert.match(editor,/<ProjectSubmittals choices=\{field.choices\}/);
  assert.match(read('ProjectSubmittals.jsx'),/aria-pressed=\{selected.includes\(choice\)\}/);
});
test('contract toggle sends boolean false and true, no write for unchanged or preview',()=>{
  const field={key:'contractFlag',kind:'boolean',editable:true,value:false};
  assert.deepEqual(buildJisChanges({fields:[field]},{contractFlag:true}),{contractFlag:true});
  assert.deepEqual(buildJisChanges({fields:[{...field,value:true}]},{contractFlag:false}),{contractFlag:false});
  assert.deepEqual(buildJisChanges({fields:[field]},{contractFlag:false}),{});
  assert.deepEqual(buildJisChanges({fields:[{...field,editable:false}]},{contractFlag:true}),{});
  assert.throws(()=>buildJisChanges({fields:[field]},{contractFlag:'false'}));
  const toggle=read('ProjectContractType.jsx');assert.match(toggle,/onClick=\{\(\)=>onChange\(flag\)\}/);assert.match(toggle,/disabled=true/);
});
test('management preview shares visible editor, not authoring capability',()=>{
  const manager={eid:176,appRole:'MANAGEMENT_ADMIN',canReviewProjectSetup:true,canEditProjectSetup:false};
  assert.equal(mayInspectSetup(manager),true);assert.equal(mayAuthor(manager),false);
  const workspace=read('ActiveProjectsWorkspace.jsx'),editor=read('UnnumberedProjectEditor.jsx'),drawer=read('ActiveProjectEditDrawer.jsx');
  assert.match(workspace,/canReadCreatedProjects=mayInspectSetup\(user\)/);
  assert.match(editor,/canEdit=author&&detail\?\.writeEnabled===true/);
  for(const code of [editor,drawer])assert.match(code,/<ProjectQuantitiesLayout/);
  assert.match(read('ProjectQuantitiesLayout.jsx'),/active-project-admin-buildings-pair/);
  assert.match(drawer,/<ProjectContractType value=\{cognitoPayload\?\.contract\}\/>/);
  assert.match(read('ActiveProjectCognitoSections.jsx'),/<ProjectSubmittals value=\{submittals\} \/>/);
});
