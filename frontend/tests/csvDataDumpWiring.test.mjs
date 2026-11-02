import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const read = filename => readFileSync(new URL(`../src/${filename}`, import.meta.url),'utf8');

test('all four table workspaces expose Export CSV without adding API export endpoints', () => {
  const app = read('App.jsx');
  const bid = read('BidLogWorkspace.jsx');
  const projects = read('ActiveProjectsWorkspace.jsx');
  const completed = read('ProjectAccountability.jsx');
  const monthly = read('CompletedMonthlyHistory.jsx');
  const pivot = read('ProjectBillingPivot.jsx');
  assert.match(app, /className="secondary-button projected-export-button"/);
  assert.match(app, /import \{downloadCsv\} from '\.\/csvExport\.js'/);
  assert.match(bid, /buildBidLogDataDump\(filteredItems, \{canSeeMargin\}\)/);
  assert.match(bid, /className="secondary-button projected-export-button"/);
  assert.match(projects, /buildProjectDirectoryDataDump\(filteredItems/);
  assert.match(projects, /className="secondary-button projected-export-button"/);
  assert.match(completed, /buildCompletedDirectoryDataDump\(sortedRows/);
  assert.match(completed, /className="secondary-button projected-export-button"/);
  assert.match(monthly, /exportCsv:\s*\(\)\s*=>/);
  assert.match(monthly, /buildCompletedHistoryDataDump\(/);
  assert.match(pivot, /value: String\(bid\.projectType\)\.trim\(\)/);
  assert.doesNotMatch(pivot, /label: 'Type'/);
});

test('Bid Log export uses complete filter result, not virtualized/rendered slice', () => {
  const src = read('BidLogWorkspace.jsx');
  const section = src.match(/function exportFilteredBidLog\(\)\s*\{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(section, /filteredItems/);
  assert.doesNotMatch(section, /buildBidLogDataDump\(visibleItems/);
  assert.match(src, /Number\(payload\?\.total \?\? 0\) > items\.length/);
});



test('filter toolbar placement and Active Projects naming stay consistent', () => {
  const app = read('App.jsx');
  const bid = read('BidLogWorkspace.jsx');
  const projects = read('ActiveProjectsWorkspace.jsx');
  const completed = read('ProjectAccountability.jsx');
  const pivot = read('ProjectBillingPivot.jsx');
  const css = read('styles/07-detail-layout-and-filters.css');

  const toolbarContent = (source, className, until) => {
    const start = source.indexOf(`<div className="${className}">`);
    assert.ok(start >= 0, `${className} missing`);
    return source.slice(start, source.indexOf(until, start));
  };
  const bidActions = toolbarContent(bid, 'bid-log-filter-actions', 'Clear Filters');
  assert.ok(bidActions.indexOf('Export CSV') >= 0);
  assert.ok(bidActions.indexOf('Export CSV') < bidActions.indexOf('onClick={clearFilters}'));
  const projectActions = toolbarContent(projects, 'active-project-filter-actions', 'Clear Filters');
  assert.ok(projectActions.indexOf('Export CSV') >= 0);
  assert.ok(projectActions.indexOf('Export CSV') < projectActions.indexOf('onClick={clearFilters}'));
  const completedActions = toolbarContent(completed, 'completed-filter-reset', "'More Filters'");
  assert.ok(completedActions.indexOf('Export CSV') >= 0);
  assert.ok(completedActions.indexOf('Export CSV') < completedActions.indexOf('setShowMoreFilters('));

  const projectedActions = toolbarContent(app, 'filter-actions', "'More Filters'");
  assert.ok(projectedActions.includes('Export CSV'));
  assert.ok(projectedActions.indexOf('Export CSV') < projectedActions.indexOf('setShowMoreFilters('));
  const projectedHeading = app.slice(
    app.indexOf('<div className="projected-heading-controls">'),
    app.indexOf('{dataError && (', app.indexOf('<div className="projected-heading-controls">')),
  );
  assert.doesNotMatch(projectedHeading, /Export CSV/);
  assert.match(read('styles/12-table-teams-and-zebra.css'), /\.projected-filter-panel \.filter-actions \.projected-export-button \{\s*width: auto;/);

  assert.match(projects, /<h1>Active Projects<\/h1>/);
  assert.match(app, /Active Projects\s*<\/button>/);
  assert.match(app, /return 'Active Projects';/);
  assert.match(pivot, /className="pivot-project-context-separator"/);
  assert.doesNotMatch(pivot, /label: 'Type'/);
  assert.match(css, /\.completed-filter-reset \.projected-export-button \{\s*width: auto;/);
});
