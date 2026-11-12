import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const setup=read('ProjectSetupEditor.jsx');
const team=read('ProjectSetupTeamSections.jsx');
const active=read('ActiveProjectEditDrawer.jsx');
const activeTeams=read('ActiveProjectTeamSections.jsx');
const css=read('styles/10-active-projects.css');

test('Project Setup matches project/location, owner/GC, two teams, scope/notes hierarchy',()=>{
  for(const block of ['project-setup-layout-pair','project-setup-parties-grid',
    'project-setup-teams-pair','project-setup-scope-grid','project-setup-checklist'])
    assert.ok(setup.includes(block),block);
  for(const title of ['Project basics','Location & schedule','Owner / Developer & General Contractor',
    'Riggs Team','GC Team','Scope & Notes','Design Team']) assert.ok(setup.includes(title),title);
  assert.ok(setup.indexOf('project-setup-layout-pair') < setup.indexOf('project-setup-parties-grid'));
  assert.ok(setup.indexOf('project-setup-parties-grid') < setup.indexOf('project-setup-teams-pair'));
  assert.ok(setup.indexOf('project-setup-teams-pair') < setup.indexOf('project-setup-scope-grid'));
});
test('Project Setup keeps all canonical inputs and signed Form206 identity selectors',()=>{
  for(const field of ['jobName','numberOfBuildings','jobType','purpose','streetAddress','city','state','postalCode',
    'gcLookupId','contractAmount','retentionPercent','anticipatedStartDate','estimatedDurationMonths','bond','parcel',
    'projectOwnerInfo.name','projectOwnerInfo.email','projectOwnerInfo.streetAddress','projectOwnerInfo.cityStateZip',
    'architectLookupId','structuralEngineerLookupId','scope','leed','ndaRequired','keywords','comments','buildingNames',
    'selectedForm140','gcContactInfo.teamMembers'])
    assert.ok(setup.includes(field),field);
  assert.match(setup,/form206Directory\?\.architects/);
  assert.match(setup,/form206Directory\?\.engineers/);
  assert.match(setup,/validateEditReceipt\(response/);
  assert.match(setup,/expectedRevision:record\.revision/);
  assert.doesNotMatch(setup,/\/v1\/.*?form19\/create|\/cognito\/entries\/post/);
});
test('Riggs chips are single-click, modal is unclipped and explanations removed',()=>{
  assert.match(team,/onClick=\{onEdit\}/);
  assert.doesNotMatch(team,/onDoubleClick/);
  assert.doesNotMatch(team,/Choose the Riggs role and employee from the existing authenticated directory/);
  assert.doesNotMatch(team,/Role IDs remain in their established EID\/ITUserID namespaces/);
  assert.match(team,/setup-team-modal--picker/);
  assert.match(css,/\.setup-team-modal--picker \.setup-team-modal-body\s*\{[^}]*overflow:visible/);
  assert.match(css,/\.setup-team-modal--picker \.project-setup-combobox-list/);
  assert.match(team,/dateAdded/);assert.match(team,/dateRemoved/);
  assert.match(team,/Confirm removal/);
});
test('Active Project heading prioritizes job name and retains source-specific writers',()=>{
  assert.match(active,/title=\{job\.jobName \|\| projectSummary\?\.jobName/);
  assert.match(active,/subtitle=\{job\.jobNumber \? `Job #\$\{job\.jobNumber\}`/);
  assert.match(active,/active-project-layout-pair/);
  assert.match(active,/active-project-parties-grid/);
  assert.match(active,/active-project-teams-pair/);
  assert.match(active,/active-project-scope-grid/);
  assert.match(active,/<ActiveProjectOfficeTeam/);
  assert.match(active,/<ActiveProjectGcTeam/);
  assert.match(active,/<ActiveProjectStaffingOrganizer/);
  assert.match(active,/<ActiveProjectAdditionalMembers/);
  assert.match(active,/writeEnabled=\{Number\(jobListId\) === 24\}/);
  assert.match(active,/editor\.save\(\)/);
  assert.match(active,/active-project-full-reference/);
  assert.match(active,/compact payload=\{cognitoPayload\}/);
});
test('Active team editing is limited to verified office roles and legacy GC PM',()=>{
  for(const field of ['pmITUserId','apmITUserId','peITUserId']) assert.ok(activeTeams.includes(field));
  assert.match(activeTeams,/person\?\.projectRole/);
  assert.match(activeTeams,/sharePointId/);
  assert.match(activeTeams,/onChange\('gcpm',/);
  assert.match(activeTeams,/GC Superintendent · JIS/);
  assert.match(activeTeams,/SQL-draft only/);
  assert.doesNotMatch(activeTeams,/fetch\(|\/api\/|cognito\/forms|onChange\('gcSuper/);
});
test('CSS stacks cards and retains person selection access on narrow screens',()=>{
  assert.match(css,/@media\(max-width:980px\)/);
  assert.match(css,/\.project-setup-layout-pair,\s*\.project-setup-parties-grid/);
  assert.match(css,/\.active-project-layout-pair,\s*\.active-project-parties-grid/);
  assert.match(css,/\.setup-team-modal--picker/);
});
