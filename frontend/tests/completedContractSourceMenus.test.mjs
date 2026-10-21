import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const read = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

// Read-only source-contract tests run even without local React dependencies.
test('Compare Sources retains default zero suppression but allows explicit money zero', () => {
  const display = read('BillingDisplay.jsx');
  assert.match(display, /showZeroAmounts = false/);
  assert.match(display, /showZeroAmounts\s*&& row\?\.money === true/);
  assert.match(display, /row\.value !== null/);
  assert.match(display, /row\.value !== undefined/);
  assert.match(display, /String\(row\.value\)\.trim\(\) !== ''/);
  assert.match(display, /typeof row\.value !== 'boolean'/);
  assert.match(display, /Number\.isFinite\(Number\(row\.value\)\)/);
  assert.match(display, /Number\(row\.value\) === 0/);
});

test('completed project Compare Sources uses distinct original and revised API measures', () => {
  const drawer = read('CompletedProjectBillingDrawer.jsx');
  assert.match(drawer, /label: 'Foundation Original'/);
  assert.match(drawer, /label: 'Approved CO Income'/);
  assert.match(drawer, /value: project\.approvedChangeOrderAmount/);
  assert.match(drawer, /label: 'Foundation Revised'/);
  assert.match(drawer, /value: project\.foundationRevisedContractAmount/);
  assert.match(drawer, /label: 'Selected Total Contract'/);
  assert.match(drawer, /value: project\.totalContractAmount/);
  assert.match(drawer, /label: 'Selected Source'/);
  assert.match(drawer, /completedContractSourceLabel\(project\.totalContractSource\)/);
  assert.match(drawer, /Unavailable · no Foundation CO evidence/);
  assert.match(drawer, /Unavailable · no Foundation revised contract/);
  assert.match(drawer, /Foundation original is \$0 · verify against Cognito/);
  assert.match(drawer, /isAdmin && zeroOriginalWithCognito/);
  assert.match(drawer, /completedAmount\(project\.foundationOriginalContractAmount\) === 0/);
  assert.match(drawer, /showZeroAmounts/g);
});

test('active project original source menu names its original source explicitly', () => {
  const drawer = read('CurrentProjectBillingDrawer.jsx');
  assert.match(drawer, /'Foundation Original'/);
  assert.match(drawer, /'Foundation Original vs Cognito'/);
  assert.match(drawer, /'Foundation Original vs Projection'/);
  assert.match(drawer, /showZeroAmounts/);
});

test('all original and revised amounts remain read-only API-sourced values', () => {
  const drawer = read('CompletedProjectBillingDrawer.jsx');
  assert.doesNotMatch(drawer, /foundationRevisedContractAmount\s*[+\-*\/]/);
  assert.doesNotMatch(drawer, /approvedChangeOrderAmount\s*[+\-*\/]/);
  assert.doesNotMatch(drawer, /totalContractAmount\s*[+\-*\/]/);
  assert.match(drawer, /moneyValue=\{project\.actualVsTotalContractVariance\}/);
  assert.match(drawer, /moneyValue=\{project\.contractRemainingAmount\}/);
});
