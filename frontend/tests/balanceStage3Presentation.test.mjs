import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('one signed difference, two supporting totals, no repeated action button', () => {
  const component = source('BalanceReviewSummary.jsx');
  const markup = component.slice(component.indexOf('export default function BalanceReviewSummary'));
  assert.match(markup, /<strong>\{gap\.text\}<\/strong>/);
  assert.equal((markup.match(/<strong>\{gap\.text\}<\/strong>/g) || []).length, 1);
  assert.match(markup, /Remaining contract/);
  assert.match(markup, /PM projection/);
  assert.doesNotMatch(markup, /PM minus remaining target|PM projection \{gap\.direction\} target/);
  assert.doesNotMatch(markup, /<button[^>]*className="secondary-button/);
  assert.doesNotMatch(markup, /<p>.*The PM plan differs/);
  assert.match(markup, /const Container = actionable \? 'button' : 'section'/);
  assert.match(markup, /onClick=\{actionable \? onAction : undefined\}/);
  assert.match(markup, /title=\{actionable \? actionLabel : undefined\}/);
  assert.match(markup, /type=\{actionable \? 'button' : undefined\}/);
  assert.match(source('styles.css'), /\.balance-review-detail\.is-actionable:focus-visible/);
});

test('trim only trailing whole-dollar cents, never collapse fractional precision', () => {
  const component = source('BalanceReviewSummary.jsx');
  assert.match(component,/balanceReviewMoney\(value\)\.replace\(\/\\\.00\$\/, ''\)/);
  assert.match(component,/minimumFractionDigits: 2/);
  assert.match(component,/maximumFractionDigits: 2/);
  assert.match(component,/rebalanceVarianceAmount/);
});

test('balance status and gap stay together and right aligned in every table variant', () => {
  for (const file of ['App.jsx', 'ProjectBillingPivot.jsx', 'ActiveProjectsWorkspace.jsx']) {
    const src = source(file);
    assert.match(src, /className="balance-review-status-stack"/);
    const stacks = src.split('className="balance-review-status-stack"').slice(1);
    for (const block of stacks) {
      const closing = block.indexOf('</span>');
      assert.ok(closing > 0, `${file} stack missing close`);
      const body = block.slice(0, closing);
      assert.match(body, /<ForecastBalanceFlag/);
      assert.match(body, /<BalanceReviewAmount/);
      assert.ok(body.indexOf('<ForecastBalanceFlag') < body.indexOf('<BalanceReviewAmount'));
    }
    assert.equal((src.match(/<BalanceReviewAmount /g) || []).length, stacks.length);
  }
  const css = source('styles.css');
  assert.match(css,/\.balance-review-status-stack\s*\{[\s\S]*?align-items: flex-end/);
  assert.match(css,/\.balance-review-amount-line\s*\{[\s\S]*?text-align: right/);
});

test('drawer delegates whole-card action to established permission gate and never auto-corrects admin', () => {
  const drawer = source('CurrentProjectBillingDrawer.jsx');
  const panel = source('PMForecastPanel.jsx');
  assert.match(drawer, /onAction=\{openBalanceProjections\}/);
  assert.match(drawer, /mayStartPmRevision && safeReviewStatus\(rebalanceAttention\) === 'NEEDS_REBALANCE'/);
  assert.match(drawer, /hasAdminCorrectionChoice = billingRole === 'ADMIN' \|\| billingRole === 'MANAGEMENT_ADMIN'/);
  assert.match(panel, /if \(isAdmin \|\| !canSubmit \|\| projectIsCompleted\)/);
  assert.match(drawer, /setRevisionRequest\(/);
});
