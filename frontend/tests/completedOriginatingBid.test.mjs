import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const readBackend = (name) => readFileSync(new URL(`../../backend/app/${name}`, import.meta.url), 'utf8');

test('completed Total Contract has no repeated info icon, retains hover evidence', () => {
  const page = read('ProjectAccountability.jsx');
  assert.doesNotMatch(page, /completed-contract-info-mark|ⓘ/);
  assert.match(page, /title=\{completedContractTooltip\(row/);
  assert.match(page, /tooltip=\{completedPortfolioContractTooltip\(metrics\)\}/);
});

test('completed historical context has the existing originating-bid finder and lazy read', () => {
  const drawer = read('CompletedProjectBillingDrawer.jsx');
  const panel = read('OriginatingBidPanel.jsx');
  assert.match(drawer, /historicalContextOpen && \(/);
  assert.match(drawer, /<OriginatingBidPanel[\s\S]*?projectKind="completed"[\s\S]*?onLinked=\{onBidLinked\}/);
  assert.match(panel, /projectKind = 'current'/);
  assert.match(panel, /apiCollection = projectKind === 'completed'/);
  assert.match(panel, /\/api\/' \+ apiCollection \+ '\/'/);
  assert.match(panel, /projectKind === 'completed' \? 'View bid details' : 'ⓘ'/);
  assert.match(panel, /contractLabel=\{projectKind === 'completed'/);
  assert.match(panel, /projectKind !== 'completed' && \(/);
  assert.match(panel, /Suggestions are evidence only/);
  assert.match(panel, /confirmLink\(/);
  assert.match(panel, /selectedCandidate\.originalBidLogId/);
  assert.match(drawer, /onToggle=\{event => setHistoricalContextOpen\(event\.currentTarget\.open\)\}/);
});

test('completed viewers can read, never search/write bid links; server enforces authenticated actor', () => {
  const main = readBackend('main.py');
  const bff = readBackend('data_api.py');
  const panel = read('OriginatingBidPanel.jsx');
  assert.match(panel, /projectKind === 'completed'[\s\S]*?role === 'ADMIN' \|\| role === 'MANAGEMENT_ADMIN'/);
  for (const path of [
    '/api/completed-projects/{job_list_id}/originating-bid',
    '/api/completed-projects/{job_list_id}/bid-candidates',
  ]) assert.ok(main.includes(path));
  assert.match(main, /def completed_originating_bid_proxy\([\s\S]*?_require_completed_workspace_access\(current_user\)/);
  assert.match(main, /def completed_bid_candidates_proxy\([\s\S]*?_require_completed_workspace_access\(current_user\)[\s\S]*?_require_bid_link_editor\(current_user\)/);
  assert.match(main, /async def completed_link_originating_bid_proxy\([\s\S]*?_require_completed_workspace_access\(current_user\)[\s\S]*?_require_bid_link_editor\(current_user\)/);
  assert.match(main, /link_completed_project_originating_bid\([\s\S]*?actor_eid=current_user\.eid/);
  assert.match(bff, /_dashboard_cache_invalidate_key\("completed_projects"\)/);
  assert.match(bff, /def get_completed_project_originating_bid\(/);
});

test('link success refreshes completed detail without reloading its monthly timeline', () => {
  const drawer = read('CompletedProjectBillingDrawer.jsx');
  const page = read('ProjectAccountability.jsx');
  assert.match(page, /onBidLinked=\{\(\) => \{[\s\S]*?invalidateCompletedProjectCache\(\);[\s\S]*?loadCompletedProjects\(\{forceRefresh: true, updateSelectedProject: true\}\)/);
  assert.match(page, /updateSelectedProject[\s\S]*?setSelectedProject\(current => current/);
  assert.match(page, /key=\{selectedProject\?\.jobListId \?\? 'closed'\}/);
  assert.match(drawer, /\}, \[\s*project\?\.jobListId,\s*\]\);/);
});
