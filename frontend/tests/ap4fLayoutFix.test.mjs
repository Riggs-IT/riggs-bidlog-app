import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const workspace = src('ActiveProjectsWorkspace.jsx');
const active = src('ActiveProjectEditDrawer.jsx');
const setup = src('ProjectSetupEditor.jsx');
const gc = src('ActiveProjectTeamSections.jsx');
const css = src('styles/10-active-projects.css');

test('Completed and Drafts share a contiguous project-view control group', () => {
  assert.match(workspace, /className="active-project-view-controls"[^>]*role="group"/);
  assert.match(workspace,
    /className="active-project-view-controls"[\s\S]*?Completed\s*<\/button>[\s\S]*?Drafts\s*<\/button>[\s\S]*?<\/div>\s*<div className="active-project-filter-actions">/);
  assert.match(css,/\.active-project-view-controls\s*\{[^}]*display:\s*inline-flex/);
  assert.match(css,/\.active-project-filter-toolbar\s*>\s*\.active-project-filter-actions\s*\{[^}]*margin-left:\s*auto/);
});

test('Active Project first-row geometry and contractor form reduce vertical dead space', () => {
  assert.match(active, /className="bid-edit-grid active-project-core-grid"/);
  assert.match(active, /<Field label="Project Name">/);
  assert.match(active, /<Field label="Street Address">/);
  assert.match(active, /<Field label="City \/ State \/ ZIP">/);
  assert.match(active, /<ActiveProjectGcPicker value=\{form.gc\|\|''\}/);
  assert.match(gc, /export function ActiveProjectGcPicker/);
  assert.match(gc, /canonicalDirectory\(options\)/);
  assert.match(css,/\.active-project-edit-drawer \.active-project-core-grid/);
  assert.match(css,/\.active-project-gc-combobox/);
  assert.match(active,/editor\.save\(\)/);
  assert.match(active,/writeEnabled=\{Number\(jobListId\) === 24\}/);
});

test('Project Setup is never a visually blank modal during loading and retains explicit errors', () => {
  assert.match(setup,/const \[busy,setBusy\] = useState\(\(\) => Boolean\(intent && mayInspectSetup\(user\)\)\)/);
  assert.match(setup,/Opening project setup…/);
  assert.match(setup,/\{error && <div role="alert"/);
  assert.match(setup,/No draft loaded\. Return to Drafts/);
  assert.match(css,/\.floating-editor-scroll-surface > \.floating-editor-body[\s\S]*?flex:\s*1 0 auto/);
  assert.match(setup,/validateEditReceipt\(response/);
});
