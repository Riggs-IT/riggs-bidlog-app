import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../src/ProjectAccountability.jsx', import.meta.url), 'utf8');
const style = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const heading = source.slice(source.indexOf('className="page-heading"'), source.indexOf('{error && ('));
const start = source.indexOf('className="stats-grid completed-project-stats"');
const finish = source.indexOf('className="content-card completed-project-card"', start);
const headline = source.slice(start, finish);
const cards = headline.split(/<StatCard\b/g).slice(1);

test('filtered completed count lives beside the heading, not in a tile', () => {
  assert.match(source, /summarizeCompletedCommercial\(filteredRows\)/);
  assert.match(heading, /completed-heading-title/);
  assert.match(heading, /metrics\.total\.toLocaleString\('en-US'\)/);
  assert.match(heading, /of \${rows\.length\.toLocaleString/);
  assert.doesNotMatch(headline, /label="Completed Projects"/);
});

test('three headline KPIs use API financial fields and signed actual-minus-total variance', () => {
  assert.equal(cards.length, 3);
  assert.match(cards[0], /label="Total Contract"[\s\S]*?value=\{<MoneyValue value=\{metrics\.totalContract\}/);
  assert.match(cards[1], /label="Actual Billings"[\s\S]*?value=\{<MoneyValue value=\{metrics\.actualBillings\}/);
  assert.match(cards[2], /label="Actual vs Total Contract"[\s\S]*?value=\{<MoneyValue value=\{metrics\.actualVsTotalContract\}/);
  assert.match(cards[2], /tone=\{metrics\.actualVsTotalContract < 0 \? 'critical' : ''\}/);
  assert.match(cards[2], /Actual Billings − Total Contract/);
  assert.doesNotMatch(headline, /label="Contract Remaining"|label="Historical Estimates"/);
});

test('original and CO move into Total Contract tooltip, default Foundation is quiet', () => {
  assert.match(cards[0], /tooltip=\{completedPortfolioContractTooltip\(metrics\)\}/);
  assert.match(cards[0], /metrics\.opsFallbackCount > 0/);
  assert.doesNotMatch(source, /completed-contract-info-mark|ⓘ/);
  assert.doesNotMatch(headline, /CONTRACT BREAKDOWN|completed-contract-composition|Approved Change Orders/);
  assert.doesNotMatch(headline, /recorded CO events|metrics\.approvedChangeOrderCount/);
});

test('styles are scoped to completed billings and respect semantic theme tokens and mobile layout', () => {
  assert.match(style, /\.completed-project-stats \{[\s\S]*?grid-template-columns: repeat\(3,/);
  assert.match(style, /@media \(max-width: 650px\) \{\s*\.completed-project-stats/);
  assert.match(style, /\.completed-heading-count \{[\s\S]*?var\(--surface-2\)/);
  assert.match(style, /\.stat-card\.tone-critical strong \{\s*color: var\(--critical\)/);
});
