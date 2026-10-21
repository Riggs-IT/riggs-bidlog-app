import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('completed project CY and SF are populated from existing typed bid quantity fields', () => {
  const drawer = source('CompletedProjectBillingDrawer.jsx');
  assert.match(drawer, /billingQuantityLabel\(project\.cubicYards\)/);
  assert.match(drawer, /billingQuantityLabel\(project\.squareFootage\)/);
  assert.match(drawer, /completedQuantitySourceNote\(project\.cubicYards, project\.missingEstimatorBidLink\)/);
  assert.match(drawer, /completedQuantitySourceNote\(project\.squareFootage, project\.missingEstimatorBidLink\)/);
  assert.doesNotMatch(drawer, /\bTBD\b/);
});

test('active project continues to consume originating bid detail without adding a lookup', () => {
  const drawer = source('CurrentProjectBillingDrawer.jsx');
  assert.match(drawer, /billingQuantityLabel\(\s*originatingBidDetail\.cubicYards/);
  assert.match(drawer, /billingQuantityLabel\(\s*originatingBidDetail\.squareFootage/);
  assert.doesNotMatch(drawer, /\bTBD\b/);
});

test('shared monetary compare sources excludes booleans and preserves opt-in zero', () => {
  const billing = source('BillingDisplay.jsx');
  assert.match(billing, /row\?\.money === true && typeof row\.value === 'boolean'/);
  assert.match(billing, /showZeroAmounts = false/);
  assert.match(billing, /Number\(row\.value\) === 0/);
});

test('financial source values stay directly API-sourced; no new client calculations', () => {
  const drawer = source('CompletedProjectBillingDrawer.jsx');
  for (const field of ['approvedChangeOrderAmount','foundationRevisedContractAmount','totalContractAmount','contractRemainingAmount','actualVsTotalContractVariance']) {
    assert.match(drawer, new RegExp('project\\.' + field));
  }
  assert.doesNotMatch(drawer, /foundationRevisedContractAmount\s*[+*/-]/);
});
