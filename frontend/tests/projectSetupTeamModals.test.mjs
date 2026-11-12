import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const editor=read('ProjectSetupEditor.jsx');
const team=read('ProjectSetupTeamSections.jsx');

test('GC and Riggs teams are distinct; established Form206 pickers stay',()=>{
  assert.match(editor,/sectionHeading\('TEAM','Riggs Team'\)/);
  assert.match(editor,/sectionHeading\('DESIGN','Design Team'\)/);
  assert.match(editor,/<RiggsProjectTeam values=\{form\}/);
  assert.match(editor,/<GcProjectTeam value=\{form\.gcContactInfo\}/);
  assert.match(editor,/form206Directory\?\.architects/);
  assert.match(editor,/form206Directory\?\.engineers/);
  assert.match(editor,/gcLookupId/);
});
test('GC roster uses verified draft save not provider or new SQL endpoint',()=>{
  assert.match(editor,/change\('gcContactInfo\.teamMembers',members\)/);
  assert.match(team,/onChange\(next\)/);
  assert.match(team,/savedIds/);
  assert.match(team,/dateRemoved/);
  assert.match(team,/isPrimary/);
  assert.match(team,/Confirm removal/);
  assert.match(team,/Form 19-compatible fields/);
  assert.doesNotMatch(team,/\/v1\/|\/cognito|fetch\(/);
});
test('person cards offer single-click edit, keyboard access and x-confirm',()=>{
  assert.match(team,/onClick=\{onEdit\}/);
  assert.doesNotMatch(team,/onDoubleClick/);
  assert.match(team,/event.key==='Enter'/);
  assert.match(team,/setup-team-remove/);
  assert.match(team,/TeamDialog title="Remove GC contact\?"/);
  assert.match(team,/TeamDialog title="Remove Riggs team assignment\?"/);
  assert.match(team,/onKeyDownCapture/);
  assert.match(team,/aria-modal="true"/);
});
test('Riggs team maintains verified namespaces and plural roles',()=>{
  for(const k of ['pmITUserId','apmITUserId','peITUserId','superintendentEid','surveyorITUserId',
    'foremanEids','additionalMemberITUserIds']) assert.match(team,new RegExp(k));
  assert.match(team,/directory:\'employees\'/);
  assert.match(team,/directory:\'itUsers\'/);
  assert.match(team,/ProjectSetupIdentityPicker/);
  assert.match(team,/Replace Riggs team assignment\?/);
});
