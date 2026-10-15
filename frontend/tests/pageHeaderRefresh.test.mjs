import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

test('every main workspace shows refresh in the same topbar and nowhere in the filter toolbar', () => {
  const app = src('App.jsx');
  const topbar = app.slice(app.indexOf('<div className="topbar-actions">'),
    app.indexOf('<div\n            ref={notificationCenterRef}', app.indexOf('<div className="topbar-actions">')));
  for (const label of ['Refresh projected billings', 'Refresh bids', 'Refresh projects', 'Refresh completed billings']) {
    assert.ok(topbar.includes(label), `${label} is missing from the header`);
  }
  assert.doesNotMatch(src('BidLogWorkspace.jsx'), /<RefreshButton/);
  assert.doesNotMatch(src('ActiveProjectsWorkspace.jsx'), /<RefreshButton/);
  assert.match(app, /refreshApiRef=\{bidLogRefreshRef\}/);
  assert.match(app, /refreshApiRef=\{projectsRefreshRef\}/);
  assert.match(app, /refreshApiRef=\{completedRefreshRef\}/);
  assert.match(app, /activeRefreshPagesRef\.current\.has\(page\)/);
});

test('each header button delegates to its existing page reader without affecting the others', () => {
  const bid = src('BidLogWorkspace.jsx');
  const projects = src('ActiveProjectsWorkspace.jsx');
  const completed = src('ProjectAccountability.jsx');
  assert.match(bid, /useImperativeHandle\(refreshApiRef/);
  assert.match(bid, /await refreshCurrentBidView\(\)/);
  assert.match(projects, /useImperativeHandle\(refreshApiRef/);
  assert.match(projects, /loadProjects\(\{ quiet: false \}\)/);
  assert.match(projects, /showCompleted \? \[loadCompletedProjects/);
  assert.match(completed, /useImperativeHandle\(refreshApiRef/);
  assert.match(completed, /refresh: \(\) => loadCompletedProjects\(\{ forceRefresh: true \}\)/);
  assert.match(completed, /generation === completedLoadGenerationRef\.current/);
});

test('no timer, technical cache note, or header hover tooltip is displayed', () => {
  const app = src('App.jsx');
  const hook = src('useProjectedBillingsFreshness.js');
  const controls = src('ViewControls.jsx');
  assert.doesNotMatch(app, /dashboard-cache-warning|Retry-After|Try again in [^\n]*seconds/);
  assert.doesNotMatch(hook, /Try again in [^\n]*seconds/);
  assert.match(app, /label="Refresh projected billings"[^]*?title=\{null\}/);
  assert.match(controls, /title === null \? undefined/);
  assert.match(app, /Some data may be out of date/); // only on genuine stale/failed entries
});
