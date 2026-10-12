import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {canStartWithMyJobs, matchesSignedInPm, normalizePmIdentity} from '../src/pmScope.js';

const read = filename => readFileSync(new URL(`../src/${filename}`, import.meta.url), 'utf8');

test('only authenticated PM workspace users start in My Jobs', () => {
  assert.equal(canStartWithMyJobs({workspaceProfile:'PM', displayName:'Alex Costanzo'}), true);
  assert.equal(canStartWithMyJobs({workspaceProfile:'pm', displayName:'Alex Costanzo'}), true);
  assert.equal(canStartWithMyJobs({workspaceProfile:'ADMIN', displayName:'Alex Costanzo'}), false);
  assert.equal(canStartWithMyJobs({workspaceProfile:'BID_LOG_ONLY', displayName:'Alex Costanzo'}), false);
  assert.equal(canStartWithMyJobs({workspaceProfile:'PM', displayName:'  '}), false);
});

test('PM matching is case/spacing normalizing but never fuzzy', () => {
  assert.equal(normalizePmIdentity('  ALEX  COSTANZO '), 'alex costanzo');
  assert.equal(matchesSignedInPm('  Alex  Costanzo ', 'alex costanzo'), true);
  assert.equal(matchesSignedInPm('Alex', 'Alex Costanzo'), false);
  assert.equal(matchesSignedInPm('Alex Costanzo Jr', 'Alex Costanzo'), false);
  assert.equal(matchesSignedInPm(null, 'Alex Costanzo'), false);
  assert.equal(matchesSignedInPm('Alex Costanzo', null), false);
});

test('Projected Billings has default collapsed full comparison, plus PM scoping before metrics and exports', () => {
  const app = read('App.jsx');
  const css = read('styles.css');
  assert.match(app, /setMonthlyComparisonOpen,\s*\]\s*= useState\(false\)/);
  assert.match(app, /setMonthlyComparisonOpen\(isAdmin\)/);
  assert.match(app, /\[user\?\.eid, isAdmin\]/);
  assert.match(app, /className="monthly-comparison-body" hidden=\{!monthlyComparisonOpen\}/);
  assert.match(css, /\.monthly-comparison-body\[hidden\]\s*\{\s*display: none !important/);
  assert.doesNotMatch(css, /\.monthly-comparison-collapsed\s*\.monthly-table-wrap/);
  assert.match(app, /monthlyComparisonOpen && <div\s*className="comparison-view-toggle"/);
  assert.match(app, /restrictPortfolioToMine \|\| matchesSignedInPm\(row\.pm, user\?\.displayName\)/);
  assert.match(app, /role="group" aria-label="Project manager job scope"/);
  assert.match(app, /\bscopedPotentialBidCount\b/);
});

test('Bid Log PM scope covers active and historical lifecycle tabs, without changing authorization', () => {
  const bidlog = read('BidLogWorkspace.jsx');
  assert.match(bidlog, /const scopedItems = useMemo\(\(\) => onlyMyBids/);
  assert.match(bidlog, /const entries=scopedItems\.filter/);
  assert.match(bidlog, /active: scopedItems\.length/);
  assert.match(bidlog, /aria-label="Bid Log project manager scope"/);
  assert.match(bidlog, /setPmFilter\(ALL\); setOnlyMyBids\(false\)/);
});
