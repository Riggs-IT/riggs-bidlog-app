import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setupReadiness} from '../src/projectSetupReadiness.mjs';
const get=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const setup=get('ProjectSetupEditor.jsx');
const shell=get('FloatingEditorShell.jsx');
const active=get('ActiveProjectEditDrawer.jsx');
const team=get('ActiveProjectTeamSections.jsx');
const sheet=get('ActiveProjectCognitoSections.jsx');
const workspace=get('ActiveProjectsWorkspace.jsx');
const css=get('styles/10-active-projects.css');

test('draft checklist is in header, section-linked and never a completion gate',()=>{
  assert.match(shell,/headerActions = null/);
  assert.match(setup,/headerActions=\{record &&/);
  assert.match(setup,/goToSection\(item.sectionId\)/);
  assert.match(setup,/setup-section-halo/);
  assert.match(css,/prefers-reduced-motion/);
  assert.doesNotMatch(setup,/className="project-setup-draft-details"/);
  const advisory=setupReadiness({jobName:'Sample',contractAmount:'0'},null);
  assert.equal(advisory.dispatchReady,false);
  assert.equal(advisory.items.find(i=>i.field==='contractAmount').sectionId,'setup-section-contract');
  assert.equal(advisory.items.find(i=>i.field==='jobName').filled,true);
  assert.equal(advisory.items.find(i=>i.field==='gcLookupId').filled,false);
});

test('contract type is truthfully indicated as unpersisted; contract values live in their own section',()=>{
  assert.match(setup,/Contract type/);
  assert.doesNotMatch(setup,/Draft storage mapping pending/);
  assert.match(setup,/setup-section-contract/);
  assert.match(setup,/input\('contractAmount','Starting contract amount'/);
  assert.match(setup,/input\('retentionPercent','Retention \(%\)'/);
  assert.match(setup,/input\('bond','Bond'\)/);
  assert.match(setup,/input\('parcel','Parcel'\)/);
  assert.doesNotMatch(setup,/change\('contractType'/);
});

test('GC preview is resolved by exact 140-N identity, never company names',()=>{
  assert.match(setup,/row.cognitoLookupId===form.gcLookupId/);
  assert.match(setup,/matches.length===1/);
  assert.match(setup,/<DesignTeamContactDetails/);
  assert.match(setup,/selectedForm140\.streetAddress/);
  assert.doesNotMatch(setup,/ProjectSetupGcCompany|Use Form 140 default|Saved draft override/);
  assert.doesNotMatch(setup,/nameKey\(.*gcLookupId/);
});

test('setup Back and drafts Projects navigation are not duplicated',()=>{
  assert.match(setup,/backLabel="Drafts"/);
  assert.doesNotMatch(setup,/>Back to Drafts<\/button>/);
  assert.match(workspace,/>\s*Projects\s*<\/button>/);
  assert.doesNotMatch(workspace,/<span className="project-setup-list-status">Set Up Drafts<\/span>/);
});

test('active project GC is one search control and GC PM edits only approved field',()=>{
  assert.match(active,/<ActiveProjectGcPicker/);
  assert.doesNotMatch(active,/<BidLogGeneralContractorSelect/);
  assert.match(team,/type="search" role="combobox"/);
  assert.match(team,/pmReference\?\.gcpmOffice/);
  assert.match(team,/pmReference\?\.gcpmMobile/);
  assert.match(team,/pmReference\?\.gcpmEmail/);
  assert.match(team,/onChange\('gcpm',next\)/);
  assert.match(team,/disabled readOnly/);
  assert.doesNotMatch(team,/onChange\('gcpmOffice'/);
});

test('compact reference retains useful design/contract fields without rendering legacy controls',()=>{
  assert.match(active,/<ActiveProjectCognitoSections compact/);
  assert.match(sheet,/if \(compact\) return/);
  assert.match(sheet,/Architect of Record/);
  assert.match(sheet,/Structural Engineer/);
  assert.match(sheet,/Contract type/);
  const branch=sheet.split('if (compact) return')[1].split('  return (')[0];
  assert.doesNotMatch(branch,/ControlProjectName|RiggsPMEmail|FolderCreated|NotifyEveryone/);
  assert.match(active,/writeEnabled=\{Number\(jobListId\) === 24\}/);
  assert.match(active,/<ActiveProjectAdditionalMembers/);
});
