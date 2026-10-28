import { readSource } from './helpers/readSource.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {facetRows, ALL_FILTER} from '../src/viewFilters.js';
import {
  isProjectManagerWorkspaceUser, normalizePmIdentity, resolveSignedInPmOption,
} from '../src/pmScope.js';

const read = filename => readSource(new URL(`../src/${filename}`, import.meta.url), 'utf8');

const pm = {eid: 2172, workspaceProfile: 'PM', displayName: '  Josh Erlandson  '};

test('only a signed-in PM resolves a default from actual selectable PM values', () => {
  assert.equal(isProjectManagerWorkspaceUser(pm), true);
  assert.equal(isProjectManagerWorkspaceUser({...pm, workspaceProfile: 'ADMIN'}), false);
  assert.equal(isProjectManagerWorkspaceUser({...pm, workspaceProfile: 'BID_LOG_ONLY'}), false);
  assert.equal(isProjectManagerWorkspaceUser({...pm, displayName: ' '}), false);
  assert.equal(resolveSignedInPmOption(pm, ['Mario Cortes', 'Josh Erlandson']), 'Josh Erlandson');
  assert.equal(resolveSignedInPmOption({...pm, workspaceProfile:'ADMIN'}, ['Josh Erlandson']), null);
  assert.equal(resolveSignedInPmOption({...pm, workspaceProfile:'BID_LOG_ONLY'}, ['Josh Erlandson']), null);
});

test('PM matching trims spaces, ignores case, but rejects fuzzy or ambiguous identities', () => {
  assert.equal(normalizePmIdentity('  JOSH  ERLANDSON  '), 'josh erlandson');
  assert.equal(resolveSignedInPmOption(pm, ['Josh']), null);
  assert.equal(resolveSignedInPmOption(pm, ['Josh Erlandson Jr']), null);
  assert.equal(resolveSignedInPmOption(pm, []), null);
  assert.equal(resolveSignedInPmOption(pm, ['JOSH ERLANDSON', 'Josh Erlandson']), null);
  assert.equal(resolveSignedInPmOption(pm, ['   jOsH  Erlandson   ']), '   jOsH  Erlandson   ');
});

test('Projected Billings seeds its existing PM selector after rows arrive, without a hidden scope', () => {
  const app = read('App.jsx');
  const css = read('styles.css');
  assert.match(app, /const pmOptions=portfolioFacets\.options\.pm;[\s\S]*?resolveSignedInPmOption\(user, pmOptions\)/);
  assert.match(app, /pmFilterDefaultRef\.current = identity;\s*setPmFilter\(initialPm\)/);
  assert.match(app, /label="PM"\s*value=\{pmFilter\}/);
  assert.match(app, /setPmFilter\(ALL\)/);
  assert.doesNotMatch(app, /onlyMyJobs|setOnlyMyJobs|restrictPortfolioToMine|projected-pm-scope-toggle/);
  assert.doesNotMatch(app, /matchesSignedInPm\(row\.pm/);
  assert.doesNotMatch(css, /\.projected-pm-scope-toggle/);
  assert.match(app, /setMonthlyComparisonOpen\(isAdmin\)/);
  assert.match(app, /className="monthly-comparison-body" hidden=\{!monthlyComparisonOpen\}/);
  assert.match(css, /\.monthly-comparison-body\[hidden\]\s*\{\s*display: none !important/);
});

test('Bid Log defaults its existing PM dropdown for every available lifecycle view', () => {
  const workspace = read('BidLogWorkspace.jsx');
  assert.match(workspace, /pmFilterDefaultedViewsRef = useRef\(new Set\(\)\)/);
  assert.match(workspace, /const viewKey = `\$\{user\.eid\}:\$\{bidView\}`/);
  assert.match(workspace, /resolveSignedInPmOption\(user, allPmOptions\)/);
  assert.match(workspace, /setPmFilter\(selectedPm\)/);
  assert.match(workspace, /<span>PM<\/span>\s*<select\s*value=\{pmFilter\}/);
  assert.doesNotMatch(workspace, /onlyMyBids|setOnlyMyBids|bid-log-pm-scope-toggle|matchesSignedInPm/);
  assert.match(workspace, /const entries=items\.filter/);
  assert.match(workspace, /pmFilter === ALL \|\| String\(row\?\.pm \|\| ''\)\.trim\(\) === pmFilter/);
  assert.match(workspace, /function clearFilters\(\) \{[\s\S]*?setPmFilter\(ALL\)/);
});

test('Bid Log gets badge colors from an independent authenticated read, never from billing only', () => {
  const workspace = read('BidLogWorkspace.jsx');
  const main = readSource(new URL('../../backend/app/main.py', import.meta.url), 'utf8');
  const client = readSource(new URL('../../backend/app/data_api.py', import.meta.url), 'utf8');
  const hook = read('useTeamBadgeDirectory.js');
  assert.match(hook, /fetch\('\/api\/bid-log\/reference\/pm-badges'/);
  assert.match(read('App.jsx'), /useTeamBadgeDirectory\(user\?\.eid, canViewBidLog\)/);
  assert.match(workspace, /\[\.\.\.pmDirectory, \.\.\.pmBadgeDirectory\]/);
  assert.match(hook, /console\.warn\('Team badge directory unavailable'/);
  assert.match(main, /def bid_log_pm_badges_proxy\([\s\S]*?_require_bid_log_workspace_access\(current_user\)/);
  assert.doesNotMatch(main.slice(main.indexOf('def bid_log_pm_badges_proxy'), main.indexOf('def bid_log_active_list_proxy')),
    /_require_projected_workspace_access|_require_bid_log_editor/);
  assert.match(client, /def get_bid_log_pm_badges\(/);
});

test('sticky header reveals controls on scroll and header hover, retaining pointer and idle guards', () => {
  const sticky = read('useStickyTableHeader.js');
  assert.match(sticky, /const handleScroll =[\s\S]*?showFloatingControls\(\)/);
  assert.match(sticky, /floatingTableViewport\.addEventListener\(\s*'pointerenter',\s*handleFloatingHeaderPointerEnter/);
  assert.match(sticky, /floatingTableViewport\.addEventListener\(\s*'pointerleave',\s*handleFloatingHeaderPointerLeave/);
  assert.match(sticky, /floatingTableViewport\.removeEventListener\(\s*'pointerenter'/);
  assert.match(sticky, /floatingHeaderPointerInside/);
  assert.match(sticky, /horizontalControlActive\s*\|\| floatingControlsPointerInside\s*\|\| floatingHeaderPointerInside/);
  assert.match(sticky, /scheduleFloatingControlsHide\(\)/);
});


test('using the existing PM facet keeps every PM choice available and All restores all rows', () => {
  const rows = [
    {pm: 'Josh Erlandson', id: 1},
    {pm: 'Mario Cortes', id: 2},
    {pm: 'Alex Costanzo', id: 3},
  ];
  const selection = resolveSignedInPmOption(pm, rows.map(row => row.pm));
  const options = {pm: {values: row => [row.pm]}};
  const mine = facetRows(rows, {pm: selection}, options);
  assert.deepEqual(mine.rows.map(row => row.id), [1]);
  assert.deepEqual(mine.options.pm, ['Alex Costanzo', 'Josh Erlandson', 'Mario Cortes']);
  const all = facetRows(rows, {pm: ALL_FILTER}, options);
  assert.deepEqual(all.rows.map(row => row.id), [1, 2, 3]);
});
