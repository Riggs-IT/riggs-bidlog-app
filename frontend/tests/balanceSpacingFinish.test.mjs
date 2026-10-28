import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readSource} from './helpers/readSource.mjs';
const file = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const pivot = file('styles/05-project-pivot.css');
const balance = file('styles/15-balance-presentation.css');
const meta = file('ProjectBillingPivot.jsx').split('function ProjectMeta(')[1].split('function ProjectValuesCell')[0];
const uncomment = text => text.replace(/\/\*[\s\S]*?\*\//g, '');

test('review stack is beside the title/team rows, not inside the title flex row', () => {
  const title = meta.indexOf('className="pivot-project-name-line"');
  const close = meta.indexOf('</div>', title);
  const stack = meta.indexOf('className="balance-review-status-stack"');
  assert.ok(title >= 0 && close > title && stack > close);
  assert.ok(stack < meta.indexOf('<ProjectTeamBadges'));
  assert.equal((meta.match(/className="balance-review-status-stack"/g) || []).length, 1);
});

test('moving the stack preserves eligibility and existing review callbacks', () => {
  assert.match(meta, /row\.source === 'current' && row\.raw\?\.needsRebalance && !isCompleted\(row\.raw\)/);
  for (const prop of ['onClick={onOpenBalanceReview}', 'onQuickFilter={onBalanceReviewQuickFilter}', 'selectedQuickFilter={selectedQuickFilter}']) assert.ok(meta.includes(prop));
  assert.match(meta, /<ForecastBalanceFlag review=\{row\.raw\}/);
  assert.match(meta, /<BalanceReviewAmount review=\{row\.raw\}/);
  assert.match(meta, /<ScheduleReviewFlag review=\{row\.raw\?\.scheduleReview\}/);
  assert.ok(meta.indexOf('<ForecastBalanceFlag') < meta.indexOf('<ScheduleReviewFlag'));
  assert.ok(meta.indexOf('className="pivot-project-statuses"') < meta.indexOf('<ForecastBalanceFlag'));
});

test('only visible review badges introduce the second grid column', () => {
  assert.match(pivot, /\.pivot-project-info:has\(> \.pivot-project-statuses :is\(\.needs-rebalance-flag, \.schedule-review-flag\)\)\s*\{\s*grid-template-columns: minmax\(0, 1fr\) max-content;\s*column-gap: 6px;/);
  assert.match(pivot, /\.pivot-project-statuses > \.balance-review-status-stack:empty\s*\{\s*display: none;/);
});

test('review spans both rows in flow without absolute positioning or negative offsets', () => {
  const rule = pivot.match(/\.pivot-project-statuses\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /grid-column: 2;/);
  assert.match(rule, /grid-row: 1 \/ span 2;/);
  assert.match(rule, /align-self: start;/);
  assert.doesNotMatch(rule, /position:\s*absolute|(?:margin|top|bottom)[^;]*-\d/);
});

test('name and initials stay left while context spans the full available width', () => {
  assert.match(pivot, /\.pivot-project-info > :is\(\.pivot-project-name-line, \.project-team-badges, \.project-team-empty\)\s*\{\s*grid-column: 1;/);
  assert.match(pivot, /\.pivot-project-context-line\s*\{[\s\S]*?grid-column: 1 \/ -1;/);
});

test('accepted title-to-badge rhythm and badge dimensions are not enlarged', () => {
  assert.match(pivot, /\.pivot-project-info\s*\{\s*display: grid;\s*gap: 3px;\s*min-width: 0;/);
  const shared = file('styles/12-table-teams-and-zebra.css');
  assert.match(shared, /\.project-team-badges\.compact\s*\{[^}]*gap: 4px;[^}]*margin-top: 2px;/);
  assert.match(shared, /\.project-team-badges\.compact \.project-team-badge\s*\{[^}]*min-width: 27px;[^}]*height: 24px;/);
});

test('right alignment and amber/blue meaning survive the new pivot container', () => {
  assert.match(balance, /:is\(\.project-name-status-line, \.pivot-project-statuses, \.active-project-name-line\)\s*> \.balance-review-status-stack\s*\{[^}]*align-items: flex-end;/);
  assert.match(balance, /\.balance-review-status-stack > \.balance-review-amount-line\s*\{[^}]*color: var\(--warning\);/);
  assert.match(balance, /\.balance-review-status-stack > \.needs-rebalance-flag\.pending-foundation-flag\s*\{[^}]*color: var\(--pending-foundation\);/);
});

test('balance card gets the existing 12px tile rhythm above and keeps 16px below', () => {
  assert.match(balance, /\.pm-forecast-jump-target > \.balance-review-detail\s*\{\s*margin-top: 12px;\s*margin-bottom: 16px;/);
  assert.match(file('styles/02-billing-drawers.css'), /\.projection-detail-grid\s*\{[^}]*gap: 12px;/);
});

test('no-card projects receive no unconditional jump-target spacing', () => {
  assert.doesNotMatch(uncomment(balance), /(?:^|\})\s*\.pm-forecast-jump-target\s*\{/);
  assert.match(file('CurrentProjectBillingDrawer.jsx'), /!projectIsCompleted && \(\s*<BalanceReviewSummary/);
  assert.match(file('BalanceReviewSummary.jsx'), /if \(!gap \|\| review\?\.reviewStatusSource === 'DEFERRED_CLASSIFICATION'\) return null/);
});

test('whole-card actions, exact drawer cents, table rounding and focus stay in place', () => {
  const summary = file('BalanceReviewSummary.jsx');
  assert.match(summary, /onClick=\{actionable \? onAction : undefined\}/);
  assert.match(summary, /minimumFractionDigits: 2/);
  assert.match(summary, /balanceReviewTableMoney\(gap.value\)/);
  assert.match(balance, /\.balance-review-detail\.is-actionable:focus-visible\s*\{[^}]*outline:/);
  assert.equal((file('styles.css').match(/^@import\b/gm) || []).length, 16);
  assert.ok(readSource(new URL('../src/styles.css', import.meta.url)).includes('grid-row: 1 / span 2;'));
});
