import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {facetRows} from '../src/viewFilters.js';
import {NEEDS_REBALANCE, PENDING_FOUNDATION} from '../src/portfolioBalance.js';
import {
  BALANCE_REVIEW_FILTER, balanceReviewFacetValues, createBalanceBadgeInteractions,
  isBalanceReviewFilter, matchesBalanceReviewFacet, quickFilterForStatus,
  safeReviewStatus, toggleExclusiveBalanceReview,
} from '../src/balanceReviewQuickFilter.js';

const ALL = '__ALL__';
const current = (jobListId, status, source = 'VERIFIED_SERVER') => ({
  kind: 'current', row: {
    jobListId, hasPmForecast: true, needsRebalance: true,
    reviewStatus: status, reviewStatusSource: source, pm: 'Alex',
  },
});
const entries = [
  current(1, PENDING_FOUNDATION),
  current(2, NEEDS_REBALANCE),
  current(3, PENDING_FOUNDATION, 'SQL_REBALANCE_FALLBACK'),
  {kind: 'current', row: {jobListId: 4, hasPmForecast: false, needsRebalance: false, pm: 'Alex'}},
  {kind: 'bid', row: {sharePointItemId: 8, pm: 'Alex'}},
];
const projectionDescriptor = {
  values: entry => entry.kind === 'current'
    ? [entry.row.hasPmForecast ? 'pm' : 'missing', ...balanceReviewFacetValues(entry.row)] : [],
  matches: (entry, value) => entry.kind !== 'current'
    ? !isBalanceReviewFilter(value)
    : isBalanceReviewFilter(value)
      ? matchesBalanceReviewFacet(entry.row, value)
      : value === 'pm' ? entry.row.hasPmForecast : !entry.row.hasPmForecast,
};
const descriptors = {
  pm: {values: e => [e.row.pm]},
  projectionSource: projectionDescriptor,
};

function ids(selection, pm = 'Alex') {
  const result = facetRows(entries, {pm, projectionSource: selection}, descriptors);
  return {
    selection: result.selections.projectionSource,
    ids: result.rows.map(entry => entry.row.jobListId ?? `bid-${entry.row.sharePointItemId}`),
    pmOptions: result.options.pm,
  };
}

test('one existing facet cycles pending -> all, needs -> all, and switches directly', () => {
  assert.equal(toggleExclusiveBalanceReview(ALL, PENDING_FOUNDATION), BALANCE_REVIEW_FILTER.PENDING_ONLY);
  assert.equal(toggleExclusiveBalanceReview(BALANCE_REVIEW_FILTER.PENDING_ONLY, PENDING_FOUNDATION), ALL);
  assert.equal(toggleExclusiveBalanceReview(ALL, NEEDS_REBALANCE), BALANCE_REVIEW_FILTER.NEEDS_ONLY);
  assert.equal(toggleExclusiveBalanceReview(BALANCE_REVIEW_FILTER.NEEDS_ONLY, NEEDS_REBALANCE), ALL);
  assert.equal(toggleExclusiveBalanceReview(BALANCE_REVIEW_FILTER.PENDING_ONLY, NEEDS_REBALANCE), BALANCE_REVIEW_FILTER.NEEDS_ONLY);
  assert.equal(toggleExclusiveBalanceReview(BALANCE_REVIEW_FILTER.NEEDS_ONLY, PENDING_FOUNDATION), BALANCE_REVIEW_FILTER.PENDING_ONLY);
  assert.equal(toggleExclusiveBalanceReview('pm', 'BOGUS'), 'pm');
  assert.equal(quickFilterForStatus(null), null);
});

test('existing combined button still selects both statuses, excluding bids and nonissues', () => {
  assert.deepEqual(ids('rebalance').ids, [1, 2, 3]);
  assert.deepEqual(ids(ALL).ids, [1, 2, 3, 4, 'bid-8']);
  assert.deepEqual(ids('pm').ids, [1, 2, 3, 'bid-8']);
  assert.deepEqual(ids('missing').ids, [4, 'bid-8']);
});

