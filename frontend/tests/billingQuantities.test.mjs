import assert from 'node:assert/strict';
import test from 'node:test';
import {billingQuantityLabel, completedQuantitySourceNote} from '../src/billingQuantities.js';

test('completed project quantity formatting matches active project numeric display', () => {
  assert.equal(billingQuantityLabel(45000), '45,000');
  assert.equal(billingQuantityLabel('1250'), '1,250');
  assert.equal(billingQuantityLabel(0), '0');
  assert.equal(billingQuantityLabel('0'), '0');
});

test('missing, invalid, and nonfinite quantities never become invented zero', () => {
  for (const value of [null, undefined, '', '   ', 'abc', false, true, NaN, Infinity, -Infinity]) {
    assert.equal(billingQuantityLabel(value), '—');
  }
});

test('quantity source note distinguishes recorded zero, absent source and missing field', () => {
  assert.equal(completedQuantitySourceNote(0, true), 'Originating bid');
  assert.equal(completedQuantitySourceNote(234, false), 'Originating bid');
  assert.equal(completedQuantitySourceNote(null, true), 'No linked originating bid');
  assert.equal(completedQuantitySourceNote(null, false), 'Not recorded on originating bid');
});
