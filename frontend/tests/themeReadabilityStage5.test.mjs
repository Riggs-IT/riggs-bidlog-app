import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');

const rule = selector => {
  const start = styles.indexOf(selector);
  assert.notEqual(start, -1, `Missing CSS selector ${selector}`);
  const openingBrace = styles.indexOf('{', start);
  const closingBrace = styles.indexOf('}', openingBrace);
  assert.ok(openingBrace >= 0 && closingBrace > openingBrace);
  return styles.slice(openingBrace + 1, closingBrace);
};

for (const [selector, size] of [
  ['.bid-log-table thead th {', 11],
  ['.bid-log-table td {', 12],
  ['.bid-log-due-state {', 11],
  ['.bid-log-name-cell span,\n.bid-log-type-stack span {', 11],
  ['.pivot-project-meta {', 12],
  ['.pivot-project-role-label {', 12],
  ['.pivot-project-context-line {', 12],
]) {
  test(`${selector.split(/\s*[,{]/)[0]} remains readable in both themes`, () => {
    assert.match(rule(selector), new RegExp(`font-size:\\s*${size}px;`));
  });
}

test('pivot GC metadata is readable without changing sticky column geometry', () => {
  // .pivot-project-gc is split into a structural rule and a later typography rule.
  const blocks = [...styles.matchAll(/\.pivot-project-gc\s*\{([^}]*)\}/g)];
  assert.ok(blocks.some((match) => /font-size:\s*12px;/.test(match[1])));
  assert.match(styles, /\.project-pivot-table\s*\.pivot-project-row:hover/);
  assert.match(styles, /\.bid-log-table thead th\s*\{[^}]*position:\s*sticky;/);
});

test('dark theme no longer shrinks compact metadata behind source typography', () => {
  for (const selector of [
    '.bid-log-due-state', '.bid-log-name-cell span',
    '.bid-log-type-stack span', '.pivot-project-meta',
    '.pivot-project-role-label', '.pivot-project-context-line',
    '.pivot-project-gc',
  ]) {
    assert.ok(!theme.includes(selector), `${selector} still has a dark-specific size rule`);
  }
  assert.doesNotMatch(theme, /:root\[data-theme="dark"\] table td\s*\{[^}]*font-size:/);
  assert.match(styles, /\.pivot-single-value\s*\{[^}]*font-size:\s*12px;/);
  assert.match(theme, /--dark-table-head-text:/);
});

test('previously undefined muted-2 does not null out color properties', () => {
  assert.doesNotMatch(styles, /var\(--muted-2\)/);
  for (const selector of [
    '.pivot-project-meta-separator {',
    '.pivot-project-context-separator {',
    '.project-team-empty {',
    '.gc-empty {',
  ]) {
    assert.match(rule(selector), /color:\s*var\(--muted\);/);
  }
});

test('Stage 4 badge colors and financial display structure remain unchanged', () => {
  assert.match(styles, /\.balance-review-status-stack > \.balance-review-amount-line\s*\{[^}]*color:\s*var\(--warning\);/);
  assert.match(styles, /\.needs-rebalance-flag\.pending-foundation-flag/);
  assert.match(styles, /\.pivot-metric-label-list,\s*\.pivot-billing-amounts\s*\{\s*display:\s*grid;/);
  assert.match(styles, /\.active-project-name-cell span\s*\{[^}]*font-size:\s*11px;/);
});
