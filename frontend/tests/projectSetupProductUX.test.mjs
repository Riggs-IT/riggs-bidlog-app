import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readSource} from './helpers/readSource.mjs';

const editor=readFileSync(new URL('../src/ProjectSetupEditor.jsx',import.meta.url),'utf8');
const awaiting=readFileSync(new URL('../src/ProjectSetupAwaitingPanel.jsx',import.meta.url),'utf8');
const styles=readSource(new URL('../src/styles.css',import.meta.url));
const styleEntry=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');

test('Project Setup is presented as an operational draft workflow',()=>{
  assert.match(editor,/const PROJECT_TYPES = \['Tilt','CIP','PRE','SITE','Other'\]/);
  assert.match(editor,/const PURPOSES = \['RET','OFF','PAR','IND','EDU','MED','RES','MIX','DAT','STG','SIDE'\]/);
  for(const heading of [
    'Project overview','Where and when','Project commercial setup','Project details',
    'GC contacts','Project owner','Project setup comments',
  ]) assert.match(editor,new RegExp(heading));
  assert.match(editor,/Not yet sent to Cognito/);
  assert.match(editor,/Save & close/);
  assert.match(editor,/Starting contract amount/);
  assert.doesNotMatch(editor,/Operational contract starting value/);
  assert.doesNotMatch(editor,/No job number required/);
});

test('Setup draft list does not claim parked Accounting work is pending',()=>{
  assert.match(awaiting,/Setup drafts/);
  assert.match(awaiting,/Draft in progress/);
  assert.doesNotMatch(awaiting,/Job number pending with Accounting/);
  assert.doesNotMatch(awaiting,/PROJECT SETUP · SQL DRAFTS/);
});

test('Project Setup presentation stays inside the established Active Projects CSS owner',()=>{
  assert.match(styles,/\.project-setup-status-card\s*\{/);
  assert.match(styles,/\.project-setup-section-heading\s*\{/);
  assert.match(styles,/\.project-setup-draft-table\s*\{/);
  assert.doesNotMatch(styleEntry,/16-project-setup\.css/);
});
