import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {
  completedAmount,
  completedContractSourceLabel,
  summarizeCompletedCommercial,
} from '../src/completedCommercial.js';

function row(overrides = {}) {
  return {
    jobListId: 100,
    contractAmount: 100,
    approvedChangeOrderAmount: 20,
    approvedChangeOrderCount: 2,
    totalContractAmount: 120,
    contractRemainingAmount: 40,
    actualVsTotalContractVariance: -40,
    foundationActualTotal: 80,
    estimatorEstimatedAmount: 90,
    totalContractSource: 'FOUNDATION_REVISED',
    ...overrides,
  };
}

test('completed financial cards aggregate exactly the API contract without local variance arithmetic', () => {
  const values = summarizeCompletedCommercial([row(), row({jobListId: 101, contractAmount: 200,
    approvedChangeOrderAmount: -10, approvedChangeOrderCount: 1, totalContractAmount: 190,
    foundationActualTotal: 210, contractRemainingAmount: -20, actualVsTotalContractVariance: 20,
  })]);
  assert.equal(values.total, 2);
  assert.equal(values.originalContract, 300);
  assert.equal(values.approvedChangeOrders, 10);
  assert.equal(values.approvedChangeOrderCount, 3);
  assert.equal(values.totalContract, 310);
  assert.equal(values.actualBillings, 290);
  assert.equal(values.contractRemaining, 20);
  assert.equal(values.actualVsTotalContract, -20);
  assert.equal(values.historicalEstimates, 2);
});

test('cards use the selected filtered projects, not the full portfolio', () => {
  const all = [row(), row({jobListId: 101, totalContractAmount: 999})];
  const filtered = all.filter(x => x.jobListId === 100);
  assert.equal(summarizeCompletedCommercial(filtered).totalContract, 120);
  assert.equal(summarizeCompletedCommercial(all).totalContract, 1119);
});

test('Cognito fallback keeps missing CO history unknown, while real zero stays zero', () => {
  const rows = [row({jobListId: 2, approvedChangeOrderAmount: null,
    approvedChangeOrderCount: null, totalContractSource: 'COGNITO_FALLBACK'}),
    row({jobListId: 3, approvedChangeOrderAmount: 0, approvedChangeOrderCount: 0})];
  const totals = summarizeCompletedCommercial(rows);
  assert.equal(totals.missingApprovedChangeOrderEvidence, 1);
  assert.equal(totals.approvedChangeOrders, 0);
  assert.equal(totals.approvedChangeOrderCount, 0);
  assert.equal(completedAmount(null), null);
  assert.equal(completedAmount(0), 0);
  assert.match(completedContractSourceLabel('COGNITO_FALLBACK'), /unavailable/);
});

test('missing revised contract or variance never displays a misleading partial total', () => {
  const totals = summarizeCompletedCommercial([row(), row({jobListId: 3,
    totalContractAmount: null, contractRemainingAmount: null, actualVsTotalContractVariance: null})]);
  assert.equal(totals.totalContract, null);
  assert.equal(totals.contractRemaining, null);
  assert.equal(totals.actualVsTotalContract, null);
  assert.equal(totals.missingTotalContracts, 1);
});

test('no row or source objects are mutated', () => {
  const original = Object.freeze(row());
  const before = {...original};
  summarizeCompletedCommercial([original]);
  assert.deepEqual(original, before);
});

test('Completed Billings table and drawer must render the new API fields directly', () => {
  const table = readFileSync(new URL('../src/ProjectAccountability.jsx', import.meta.url), 'utf8');
  const drawer = readFileSync(new URL('../src/CompletedProjectBillingDrawer.jsx', import.meta.url), 'utf8');
  assert.match(table, /summarizeCompletedCommercial\(filteredRows\)/);
  assert.match(table, /row\.totalContractAmount/);
  assert.match(table, /row\.actualVsTotalContractVariance/);
  assert.match(drawer, /project\.approvedChangeOrderAmount/);
  assert.match(drawer, /project\.totalContractAmount/);
  assert.match(drawer, /project\.contractRemainingAmount/);
  assert.match(drawer, /project\.actualVsTotalContractVariance/);
  assert.doesNotMatch(drawer, /value="TBD"/);
  assert.match(table, /retentionLabel\(\s*row\.retention,\s*'Not recorded'\s*\)/);
  assert.doesNotMatch(table, /row\.contractVsActualVariance/);
});
