import { readSource } from './helpers/readSource.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const read = f => readSource(new URL('../src/' + f, import.meta.url), 'utf8');
const theme = read('theme.css');
const styles = read('styles.css');
const controls = read('ViewControls.css');
const filters = read('ProjectionDisplay.css');
const badge = read('ForecastBalanceFlag.jsx');
const app = read('App.jsx');
const pivot = read('ProjectBillingPivot.jsx');
const exactRule = (css, selector) => {
  const start = css.indexOf(selector + ' {');
  assert.ok(start >= 0, `Missing CSS selector: ${selector}`);
  const from = css.indexOf('{', start);
  const to = css.indexOf('}', from);
  return css.slice(from + 1, to);
};

test('OLED keeps neutral backgrounds but lifts text contrast', () => {
  assert.match(theme, /--bg:\s*#0c0c0c;/);
  assert.match(theme, /--surface:\s*#191919;/);
  assert.match(theme, /--text:\s*#e1e1e1;/);
  assert.match(theme, /--muted:\s*#b6b6b6;/);
  assert.match(theme, /--dark-table-head-text:\s*#cecece;/);
  assert.match(theme, /--warning:\s*#d3a75f;/);
  assert.match(theme, /--positive:\s*#78ad97;/);
  assert.match(theme, /--negative:\s*#d08484;/);
});

test('Pending Foundation has independent blue semantic colors in both themes', () => {
  assert.match(theme, /--pending-foundation:\s*#2d607f;/);
  assert.match(theme, /--pending-foundation:\s*#85bde3;/);
  for (const selector of [
    '.needs-rebalance-flag.pending-foundation-flag',
    '.balance-review-detail.is-pending',
    '.balance-review-detail.is-pending.is-actionable:hover',
  ]) {
    const start = styles.indexOf(selector);
    assert.ok(start >= 0, selector);
    const block = styles.slice(styles.indexOf('{', start) + 1, styles.indexOf('}', start));
    assert.match(block, /var\(--pending-foundation\)/);
    assert.doesNotMatch(block, /var\(--accent\)/);
  }
  assert.match(badge, /status === PENDING_FOUNDATION/);
  assert.match(styles, /\.pivot-needs-rebalance\s*\{\s*font-size:\s*10px;/);
});

test('Topbar refresh uses neutral tokens not hard-coded blue-slate colors', () => {
  const control = exactRule(controls, '.topbar-actions .refresh-icon-button');
  assert.match(control, /background:var\(--topbar-control-bg\)/);
  assert.match(control, /color:var\(--topbar-control-text\)/);
  assert.match(control, /border-color:var\(--topbar-control-border\)/);
  assert.doesNotMatch(control, /#[0-9a-f]{3,8}/i);
  assert.match(controls, /\.refresh-icon-button\.is-refreshing svg\s*\{animation:refresh-turn/);
  assert.match(theme, /--topbar-control-bg:\s*#191919;/);
});

test('PM source selection uses neutral gray in OLED and retains the original handlers', () => {
  assert.match(filters, /\.projection-source-count-toggle\s*\{[^}]*font-size:\s*12px;/);
  assert.doesNotMatch(theme, /--projection-filter-active:/);
  assert.doesNotMatch(theme, /\.projection-source-count-toggle\.active:not\(\.rebalance-count\)/);
  assert.match(filters, /\.projection-source-count-toggle\.active\s*\{[^}]*color:\s*var\(--text\);/);
  assert.match(app, /projectionSourceFilter === ALL \|\| projectionSourceFilter === 'pm'/);
  assert.match(pivot, /projectionSourceFilter === projectionSourceAllValue \|\| projectionSourceFilter === 'missing'/);
  assert.match(app, /aria-pressed=\{projectionSourceFilter === ALL \|\| projectionSourceFilter === 'pm'\}/);
});

test('Dark palette no longer owns a different font size', () => {
  const darkRules = [...theme.matchAll(/(:root\[data-theme="dark"\][^{]+)\{([^}]*)\}/g)];
  assert.ok(darkRules.length > 20);
  for (const [, selector, declarations] of darkRules) {
    assert.doesNotMatch(declarations, /font-size\s*:/,
      `Dark theme still changes font size: ${selector.trim()}`);
  }
  assert.doesNotMatch(theme, /-webkit-font-smoothing:\s*antialiased/);
});

test('Projected Billings names, amounts and supporting labels use shared readable sizes', () => {
  const rules = [
    ['.pivot-project-name', 13],
    ['.pivot-project-meta', 12],
    ['.pivot-project-context-line', 12],
    ['.pivot-project-value-line small', 11],
    ['.pivot-project-value-line strong', 12],
    ['.pivot-billing-line small', 10.5],
    ['.pivot-billing-line strong', 12],
    ['.pivot-single-value', 12],
    ['.project-pivot-metric-toggle button', 12],
  ];
  for (const [selector, size] of rules) {
    const chunks = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(m => m[1].trim().endsWith(selector) || m[1].trim() === selector)
      .map(m => m[2]);
    assert.ok(chunks.length, `Missing rule ${selector}`);
    const sizes = chunks.map(c => c.match(/font-size:\s*([\d.]+)px;/)?.[1]).filter(Boolean);
    assert.equal(Number(sizes.at(-1)), size, `Effective font-size for ${selector}`);
  }
  assert.match(styles, /\.project-pivot-table\s*\.pivot-project-column\s*\{\s*width:\s*300px;/);
  assert.match(styles, /\.balance-review-status-stack > \.balance-review-amount-line\s*\{[^}]*color:\s*var\(--warning\);/);
});