test('exclusive filtering follows accepted API state and never promotes an unverified Pending label', () => {
  assert.deepEqual(ids(BALANCE_REVIEW_FILTER.PENDING_ONLY).ids, [1]);
  assert.deepEqual(ids(BALANCE_REVIEW_FILTER.NEEDS_ONLY).ids, [2, 3]);
  assert.equal(safeReviewStatus(entries[2].row), NEEDS_REBALANCE);
  assert.deepEqual(balanceReviewFacetValues(entries[2].row), ['rebalance', 'rebalance-needs']);
  assert.deepEqual(ids(BALANCE_REVIEW_FILTER.PENDING_ONLY).pmOptions, ['Alex']);
  assert.equal(ids(BALANCE_REVIEW_FILTER.NEEDS_ONLY).selection, BALANCE_REVIEW_FILTER.NEEDS_ONLY);
});

test('existing other facets continue to intersect without hidden job scope', () => {
  const modified = entries.map(entry => ({...entry, row: {...entry.row,
    pm: entry.row.jobListId === 1 ? 'Mario' : 'Alex'}}));
  const result = facetRows(modified, {
    pm: 'Alex', projectionSource: BALANCE_REVIEW_FILTER.NEEDS_ONLY,
  }, descriptors);
  assert.deepEqual(result.rows.map(e => e.row.jobListId), [2, 3]);
  assert.deepEqual(result.options.pm, ['Alex']); // Other facets remain constrained by the selected review class.
  const pending = facetRows(modified, {
    pm: 'Mario', projectionSource: BALANCE_REVIEW_FILTER.PENDING_ONLY,
  }, descriptors);
  assert.deepEqual(pending.rows.map(e => e.row.jobListId), [1]);
});

test('unknown/busy SQL classification conservatively stays Needs Rebalance', () => {
  for (const review of [null, {},
    {needsRebalance: true, reviewStatus: PENDING_FOUNDATION, reviewStatusSource: 'SQL_REBALANCE_FALLBACK'},
    {needsRebalance: true, reviewStatus: undefined},
  ]) assert.equal(safeReviewStatus(review), NEEDS_REBALANCE);
  assert.equal(matchesBalanceReviewFacet({needsRebalance: true, reviewStatus: undefined}, 'rebalance-pending'), false);
  assert.equal(matchesBalanceReviewFacet({needsRebalance: true, reviewStatus: undefined}, 'rebalance-needs'), true);
  assert.equal(matchesBalanceReviewFacet({needsRebalance: false, reviewStatus: NEEDS_REBALANCE}, 'rebalance-needs'), false);
});

test('badge single click keeps navigation, delayed only on badge, never double-click flicker', () => {
  const jobs = new Map(); let nextId = 0, opened = 0, isolated = 0;
  const controller = createBalanceBadgeInteractions({
    onOpen: () => opened++, onIsolate: () => isolated++,
    schedule: callback => {const id = ++nextId; jobs.set(id,callback); return id;},
    cancel: id => jobs.delete(id),
  });
  const event = (detail = 1) => ({detail, stopped: false, prevented: false,
    stopPropagation() {this.stopped = true;}, preventDefault() {this.prevented = true;}});
  const first = event();
  controller.click(first);
  assert.equal(first.stopped, true);
  assert.equal(opened, 0);
  const second = event(2);
  controller.click(second);
  controller.doubleClick(second);
  assert.equal(second.stopped, true);
  assert.equal(second.prevented, true);
  assert.equal(isolated, 1);
  assert.equal(jobs.size, 0);
  assert.equal(opened, 0);
  controller.click(event());
  for (const [id, callback] of jobs) {jobs.delete(id); callback();}
  assert.equal(opened, 1);
  controller.dispose();
});

test('keyboard Enter/Space isolate without triggering the project-row action', () => {
  let opened = 0, isolated = 0;
  const controller = createBalanceBadgeInteractions({
    onOpen: () => opened++, onIsolate: () => isolated++,
  });
  const trigger = key => ({key, blocked: false, stopped: false,
    preventDefault(){this.blocked = true;}, stopPropagation(){this.stopped = true;}});
  for (const key of ['Enter', ' ']) {
    const event = trigger(key);
    controller.keyDown(event);
    assert.equal(event.blocked, true);
    assert.equal(event.stopped, true);
  }
  const arrow = trigger('ArrowDown');
  controller.keyDown(arrow);
  assert.equal(arrow.blocked, false);
  assert.equal(arrow.stopped, false);
  assert.equal(isolated, 2);
  assert.equal(opened, 0);
  controller.dispose();
});
