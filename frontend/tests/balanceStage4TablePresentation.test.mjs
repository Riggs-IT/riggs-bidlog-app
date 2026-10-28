import { readSource } from './helpers/readSource.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = name => readSource(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('compact table uses whole dollars while detail and hover retain exact cents', () => {
  const code = source('BalanceReviewSummary.jsx');
  assert.match(code, /export function balanceReviewTableMoney\(value\)/);
  assert.match(code, /minimumFractionDigits: 0/);
  assert.match(code, /maximumFractionDigits: 0/);
  assert.match(code, /absolute > 0 && absolute < 0\.5\) return '<\$1'/);
  const table = code.slice(code.indexOf('export function BalanceReviewAmount'), code.indexOf('// One visible gap;'));
  assert.match(table, /balanceReviewTableMoney\(gap\.value\)\} \$\{gap\.direction\}\`/);
  assert.match(table, /aria-label=\{`PM projection is \$\{balanceReviewMoney/);
  assert.match(table, /title=\{`Editable PM projection is \$\{balanceReviewMoney/);
  assert.doesNotMatch(table, /<strong>|<span>\{gap\.direction\}/);
  const detail = code.slice(code.indexOf('export default function BalanceReviewSummary'));
  assert.match(detail, /<strong>\{gap\.text\}<\/strong>/);
  assert.match(detail, /balanceReviewCompactMoney\(review\.projectionTargetAmount\)/);
});

test('all table views share the same amount and warning-colored status stack', () => {
  for (const file of ['App.jsx', 'ProjectBillingPivot.jsx', 'ActiveProjectsWorkspace.jsx']) {
    assert.match(source(file), /<BalanceReviewAmount review=/);
    assert.match(source(file), /className="balance-review-status-stack"/);
  }
  const css = source('styles.css');
  assert.match(css, /\.balance-review-status-stack > \.balance-review-amount-line \{[\s\S]*?color: var\(--warning\)/);
  assert.doesNotMatch(css, /\.balance-review-amount-line > :is\(strong, span\)/);
  assert.match(css, /\.balance-review-status-stack > \.needs-rebalance-flag \{/);
});

// Server-rendered exact-value checks remain in balanceReviewVisibility.test.mjs
// and are run with the complete React/Vite suite on BarronLink.
