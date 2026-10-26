import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src = new URL('../src/', import.meta.url);
const ui = readFileSync(new URL('AdministrationPowerAutomate.jsx', src), 'utf8');
const css = readFileSync(new URL('AdministrationPowerAutomate.css', src), 'utf8');

// These contracts defend against UX2's specific invisible-panel failure;
// signed-in production browser review is still required for top-layer behavior.
test('any part of each flow row opens an inspection (mouse and keyboard)', () => {
  assert.match(ui, /className="riggs-flow-clickable-row" tabIndex=\{busy \? -1 : 0\} aria-disabled=\{busy\}/);
  assert.match(ui, /onClick=\{event => void readRuns\(flow, event.currentTarget\)\}/);
  assert.match(ui, /event.key === 'Enter' \|\| event.key === ' '/);
  assert.match(ui, /void readRuns\(flow, event.currentTarget\);/);
  assert.doesNotMatch(ui, /riggs-flow-runs-button|riggs-flow-name-button/);
});

test('inspection uses native top-layer modal, not an offscreen panel under pagination', () => {
  assert.match(ui, /import \{createPortal\} from 'react-dom'/);
  assert.match(ui, /selectedFlow && typeof document !== 'undefined' && createPortal\(/);
  assert.match(ui, /<dialog ref=\{inspectionDialogRef\}/);
  assert.match(ui, /dialog.showModal\(\)/);
  assert.match(ui, /document.body\)/);
  assert.match(css, /\.riggs-flow-inspection-dialog::backdrop/);
  assert.match(css, /height:100dvh/);
  assert.doesNotMatch(ui, /role="region" aria-label="Selected flow diagnostics"/);
});

test('modal is visible during lookup and provider failures, with retry and explicit close', () => {
  assert.match(ui, /setSelectedFlow\(flow\);[\s\S]{0,100}setRunResult\(null\);[\s\S]{0,100}setRunPhase\('loading'\)/);
  assert.match(ui, /runPhase === 'loading' && <p role="status">/);
  assert.match(ui, /runPhase === 'error' && <p role="alert">/);
  assert.match(ui, /Retry inspection/);
  assert.match(ui, /onCancel=\{event => \{event.preventDefault\(\); closeRuns\(\);\}\}/);
  assert.match(ui, /ref=\{inspectionCloseRef\} onClick=\{closeRuns\}>Close/);
  assert.match(ui, /inspectedRowRef.current = null;[\s\S]{0,40}row\?\.focus\?\.\(\)/);
});

test('selection stays a passive owner-gated GET; financial and token domains are not modified', () => {
  assert.match(ui, /\/flows\/\$\{encodeURIComponent\(flow.workflowId\)\}\/inspect/);
  assert.match(ui, /X-Riggs-Passive-Read/);
  assert.doesNotMatch(ui, /\/flows\/[^\s]*\/resubmit|deleteFlow|restartFlow|disableFlow/);
  assert.match(css, /var\(--surface\)/);
  assert.match(css, /var\(--accent\)/);
});
