import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';

const fixture = {
  readOnly: true,
  observedAtUTC: '2026-10-15T16:30:00Z',
  services: {
    bidLog: {state: 'AVAILABLE', appVersion: '0.1.0', cloudRunRevision: null},
    dataApi: {state: 'AVAILABLE'}, sql: {state: 'CONNECTED'},
  },
  cache: {
    availability: 'AVAILABLE',
    refresh: {
      runId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      status: 'RUNNING', completedDatasets: 4, totalDatasets: 6,
      startedAtUTC: '2026-10-15T16:28:00Z', finishedAtUTC: null,
      failedDatasetKeys: [],
    },
    policy: {ttlSeconds: 120, maxStaleSeconds: 601, manualCooldownSeconds: 90, perUserCooldownSeconds: 180},
    datasets: ['current_project_summary', 'current_project_monthly_bulk',
      'current_project_primary_projection', 'active_bid_dashboard',
      'portfolio_balance', 'schedule_review'].map((key, i) => ({
        key, state: i < 4 ? 'FRESH' : 'STALE',
        ageSeconds: i < 4 ? 4.8 : 135,
        updatedAtUTC: '2026-10-15T16:27:00Z', errorType: null,
      })),
  },
  notCollected: ['Worker process health', 'Cache hit/miss history'],
};

test('Administration status renders real sampled fields with stale and unknown not zero', async t => {
  const vite = await createServer({
    root: fileURLToPath(new URL('../', import.meta.url)),
    server: {middlewareMode: true}, appType: 'custom', logLevel: 'silent',
  });
  t.after(async () => {await vite.close();});
  const {AdministrationView} = await vite.ssrLoadModule('/src/AdministrationDashboard.jsx');
  const html = renderToString(React.createElement(AdministrationView, {overview: fixture}));
  for (const marker of ['System health', 'Shared dashboard cache', 'STALE', 'RUNNING',
    '601 sec', 'Worker process health', 'Not connected', 'Not recorded']) {
    assert.ok(html.includes(marker), marker);
  }
  assert.doesNotMatch(html, /sql passwords|secret token/i);

  const unhealthy = structuredClone(fixture);
  unhealthy.services.sql = {state: 'UNVERIFIED'};
  unhealthy.cache = {availability: 'UNAVAILABLE', reasonCode: 'UPSTREAM_UNAVAILABLE'};
  const failed = renderToString(React.createElement(AdministrationView, {overview: unhealthy}));
  assert.match(failed, /UNVERIFIED/);
  assert.match(failed, /Cache status could not be verified/);
  assert.doesNotMatch(failed, /Datasets completed/);
});

test('Administration nav respects exact capability and never calls refresh POST', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../src/AdministrationDashboard.jsx', import.meta.url), 'utf8');
  const backend = readFileSync(new URL('../../backend/app/main.py', import.meta.url), 'utf8');
  assert.match(app, /const canViewAdministration = user\?\.canViewAdministration === true/);
  assert.match(app, /\{canViewAdministration && \(/);
  assert.match(app, /activePage === 'administration'\s*&& canViewAdministration/);
  assert.match(dashboard, /fetch\('\/api\/admin\/overview'/);
  assert.match(dashboard, /method: 'GET'/);
  assert.doesNotMatch(dashboard, /POST|\/dashboard-cache\/refresh|isAdmin|appRole/);
  assert.match(backend, /Depends\(require_administration_owner\)/);
});
