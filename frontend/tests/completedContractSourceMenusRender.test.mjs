import assert from 'node:assert/strict';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

const BASE_PROJECT = Object.freeze({
  jobListId: 101,
  jobNumber: '21359',
  jobName: 'Synthetic contract-source review',
  contractAmount: 0,
  contractAmountSource: 'FOUNDATION',
  foundationOriginalContractAmount: 0,
  cognitoContractAmount: 2273703,
  estimatorEstimatedAmount: 2000000,
  approvedChangeOrderAmount: 0,
  approvedChangeOrderCount: 0,
  foundationRevisedContractAmount: 0,
  totalContractAmount: 0,
  totalContractSource: 'FOUNDATION_REVISED',
  foundationActualTotal: 0,
  contractRemainingAmount: 0,
  actualVsTotalContractVariance: 0,
  marginDataComplete: false,
  retention: null,
  missingEstimatorBidLink: false,
  cubicYards: 1200,
  squareFootage: 45000,
});

test('source drawers render actual $0 and missing CO as distinct states without leaking owner comparisons', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true},
    appType: 'custom',
    logLevel: 'silent',
  });
  t.after(() => vite.close());

  const [{default: Completed}, {ComparisonDetails}] = await Promise.all([
    vite.ssrLoadModule('/src/CompletedProjectBillingDrawer.jsx'),
    vite.ssrLoadModule('/src/BillingDisplay.jsx'),
  ]);

  const render = (project, appRole) => renderToString(
    React.createElement(Completed, {
      project,
      user: {appRole},
      onClose: () => {},
    })
  ).replaceAll('<!-- -->', '');

  const validZero = render(BASE_PROJECT, 'ADMIN');
  assert.match(validZero, /Foundation Original/);
  assert.match(validZero, /Cognito Job Contract/);
  assert.match(validZero, /Approved CO Income/);
  assert.match(validZero, /Foundation Revised/);
  assert.match(validZero, /Selected Total Contract/);
  assert.match(validZero, /Foundation original is \$0/);
  assert.match(validZero, /\$2,273,703/);
  assert.match(validZero, /\$0/);
  assert.match(validZero, /1,200/);
  assert.match(validZero, /45,000/);
  assert.doesNotMatch(validZero, /\bTBD\b/);
  assert.doesNotMatch(validZero, /Unavailable · no Foundation CO evidence/);

  const missing = render({
    ...BASE_PROJECT,
    jobListId: 301,
    contractAmount: 569500,
    contractAmountSource: 'COGNITO',
    foundationOriginalContractAmount: null,
    cognitoContractAmount: 569500,
    approvedChangeOrderAmount: null,
    approvedChangeOrderCount: null,
    foundationRevisedContractAmount: null,
    totalContractAmount: 569500,
    totalContractSource: 'COGNITO_FALLBACK',
    contractRemainingAmount: 569500,
    actualVsTotalContractVariance: -569500,
    missingEstimatorBidLink: true,
    cubicYards: null,
    squareFootage: null,
  }, 'ADMIN');
  assert.match(missing, /Unavailable · no Foundation CO evidence/);
  assert.match(missing, /Unavailable · no Foundation revised contract/);
  assert.match(missing, /Cognito fallback/);
  assert.match(missing, /No linked originating bid/);
  assert.doesNotMatch(missing, /\bTBD\b/);
  assert.doesNotMatch(missing, /Foundation original is \$0/);

  const viewer = render(BASE_PROJECT, 'VIEWER');
  assert.doesNotMatch(viewer, /Compare Sources/);
  assert.doesNotMatch(viewer, /Selected Source/);
  assert.match(viewer, /Total Contract/);

  // Compare Sources default remains unchanged for non-completed consumers.
  const hiddenZero = renderToString(React.createElement(ComparisonDetails, {
    rows: [{label: 'Default zero', money: true, value: 0, display: '$0'}],
  }));
  assert.doesNotMatch(hiddenZero, /Default zero/);
  const shownZero = renderToString(React.createElement(ComparisonDetails, {
    showZeroAmounts: true,
    rows: [{label: 'Explicit zero', money: true, value: 0, display: '$0'}],
  }));
  assert.match(shownZero, /Explicit zero/);

  const nonAmounts = renderToString(React.createElement(ComparisonDetails, {
    showZeroAmounts: true,
    rows: [
      {label: 'Blank', money: true, value: ' ', display: '—'},
      {label: 'Boolean', money: true, value: false, display: '—'},
    ],
  }));
  assert.doesNotMatch(nonAmounts, /Blank|Boolean/);

  // Explicit zero quantities must not be confused with missing historical data.
  const zeroQuantities = render({...BASE_PROJECT, cubicYards: 0, squareFootage: 0}, 'ADMIN');
  assert.match(zeroQuantities, /Originating bid/);
  assert.doesNotMatch(zeroQuantities, /No linked originating bid/);
});
