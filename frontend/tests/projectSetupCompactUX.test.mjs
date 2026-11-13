import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src = name => readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const workspace=src('ActiveProjectsWorkspace.jsx');
const drafts=src('ProjectSetupAwaitingPanel.jsx');
const editor=src('ProjectSetupEditor.jsx');
const picker=src('ProjectSetupIdentityPicker.jsx');
const team=src('ProjectSetupTeamSections.jsx');
const project=src('ActiveProjectEditDrawer.jsx');
const shell=src('FloatingEditorShell.jsx');
const styles=src('styles/10-active-projects.css');

test('Drafts moved beside Completed; top Project Directory/Awaiting navigation removed',()=>{
  assert.match(workspace,/Completed\s*<\/button>[\s\S]*?project-setup-view-toggle[\s\S]*?Drafts\s*<\/button>/);
  assert.doesNotMatch(workspace,/Project Directory<\/button>|Awaiting information<\/button>/);
  assert.match(workspace,/<h1>Active Projects<\/h1>/);
  assert.match(workspace,/onResume=\{onSetupIntentChanged \?/);
});

test('Set Up Drafts is short, whole-row clickable for ADMIN, read-only for Operations',()=>{
  assert.match(drafts,/<h2>Set Up Drafts<\/h2>/);
  assert.match(drafts,/Awarded Projects that need more information\. They will not post on JIS until filled out\./);
  assert.match(drafts,/className=\{onResume \? 'project-setup-draft-row is-clickable'/);
  assert.match(drafts,/tabIndex=\{onResume \? 0 : undefined\}/);
  assert.match(drafts,/event.key === 'Enter' \|\| event.key === ' '/);
  assert.doesNotMatch(drafts,/Continue setup|Continue a saved draft/);
});

test('Header Draft checklist replaces redundant draft details and keeps advisory status',()=>{
  assert.doesNotMatch(editor,/project-setup-draft-details|project-setup-status-card/);
  assert.match(editor,/project-setup-checklist-popover/);
  assert.match(editor,/Draft · \{readiness.filled\}\/\{readiness.total\}/);
  assert.match(editor,/goToSection\(item.sectionId\)/);
  assert.match(editor,/JIS blocked ·/);
  assert.match(editor,/savedReadiness\.missingReviewFields\.length/);
  assert.match(editor,/savedReadiness\.blockers\.length/);
  assert.match(editor,/backLabel="Drafts"/);
});

test('Form sections have a practical order without dropping any known editable path',()=>{
  const sequence=['PROJECT','LOCATION','PARTIES','TEAM','SCOPE'];
  let position=-1;
  for(const key of sequence) {
    const next=editor.indexOf(`sectionHeading('${key}'`);
    assert.ok(next>position,`section ${key} order`);position=next;
  }
  for(const field of ['gcLookupId','architectLookupId','structuralEngineerLookupId',
    'contractAmount','retentionPercent','streetAddress','anticipatedStartDate','projectOwnerInfo.name',
    'buildingNames','gcContactInfo.teamMembers']) {
    assert.ok(editor.includes(field),`missing project field ${field}`);
  }
  for(const field of ['pmITUserId','peITUserId','apmITUserId','superintendentEid','foremanEids',
    'additionalMemberITUserIds','surveyorITUserId']) {
    assert.ok(team.includes(field),`missing Riggs project team identity ${field}`);
  }
  assert.match(team,/dateAdded/);assert.match(team,/dateRemoved/);
  assert.match(team,/onClick=\{onEdit\}/);assert.match(team,/Confirm removal/);
  assert.match(editor,/validateEditReceipt\(response/);
  assert.match(editor,/pending\.current=\{operationId:createSetupOperationId\(\),expectedRevision:record\.revision,changes\}/);
});

test('Single field combobox searches labels and IDs without a secondary search input',()=>{
  assert.match(picker,/role="combobox"/);
  assert.match(picker,/role="listbox"/);
  assert.match(picker,/aria-expanded=\{open\}/);
  assert.match(picker,/item\.label\.toLocaleLowerCase\(\)\.includes\(normalized\)/);
  assert.match(picker,/ArrowDown/);
  assert.match(picker,/onBlurCapture/);
  assert.equal((picker.match(/<input\b/g)||[]).length,1);
  assert.equal((picker.match(/<select\b/g)||[]).length,0);
  assert.match(picker,/onChange\(\[\.\.\.chosen,option\.id\]\)/);
  assert.match(picker,/onChange\(option\.id\)/);
  assert.match(picker,/Unverified ID/);
});

test('Whole-surface scrolling applies only to Setup and Active Project editor',()=>{
  assert.match(editor,/scrollSurface/);
  assert.match(project,/scrollSurface/);
  assert.match(shell,/scrollSurface = false/);
  assert.match(shell,/surfaceRef\.current\?\.scrollBy/);
  assert.match(styles,/\.floating-editor-surface\.floating-editor-scroll-surface\s*\{[^}]*overflow-y:auto/);
  assert.match(styles,/\.floating-editor-scroll-surface > \.floating-editor-header\s*\{[^}]*position:sticky/);
});

test('Active Project edit groups retain safe writes and move start date into Schedule',()=>{
  assert.match(project,/<h3>Project basics<\/h3>/);
  assert.match(project,/<h3>Owner \/ Developer & General Contractor<\/h3>/);
  assert.match(project,/<h3>Riggs Team<\/h3>/);
  assert.match(project,/<h3>Location & schedule<\/h3>/);
  assert.ok(project.indexOf('label="Anticipated Start"') > project.indexOf('<h3>Location & schedule</h3>'));
  assert.match(project,/editor\.save\(\)/);
  assert.match(project,/writeEnabled=\{Number\(jobListId\) === 24\}/);
});
