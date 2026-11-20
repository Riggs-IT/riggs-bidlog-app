import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isValidAwardQuantity} from '../src/bidLogAwardQuantity.mjs';

const editor = readFileSync(new URL('../src/BidLogEditDrawer.jsx', import.meta.url), 'utf8');

test('Awarded quantities require finite, nonnegative numbers; zero is valid', () => {
  for (const value of [0, '0', '0.00', '1', '1.25', '1,234.50', 980]) {
    assert.equal(isValidAwardQuantity(value), true, String(value));
  }
  for (const value of [null, undefined, '', '   ', -1, '-0.1', 'NaN', 'Infinity', 1e309, 'hello']) {
    assert.equal(isValidAwardQuantity(value), false, String(value));
  }
});

test('UI enforces SF/CY before Award click, with live feedback', () => {
  assert.match(editor, /key: 'squareFootage'.*isValidAwardQuantity\(form\?\.squareFootage\)/);
  assert.match(editor, /key: 'cubicYards'.*isValidAwardQuantity\(form\?\.cubicYards\)/);
  assert.match(editor, /const missingAwardFields = selectedLifecycleAction === 'Awarded'/);
  assert.match(editor, /selectedLifecycleAction === 'Awarded' && missingAwardFields.length > 0/);
  assert.match(editor, /fieldKey="squareFootage" invalid=\{visibleRequiredFields.includes\('squareFootage'\)\}/);
  assert.match(editor, /fieldKey="cubicYards" invalid=\{visibleRequiredFields.includes\('cubicYards'\)\}/);
});

test('click does not forward React event as skipLifecycleConfirm', () => {
  assert.doesNotMatch(editor, /onClick=\{save\}/);
  assert.match(editor, /onClick=\{\(\) => \{ void save\(\); \}\}/);
  assert.match(editor, /if \(lifecycleAction && lifecycleAction !== 'Awarded' && !skipLifecycleConfirm\)/);
  assert.match(editor, /if \(kind === 'lifecycle'\)/);
});
