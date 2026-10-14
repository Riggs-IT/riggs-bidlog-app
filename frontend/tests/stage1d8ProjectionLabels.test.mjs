import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('system estimates use a project-name marker instead of source badges or value stars', () => {
  const display = read('ProjectionDisplay.jsx');
  const pivot = read('ProjectBillingPivot.jsx');
  const app = read('App.jsx');
  assert.match(display, /ProjectionEstimateMarker/);
  assert.match(display, /No PM Projection submitted\. System Estimate is reference only/);
  assert.doesNotMatch(display, /ProjectionSource/);
  assert.doesNotMatch(display, /estimate &&/);
  assert.match(pivot, /<ProjectionEstimateMarker project=\{row\.raw\} \/>/);
  assert.doesNotMatch(pivot, /System Baseline estimate/);
  assert.match(app, /<ProjectionEstimateMarker project=\{detail\.raw\} \/>/);
  assert.match(app, /<ProjectionEstimateMarker project=\{row\.raw\} \/>/);
  assert.doesNotMatch(app, /<ProjectionSource/);
});

test('projection coverage counts are low-key source filters with all as the shared state', () => {
  const app = read('App.jsx');
  assert.match(app, /projectionSourceFilter/);
  assert.match(app, /projectionSource:\{/);
  assert.match(app, /e\.row\.needsRebalance/);
  assert.match(app, /matches:\(e,value\)=>e\.kind!=='current'/);
  assert.match(app, /projection-source-count-toggle/);
  assert.match(app, /\{projectionCoverage\.pm\} PM Projection/);
  assert.match(app, /\{projectionCoverage\.system\} No PM Projection/);
  assert.match(app, /portfolioBalance === null \? '—' : projectionCoverage\.rebalance/);
  assert.match(app, /projectionSourceFilter === ALL \|\| projectionSourceFilter === 'pm'/);
  assert.match(app, /projectionSourceFilter === ALL \|\| projectionSourceFilter === 'missing'/);
  assert.match(app, /setProjectionSourceFilter\(value => value === 'pm' \? ALL : 'pm'\)/);
  assert.match(app, /setProjectionSourceFilter\(value => value === 'missing' \? ALL : 'missing'\)/);
  assert.doesNotMatch(app, />\s*PM only\s*</);
});

test('projection balance copy uses remaining-contract language instead of baseline matching', () => {
  const app = read('App.jsx');
  const panel = read('PMForecastPanel.jsx');
  assert.match(app, /No PM Projection/);
  assert.match(panel, /Projection must cover remaining contract/);
  assert.match(panel, /remaining contract after locked Foundation billings/);
  assert.doesNotMatch(panel, /PM Projection total must equal the editable system estimate total/);
});

test('billing variance is Foundation actual minus submitted PM only', () => {
  const drawer = read('CurrentProjectBillingDrawer.jsx');
  assert.match(drawer, /Monthly Billing Variance/);
  assert.match(drawer, /varianceMonthRow\?\.actualAmount/);
  assert.match(drawer, /pmProjectionForVariance\(varianceMonthRow\)/);
  assert.match(drawer, /Foundation Actual Billing − submitted PM Projection/);
  assert.doesNotMatch(drawer, /Actual to date − Projected to date/);
});

test('contract drawer uses approved CO income and current contract wording', () => {
  const drawer = read('CurrentProjectBillingDrawer.jsx');
  const changeOrders = read('ChangeOrdersPanel.jsx');
  assert.match(drawer, /Approved Change Orders/);
  assert.match(drawer, /project\.approvedChangeOrderAmount/);
  assert.match(drawer, /Total Contract/);
  assert.match(drawer, /project\.totalContractAmount/);
  assert.match(drawer, /Contract Remaining/);
  assert.match(drawer, /project\.contractRemainingAmount/);
  assert.doesNotMatch(drawer, /Net Cost Adjustment/);
  assert.match(changeOrders, /Approved CO Total/);
  assert.match(changeOrders, /data\.approvedChangeOrderAmount/);
  assert.match(changeOrders, /item\.incomeAdjustment/);
  assert.doesNotMatch(changeOrders, /data\.netCostAdjustment/);
});

test('existing PM blanks stay blank and PM balance uses remaining contract target', () => {
  const panel = read('PMForecastPanel.jsx');
  assert.match(panel, /forecast\?\.hasPmForecast\s*\? row\.savedPm/);
  assert.match(panel, /initialValue === null\s*\? ''/);
  assert.match(panel, /forecast\?\.projectionTargetAmount/);
  assert.match(panel, /Remaining Contract to Project/);
  assert.match(panel, /Still to Project/);
  assert.match(panel, /Over Contract/);
  assert.match(panel, /baselineComparison && \(\s*<div>[\s\S]*System Estimate Reference/);
  assert.match(panel, /intentionally blank PM months may stay blank/);
});

test('shared header keeps the PM source separate from potential bids and a concise variance tooltip', () => {
  const pivot = read('ProjectBillingPivot.jsx');
  const app = read('App.jsx');
  const projection = read('primaryProjection.js');
  assert.match(pivot, /const hasCombinedForecastSources =/);
  assert.match(pivot, /<HeaderMetricRail/);
  assert.match(pivot, /T \{headerCurrency\(totalForecastValue\)\}/);
  assert.match(pivot, /P \{headerCurrency\(projectedValue\)\}/);
  assert.match(pivot, /const varianceTooltip = varianceTooltipText\(/);
  assert.match(projection, /Comparable:/);
  assert.match(projection, /Actual:/);
  assert.match(pivot, /comparisonScope/);
  assert.match(pivot, /varianceComparableProjects/);
  assert.doesNotMatch(pivot, /No submitted PM \(System Estimate excluded\):/);
  assert.match(pivot, /project-pivot-sticky-coverage/);
  assert.match(app, /projectionSourceFilter=\{projectionSourceFilter\}/);
  assert.match(app, /projectionCoverage=\{projectionCoverage\}/);
  assert.match(projection, /totalForecastValue = sumAmounts\(\[projectedValue, bidProjectedValue\]\)/);
  assert.match(projection, /const actualVarianceValue = amountDifference\(actualValue, projectedValue\)/);
  assert.match(projection, /const comparableVarianceValue =/);
  assert.doesNotMatch(pivot, /B \{headerCurrency\(bidProjectedValue\)\}/);
});

test('completed project detail is read-only billing history and incomplete variance is coverage-aware', () => {
  const drawer = read('CurrentProjectBillingDrawer.jsx');
  const panel = read('PMForecastPanel.jsx');
  const pivot = read('ProjectBillingPivot.jsx');
  const projection = read('primaryProjection.js');

  assert.match(drawer, /COMPLETED PROJECT · BILLING HISTORY/);
  assert.match(drawer, /project-completed-pill/);
  assert.match(drawer, /Project History/);
  assert.match(drawer, /!projectIsCompleted && projectionMessage/);
  assert.match(panel, /projectIsCompleted/);
  assert.match(panel, /Actual Billing History/);
  assert.match(panel, /!projectIsCompleted && \(\s*<section className="pm-forecast-section">/);
  assert.match(panel, /!projectIsCompleted && \(\s*<section className="pm-history-section">/);
  assert.match(pivot, /completedProjectPivotCell/);
  assert.match(pivot, /actualValue === null/);
  assert.match(pivot, /const varianceTooltip = varianceTooltipText\(/);
  assert.match(projection, /Comparable:/);
  assert.match(projection, /Actual:/);
  assert.match(pivot, /comparisonScope/);
  assert.match(projection, /varianceMissingEditableRows/);
  assert.match(projection, /varianceHistoricalUnavailableRows/);
  assert.match(projection, /varianceComparableProjects/);
});


test('sticky controls are pinned by filter hover but generic layout updates do not wake them', () => {
  const sticky = read('useStickyTableHeader.js');
  const styles = read('styles.css');

  assert.match(sticky, /floatingControlsPointerInside/);
  assert.match(sticky, /handleFloatingControlsPointerEnter/);
  assert.match(sticky, /handleFloatingControlsPointerLeave/);
  assert.match(sticky, /horizontalControlActive[\s\S]*\|\| floatingControlsPointerInside/);
  assert.match(sticky, /!horizontalControlActive[\s\S]*&& !floatingControlsPointerInside/);
  assert.match(sticky, /const handleScroll =[\s\S]*showFloatingControls\(\);[\s\S]*scheduleUpdate\(\);/);
  assert.doesNotMatch(sticky, /const handlePointerEnter/);
  assert.doesNotMatch(sticky, /floatingTableViewport\.scrollLeft =[\s\S]*showFloatingControls\(\);\n        \};/);
  assert.match(styles, /project-pivot-sticky-coverage[\s\S]*projection-source-count-toggle[\s\S]*font-size:\s*12px/);
  assert.match(styles, /project-pivot-sticky-coverage[\s\S]*projection-source-count-toggle[\s\S]*font-weight:\s*700/);
});
