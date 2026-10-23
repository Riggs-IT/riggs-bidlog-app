import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

const fixture = () => ({
  readOnly: true,
  observedAtUTC: '2026-10-23T14:00:00Z',
  services: {
    bidLog: {state: 'AVAILABLE'}, dataApi: {state: 'AVAILABLE'}, sql: {state: 'CONNECTED'},
  },
  cache: {
    availability: 'AVAILABLE',
    refresh: {status: 'COMPLETE', completedDatasets: 6, totalDatasets: 6, failedDatasetKeys: []},
    policy: {ttlSeconds: 120, maxStaleSeconds: 600},
    datasets: [{key: 'portfolio_balance', state: 'EXPIRED', ageSeconds: 710,
      updatedAtUTC: '2026-10-23T13:30:00Z', errorType: null}],
  },
  monitoring: {
    availability: 'AVAILABLE', observedAtUTC: '2026-10-23T14:00:00Z',
    usage: {activeDefinitionSeconds: 120, eligibleForCloseout: 0},
    queues: [{laneKey: 'project_forecast', pendingCount: 0, processingCount: 1, failedCount: 3}],
    reconciliation: {enabled: true, intervalSeconds: 900, batchLimit: 50, minimumIdleMinutes: 65},
  },
  notCollected: ['Worker process liveness'],
});

test('attention links to read-only details; technical inventory is collapsed by default', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent',
  });
  t.after(async () => {await vite.close();});
  const {AdministrationView} = await vite.ssrLoadModule('/src/AdministrationDashboard.jsx');
  const html = renderToString(React.createElement(AdministrationView, {overview: fixture()}))
    .replaceAll('<!-- -->', '');
  assert.match(html, /Needs attention/);
  assert.match(html, /2 findings to review/);
  assert.match(html, /portfolio_balance|Portfolio review/);
  assert.match(html, /href="#administration-cache"/);
  assert.match(html, /href="#administration-queues"/);
  assert.match(html, /<details class="administration-section administration-optional-details">/);
  assert.match(html, /Worker process liveness/);
  assert.doesNotMatch(html, /worker stopped|worker is live/i);
});

test('attention presentation reuses light/dark theme tokens without a new fixed palette', () => {
  const css = readFileSync(new URL('../src/AdministrationDashboard.css', import.meta.url), 'utf8');
  const theme = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');
  const slice = css.split('/* First Administration cleanup slice:')[1];
  assert.ok(slice, 'expected scoped first-slice styles');
  for (const token of ['--surface', '--surface-2', '--text-strong', '--text-soft', '--border', '--accent']) {
    assert.match(slice, new RegExp(`var\\(${token}\\)`));
    assert.ok(theme.includes(`${token}:`), token);
  }
  assert.match(theme, /:root\[data-theme="dark"\]/);
  assert.doesNotMatch(slice, /#[0-9a-f]{3,8}\b/i);
});
