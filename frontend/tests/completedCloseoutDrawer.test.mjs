import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

const source = () => readFileSync(new URL('../src/CompletedProjectBillingDrawer.jsx', import.meta.url), 'utf8');

const job = Object.freeze({
  jobListId: 222,
  jobNumber: '26677',
  jobName: 'Synthetic completed closeout',
  projectManager: 'Test PM',
  primaryEstimator: 'Test Estimator',
  purpose: 'BUILD',
  generalContractor: 'Example GC',
  cityStateZip: 'Phoenix, AZ',
  contractAmount: 100,
  contractAmountSource: 'FOUNDATION',
  foundationOriginalContractAmount: 100,
  cognitoContractAmount: 115,
  approvedChangeOrderAmount: 20,
  approvedChangeOrderCount: 2,
  foundationRevisedContractAmount: 120,
  totalContractAmount: 120,
  totalContractSource: 'FOUNDATION_REVISED',
  contractRemainingAmount: 40,
  foundationActualTotal: 80,
  actualVsTotalContractVariance: -40,
  marginCollectedTotal: 10,
  weightedHistoricalMarginPercent: 12.5,
  marginDataComplete: true,
  retention: '10%',
  retentionSource: 'FOUNDATION',
  cubicYards: 1000,
  squareFootage: 30000,
  resolvedStartDate: '2025-01-01',
  resolvedEndDate: '2025-12-31',
  resolvedDurationDays: 365,
  resolvedDurationMonthsApprox: 12,
  firstBillingActivityDate: '2025-02-01',
  lastBillingActivityDate: '2026-01-01',
  foundationBillingMonthCount: 11,
  benchmarkCurveDisplayName: 'Standard benchmark',
  estimatorEstimatedAmount: 105,
  estimatorAnticipatedStartDate: '2025-01-01',
  estimatorDurationMonths: 12,
  bidName: 'Synthetic original bid',
});

test('closeout drawer uses a report hierarchy without adding new financial math or endpoints', () => {
  const jsx = source();
  const order = [
    'completed-closeout-financial',
    'MONTHLY BILLINGS',
    'completed-closeout-timing',
    'completed-closeout-terms',
    'completed-closeout-evidence',
  ].map(part => jsx.indexOf(part));
  assert.ok(order.every(position => position >= 0));
  assert.ok(order.every((value, idx) => idx === 0 || value > order[idx - 1]));
  assert.doesNotMatch(jsx, /completed-kpi-grid|billing-meta-card|completed-drawer-meta/);
  assert.match(jsx, /<details className="completed-closeout-extra">/);
  assert.match(jsx, /<details\s+ref=\{historicalContextRef\}\s+className="completed-closeout-evidence"\s+onToggle=\{event\s*=>\s*setHistoricalContextOpen\(event\.currentTarget\.open\)\}\s*>/);
  assert.match(jsx, /moneyValue=\{project\.contractRemainingAmount\}/);
  assert.match(jsx, /moneyValue=\{project\.actualVsTotalContractVariance\}/);
  assert.match(jsx, /moneyValue=\{project\.totalContractAmount\}/);
  assert.match(jsx, /moneyValue=\{project\.foundationActualTotal\}/);
  assert.match(jsx, /<CompletedBillingProgressChart/);
  assert.match(jsx, /\/api\/completed-projects\//);
  assert.doesNotMatch(jsx, /\/api\/completed-projects\/.*\?fresh/);
});

test('closeout preserves signed variance, source evidence, authorized margin and explicit missing states', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true},
    appType: 'custom',
    logLevel: 'silent',
  });
  t.after(() => vite.close());
  const {default: Drawer} = await vite.ssrLoadModule('/src/CompletedProjectBillingDrawer.jsx');
  const render = (project, appRole) => renderToString(React.createElement(Drawer, {
    project,
    user: {appRole},
    onClose: () => {},
  })).replaceAll('<!-- -->', '');

  const admin = render(job, 'ADMIN');
  assert.match(admin, /COMPLETED PROJECT · CLOSEOUT/);
  assert.match(admin, /aria-label="Project context"/);
  assert.match(admin, /Contract reconciliation/);
  assert.match(admin, /Actual vs Total Contract/);
  assert.match(admin, /money-negative">-\$40/);
  assert.match(admin, /Additional contract measure/);
  assert.match(admin, /Supporting historical context/);
  assert.match(admin, /PROJECT LIFECYCLE/);
  assert.match(admin, /Historical Bid Estimate/);
  assert.match(admin, /Foundation Revised/);
  assert.match(admin, /Margin Collected/);
  assert.match(admin, /weighted historical margin/);
  assert.match(admin, /1,000/);
  assert.match(admin, /30,000/);
  assert.doesNotMatch(admin, /completed-kpi-grid|billing-meta-card/);

  const viewer = render(job, 'VIEWER');
  assert.match(viewer, /Actual vs Total Contract/);
  assert.match(viewer, /Supporting historical context/);
  assert.doesNotMatch(viewer, /Compare Sources/);
  assert.doesNotMatch(viewer, /Margin Collected/);
  assert.doesNotMatch(viewer, /Edit Project/);

  const fallback = render({
    ...job,
    foundationOriginalContractAmount: null,
    approvedChangeOrderAmount: null,
    approvedChangeOrderCount: null,
    foundationRevisedContractAmount: null,
    totalContractSource: 'COGNITO_FALLBACK',
    contractAmountSource: 'COGNITO',
  }, 'ADMIN');
  assert.match(fallback, /Foundation CO evidence unavailable/);
  assert.match(fallback, /Unavailable · no Foundation CO evidence/);
  assert.match(fallback, /Ops fallback/);
});
