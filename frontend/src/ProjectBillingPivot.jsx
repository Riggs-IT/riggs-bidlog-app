import { completedProjectPivotCell, pivotCurrentCell, pivotTotals, nullableAmount, varianceTooltipText } from './primaryProjection.js';
import { ProjectionEstimateMarker, ProjectionAmount } from './ProjectionDisplay.jsx';
import ScheduleReviewFlag from './ScheduleReviewFlag.jsx';
import ForecastBalanceFlag from './ForecastBalanceFlag.jsx';
import {isBalanceReviewFilter} from './balanceReviewQuickFilter.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import useStickyTableHeader from './useStickyTableHeader.js';
import {metricPinThreshold, shouldPinMetricLabels} from './pivotMetricPinning.js';
import { ProjectTeamBadges } from './BillingDisplay.jsx';
import { isCompleted } from './viewFilters.js';
import {
  GeneralContractorDisplay,
  generalContractorDisplayText,
} from './GeneralContractors.jsx';


const BILLING_METRICS = [
  {
    key: 'all',
    label: 'All',
  },
  {
    key: 'projected',
    label: 'Projected',
  },
  {
    key: 'actual',
    label: 'Actual',
  },
  {
    key: 'variance',
    label: 'Variance',
  },
  {
    key: 'marginCollected',
    label: 'Margin Collected',
  },
];


function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}


function monthKey(value) {
  if (!value) {
    return '';
  }

  return String(value).slice(
    0,
    7,
  );
}


function monthlyIndex(rows) {
  return new Map(
    (rows || []).map(
      row => [
        monthKey(row.monthStart),
        row,
      ]
    )
  );
}


function displayText(
  value,
  fallback,
) {
  if (Array.isArray(value)) {
    const joined =
      value
        .filter(Boolean)
        .join(', ')
        .trim();

    return joined || fallback;
  }

  const text =
    String(
      value ?? ''
    ).trim();

  return text || fallback;
}


function initialsFromName(name) {
  const words =
    String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (!words.length) {
    return '—';
  }

  return words
    .slice(0, 2)
    .map(
      word =>
        word.charAt(0)
    )
    .join('')
    .toUpperCase();
}


function normalizedPmColor(value) {
  const color =
    String(value || '').trim();

  return /^#[0-9a-f]{6}$/i.test(
    color
  )
    ? color
    : '#6b7280';
}


function squareFootageLabel(value) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
    || number <= 0
  ) {
    return null;
  }

  return (
    `${Math.round(number).toLocaleString('en-US')} SF`
  );
}


function cubicYardsLabel(value) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
    || number <= 0
  ) {
    return null;
  }

  return (
    `${Math.round(number).toLocaleString('en-US')} CY`
  );
}


function wholeCurrencyLabel(value) {
  if (
    value === null
    || value === undefined
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return new Intl.NumberFormat(
    'en-US',
    {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    },
  ).format(number);
}


function buildingCountLabel(value) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number)
    || number <= 0
  ) {
    return null;
  }

  const count =
    Math.round(number);

  return (
    `${count} ${
      count === 1
        ? 'BLDG'
        : 'BLDGS'
    }`
  );
}


function currentProjectPivotRow(
  project,
  months,
  rows,
) {
  const indexed =
    monthlyIndex(rows);

  const completed = isCompleted(project);

  const cells = months.map(
    month => completed
      ? completedProjectPivotCell(indexed.get(month), month)
      : pivotCurrentCell(indexed.get(month), month)
  );

  const pmName =
    displayText(
      project.pm,
      'No PM Assigned',
    );

  return {
    key:
      `pivot-current-${project.jobListId}`,

    source:
      'current',

    sourceLabel:
      completed
        ? 'Completed'
        : 'Active',

    number:
      project.jobNumber || '—',

    name:
      project.jobName
      || 'Unnamed project',

    pmName,

    pmInitials:
      displayText(
        project.pmInitials,
        initialsFromName(pmName),
      ),

    pmHexColor:
      project.pmHexColor,

    contextItems: [],

    projectValues: [
      {
        label: completed ? 'Total Contract' : 'Contract',
        value:
          wholeCurrencyLabel(project.totalContractAmount) || '—',
      },
      {
        label: 'SF',
        value:
          squareFootageLabel(
            project.squareFootage
          ) || '—',
      },
      {
        label: 'CY',
        value:
          cubicYardsLabel(
            project.cubicYards
          ) || '—',
      },
    ],

    gc:
      generalContractorDisplayText(
        project.generalContractors
        || project.gc,
        'No GC',
      ),

    cells,

    total: completed
      ? {
          projected: null,
          actual: project.selectedActualValueCount ? nullableAmount(project.selectedActual) : null,
          variance: null,
          marginCollected: nullableAmount(project.selectedMarginCollected),
          marginDataComplete: project.selectedMarginDataComplete ?? null,
          baseline: null,
          missingPmMonths: 0,
          isSystemEstimate: false,
          isEditable: false,
          monthEditState: 'LOCKED_PAST',
          projectCompleted: true,
          varianceProjectedValue: null,
          varianceActualValue: null,
          varianceComparableRows: 0,
          varianceNoPmForecastRows: 0,
          varianceActualRows: project.selectedActualValueCount || 0,
          varianceMissingEditableRows: 0,
          varianceHistoricalUnavailableRows: project.selectedActualValueCount || 0,
        }
      : {
          projected: nullableAmount(project.selectedProjected),
          actual: project.selectedActualValueCount ? nullableAmount(project.selectedActual) : null,
          variance: nullableAmount(project.selectedVariance),
          marginCollected: nullableAmount(project.selectedMarginCollected),
          baseline: nullableAmount(project.selectedBaseline),
          missingPmMonths: project.selectedMissingPmMonths || 0,
          isSystemEstimate:project.hasPmForecast !== true,
          isEditable: false,
          monthEditState: null,
          projectCompleted: false,
          varianceProjectedValue: nullableAmount(project.selectedVarianceProjected),
          varianceActualValue: nullableAmount(project.selectedVarianceActual),
          varianceComparableRows: project.selectedVarianceComparableRows || 0,
          varianceNoPmForecastRows: project.selectedVarianceNoPmForecastRows || 0,
          varianceActualRows: project.selectedActualValueCount || 0,
          varianceMissingEditableRows: project.selectedVarianceMissingEditableRows || 0,
          varianceHistoricalUnavailableRows: project.selectedVarianceHistoricalUnavailableRows || 0,
        },

    raw:
      project,
  };
}


function bidPivotRow(
  bid,
  months,
  rows,
) {
  const indexed =
    monthlyIndex(rows);

  const cells =
    months.map(
      month => {
        const row =
          indexed.get(month);

        if (!row) {
          return {
            month,
            hasActivity: false,
            projected: null,
            actual: null,
            variance: null,
            marginCollected: null,
          };
        }

        const projected =
          toNumber(
            row.weightedMonthlyForecastAmount
          );

        return {
          month,

          hasActivity:
            projected !== 0,

          projected,

          actual:
            null,

          variance:
            null,

          marginCollected:
            null,
        };
      }
    );

  const pmName =
    displayText(
      bid.pm,
      'No PM Assigned',
    );

  return {
    key:
      `pivot-bid-${bid.sharePointItemId}`,

    source:
      'bid',

    sourceLabel:
      'Bid',

    number:
      '—',

    name:
      bid.bidName
      || 'Unnamed bid',

    pmName,

    pmInitials:
      displayText(
        bid.pmInitials,
        initialsFromName(pmName),
      ),

    pmHexColor:
      bid.pmHexColor,

    contextItems: [
      buildingCountLabel(
        bid.numberOfBuildings
      )
        ? {
            value:
              buildingCountLabel(
                bid.numberOfBuildings
              ),
            title:
              `Buildings: ${
                Math.round(
                  Number(
                    bid.numberOfBuildings
                  )
                )
              }`,
          }
        : null,
    ].filter(Boolean),

    projectValues: [
      {
        label: 'Est.',
        value:
          wholeCurrencyLabel(
            bid.estimatedPrice
            ?? bid.effectiveAmount
          ) || '—',
      },
      {
        label: 'SF',
        value:
          squareFootageLabel(
            bid.squareFootage
          ) || '—',
      },
      {
        label: 'CY',
        value:
          cubicYardsLabel(
            bid.cubicYards
          ) || '—',
      },
    ],

    gc:
      generalContractorDisplayText(
        bid.generalContractors
        || bid.gc,
        'No GC',
      ),

    cells,

    total: {
      projected:
        toNumber(
          bid.selectedWeightedForecast
        ),

      actual:
        null,

      variance:
        null,

      marginCollected:
        null,
    },

    raw:
      bid,
  };
}


function ProjectMeta({
  row,
  onOpenBalanceReview,
  onBalanceReviewQuickFilter,
  selectedQuickFilter,
  historicalOnly = false,
}) {
  return (
    <div className="pivot-project-info">
      <div className="pivot-project-name-line">
        {row.source === 'current' && !historicalOnly && <ProjectionEstimateMarker project={row.raw} />}
        <strong
          className="pivot-project-name"
          title={row.name}
        >
          {row.name}
        </strong>

        {row.source === 'current' && row.raw?.needsRebalance && !isCompleted(row.raw) && (
          <ForecastBalanceFlag review={row.raw} className="pivot-needs-rebalance"
            onClick={onOpenBalanceReview}
            onQuickFilter={onBalanceReviewQuickFilter}
            selectedQuickFilter={selectedQuickFilter} />
        )}

        {row.source === 'current' && !isCompleted(row.raw) && (
          <ScheduleReviewFlag review={row.raw?.scheduleReview} />
        )}

        {row.raw?.projectCompleted && (
          <span className="project-completed-pill">
            Completed
          </span>
        )}
      </div>

      <ProjectTeamBadges
        compact
        pm={row.pmName}
        pmInitials={row.pmInitials}
        pmHexColor={row.pmHexColor}
        pe={
          row.source === 'current'
            ? row.raw?.pe
            : null
        }
        peInitials={row.raw?.peInitials}
        peHexColor={row.raw?.peHexColor}
        apm={
          row.source === 'current'
            ? row.raw?.apm
            : null
        }
        apmInitials={row.raw?.apmInitials}
        apmHexColor={row.raw?.apmHexColor}
        superintendent={
          row.source === 'current'
            ? row.raw?.superintendent
            : null
        }
        superintendentInitials={row.raw?.superintendentInitials}
        superintendentHexColor={row.raw?.superintendentHexColor}
      />

      {!!row.contextItems?.length && (
        <div className="pivot-project-context-line">
          {row.contextItems.map(
            (
              item,
              index,
            ) => (
              <span
                className="pivot-project-context-group"
                key={
                  `${item.label || 'fact'}-${index}`
                }
              >
                {index > 0 && (
                  <span
                    className="pivot-project-context-separator"
                    aria-hidden="true"
                  >
                    ·
                  </span>
                )}

                <span
                  className="pivot-project-context-item"
                  title={item.title}
                >
                  {item.label && (
                    <span className="pivot-project-role-label">
                      {item.label}
                    </span>
                  )}

                  <span>
                    {item.value}
                  </span>
                </span>
              </span>
            )
          )}
        </div>
      )}

    </div>
  );
}


function ProjectValuesCell({
  row,
}) {
  return (
    <div className="pivot-project-values">
      {(row.projectValues || []).map(
        item => (
          <span
            className="pivot-project-value-line"
            key={item.label}
          >
            <small>{item.label}</small>
            <strong>{item.value}</strong>
          </span>
        )
      )}
    </div>
  );
}


function metricClass(
  metric,
  value,
) {
  if (
    metric === 'variance'
    && value !== null
    && value !== undefined
    && value < 0
  ) {
    return 'variance-negative';
  }

  return '';
}


// Values -> All has exactly one shared label column. The monthly amounts
// keep the same four tracks (including null versus zero), so a label cannot
// become detached from its number when the user scrolls horizontally.
const ALL_VALUE_TRACKS = [
  {key: 'projected', label: 'Projected', short: 'P'},
  {key: 'actual', label: 'Actual', short: 'A'},
  {key: 'variance', label: 'Variance', short: 'Δ'},
  {key: 'marginCollected', label: 'Margin Collected', short: 'M'},
];


const COMPLETED_VALUE_TRACKS = ALL_VALUE_TRACKS.filter(
  track => track.key === 'actual' || track.key === 'marginCollected',
);

function MetricLabels({compact, showMargin = false, completedHistoryMode = false}) {
  const tracks = completedHistoryMode ? COMPLETED_VALUE_TRACKS : ALL_VALUE_TRACKS;
  return (
    <div className="pivot-metric-label-list">
      {tracks.filter(track => showMargin || track.key !== 'marginCollected').map(({key, label, short}) => (
        <span
          key={key}
          className="pivot-metric-label"
          title={label}
        >
          {compact ? (
            <abbr title={label} aria-label={label}>{short}</abbr>
          ) : (
            <span>{label}</span>
          )}
        </span>
      ))}
    </div>
  );
}


// Header and project rows share the same frozen Metric lane in Values -> All.
// One label per row replaces P/A/Δ/M repeated under every month and Total.
export function HeaderMetricRail({compact, showMargin, includeProjectProjection, includeBidProjection, showBaseline,
  completedHistoryMode = false}) {
  if (completedHistoryMode) {
    return (
      <div className="pivot-header-total pivot-header-metric-rail" aria-label="Completed billing metric labels">
        <span className="pivot-header-total-label">Metric</span>
        <span className="pivot-header-total-values pivot-header-total-values-all">
          <small className="pivot-header-total-value pivot-header-metric-label">{compact ? 'A' : 'Actual'}</small>
          {showMargin && <small className="pivot-header-total-value pivot-header-metric-label">
            {compact ? 'M' : 'Margin Collected'}
          </small>}
        </span>
      </div>
    );
  }
  const combined = includeProjectProjection && includeBidProjection;
  const label = (full, short, title = full) => (
    <small className="pivot-header-total-value pivot-header-metric-label" title={title}>
      {compact ? short : full}
    </small>
  );

  return (
    <div className="pivot-header-total pivot-header-metric-rail" aria-label="Shared monthly metric labels">
      <span className="pivot-header-total-label">Metric</span>
      <span className="pivot-header-total-values pivot-header-total-values-all">
        {combined && label('Total', 'T', 'Total projected: active projects + potential bids')}
        {label(combined ? 'Active' : 'Projected', 'P', 'Active project projection')}
        {includeProjectProjection && (
          <>
            {label('Actual', 'A', 'Actual billings')}
            {label('Variance', 'Δ', 'Comparable before the Arizona 15th; Actual − PM starting the 15th')}
            {showMargin && label('Margin', 'M', 'Margin collected')}
          </>
        )}
      </span>
      {showBaseline && includeProjectProjection && (
        <small className="baseline-reference pivot-header-metric-baseline" title="System estimate">
          {compact ? 'SE' : 'System estimate'}
        </small>
      )}
      <span className="pivot-header-activity-counts">
        <small className="pivot-header-billed-count pivot-header-forecast-count pivot-header-metric-count"
          title={combined ? 'Projected active projects + potential bids' : includeProjectProjection ? 'Projected active projects' : 'Projected potential bids'}>
          {compact ? '#' : combined ? 'Projected (all)' : includeProjectProjection ? 'Projected (active)' : 'Projected (bids)'}
        </small>
      </span>
    </div>
  );
}


function AllBillingValues({cell, currency, source, showMargin = false, completedHistoryMode = false}) {
  const tracks = completedHistoryMode ? COMPLETED_VALUE_TRACKS : ALL_VALUE_TRACKS;
  return (
    <div className="pivot-billing-amounts">
      {tracks.filter(track => showMargin || track.key !== 'marginCollected').map(({key}) => {
        // Completed history has two tracks only: recorded Actual and the
        // authorized Margin Collected. Never show PM projections or variance.
        const unavailable = !completedHistoryMode && key !== 'projected'
          && (source === 'bid' || cell?.hasActivity === false);
        const value = cell?.[key] ?? null;
        return (
          <span
            key={key}
            className={`pivot-billing-amount-line ${metricClass(key, value)}`}
          >
            {unavailable ? null : (
              <strong>
                {value == null ? '—' : currency(value)}
              </strong>
            )}
          </span>
        );
      })}
    </div>
  );
}


function SingleBillingValue({
  cell,
  metric,
  currency,
}) {
  const value =
    cell[metric];

  if (
    value === null
    || value === undefined
  ) {
    return (
      <span className="pivot-empty-value">
        —
      </span>
    );
  }

  return (
    <strong
      className={
        `pivot-single-value ${
          metricClass(
            metric,
            value,
          )
        }`
      }
    >
      {currency(value)}
    </strong>
  );
}


function PivotSortHeader({
  label,
  sortKey,
  sortState,
  onSort,
  firstDirection = 'asc',
  className = '',
  numeric = false,
}) {
  const active =
    sortState.key === sortKey;

  return (
    <th
      className={
        [
          className,
          numeric
            ? 'numeric'
            : '',
          'sortable-column',
        ]
          .filter(Boolean)
          .join(' ')
      }
      aria-sort={
        active
          ? (
              sortState.direction === 'asc'
                ? 'ascending'
                : 'descending'
            )
          : 'none'
      }
    >
      <button
        type="button"
        className={
          active
            ? 'table-sort-button active'
            : 'table-sort-button'
        }
        onClick={
          event => {
            event.stopPropagation();

            onSort(
              sortKey,
              firstDirection,
            );
          }
        }
      >
        <span>
          {label}
        </span>

        <span
          className="table-sort-indicator"
          aria-hidden="true"
        >
          {active
            ? (
                sortState.direction === 'asc'
                  ? '↑'
                  : '↓'
              )
            : '↕'}
        </span>
      </button>
    </th>
  );
}


function BillingValue({ cell, metric, currency, source, showBaseline = false, showMargin = false,
  completedHistoryMode = false }) {
  const compare = !completedHistoryMode && showBaseline && source === 'current';
  if (metric === 'projected') {
    return <ProjectionAmount value={cell.projected} currency={currency} missing={cell.missingPmMonths}
      baseline={cell.baseline} compare={compare} />;
  }
  if (metric === 'all') {
    return <div><AllBillingValues cell={cell} currency={currency} source={source}
      showMargin={showMargin} completedHistoryMode={completedHistoryMode} />

      {compare && <small className="baseline-reference">System Estimate {cell.baseline == null ? '—' : currency(cell.baseline)}</small>}
    </div>;
  }
  return <SingleBillingValue cell={cell} metric={metric} currency={currency} />;
}


function headerCurrency(value) {
  if (
    value === null
    || value === undefined
  ) {
    return '—';
  }

  return new Intl.NumberFormat(
    'en-US',
    {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    },
  ).format(value);
}


function headerMetricKey(metric) {
  return metric === 'all'
    ? 'projected'
    : metric;
}


export function HeaderTotal({
  label,
  value,
  projectedValue = null,
  bidProjectedValue = null,
  actualValue = null,
  marginCollectedValue = null,
  showMargin = false,
  completedHistoryMode = false,
  totalForecastValue = null,
  varianceValue = null,
  actualVarianceValue = null,
  comparableVarianceValue = null,
  varianceMode = 'ACTUAL',
  comparisonScope = 'projects',
  varianceProjectedValue = null,
  varianceActualValue = null,
  varianceComparableProjects = 0,
  varianceActualProjects = 0,
  varianceNoPmForecastProjects = 0,
  varianceMissingEditableProjects = 0,
  varianceHistoricalUnavailableProjects = 0,
  metric,
  currency,
  activeProjectsBilled = null,
  activeProjectsProjected = null,
  potentialBidsProjected = null,
  includeProjectProjection = true,
  includeBidProjection = true,
  missingPmMonths = 0,
  hasSystemEstimate = false,
  baselineValue = null,
  showBaseline = false,
}) {
  const allMode =
    metric === 'all';

  const actualMode =
    metric === 'actual';

  const projectedMode =
    metric === 'projected';

  const varianceOnlyMode =
    metric === 'variance';

  const marginMode =
    metric === 'marginCollected';

  const projectedDisplayValue =
    includeProjectProjection
      ? projectedValue
      : bidProjectedValue;

  const projectedTooltipLabel =
    includeProjectProjection
      ? 'Submitted PM Projection'
      : 'Potential Bid Projection';

  const hasCombinedForecastSources =
    includeProjectProjection
    && includeBidProjection;

  const totalForecastTooltip =
    [
      'Total Forecast',
      `Active projects: ${headerCurrency(projectedValue)}`,
      `Potential bids: ${headerCurrency(bidProjectedValue)}`,
      `Total: ${headerCurrency(totalForecastValue)}`,
    ].join('\n');

  const projectedTooltip =
    [
      projectedTooltipLabel,
      headerCurrency(projectedDisplayValue),
      includeProjectProjection
      && missingPmMonths
        ? `PM months missing: ${missingPmMonths}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

  const actualTooltip =
    [
      'Actual Billings',
      actualValue === null
      || actualValue === undefined
        ? 'No billings'
        : currency(actualValue),
    ].join('\n');

  // Both figures remain inspectable without making a matched subtotal look
  // like the subtraction of the two unrestricted portfolio totals.
  const varianceTooltip = varianceTooltipText({
    actualVariance:actualVarianceValue, comparableVariance:comparableVarianceValue,
    mode:varianceMode, compared:varianceComparableProjects,
    actualProjects:varianceActualProjects, scope:comparisonScope,
  }, headerCurrency);
  const varianceIndicator = varianceMode === 'COMPARABLE' ? 'C'
    : varianceMode === 'MIXED' ? '*' : null;
  const varianceSuffix = varianceIndicator && varianceValue != null
    ? <sup className="pivot-variance-mode-indicator" title={varianceMode === 'COMPARABLE'
      ? 'Comparable variance (before 15th)' : 'Mixed monthly variance'}>{varianceIndicator}</sup>
    : null;

  const singleValueTooltip =
    actualMode
      ? actualTooltip
      : (
          varianceOnlyMode
            ? varianceTooltip
            : (
                marginMode
                  ? [
                      'Margin Collected',
                      value === null
                      || value === undefined
                        ? 'No value'
                        : currency(value),
                    ].join('\n')
                  : undefined
              )
        );

  const projectBilledText =
    activeProjectsBilled !== null
    && activeProjectsBilled > 0
      ? `${activeProjectsBilled} ${
          activeProjectsBilled === 1
            ? 'project billed'
            : 'projects billed'
        }`
      : null;

  const activeProjectedCount = includeProjectProjection
    ? (activeProjectsProjected ?? 0)
    : 0;
  const bidProjectedCount = includeBidProjection
    ? (potentialBidsProjected ?? 0)
    : 0;
  const totalProjectedCount = activeProjectedCount + bidProjectedCount;
  const projectProjectedText = activeProjectedCount > 0
    ? `${activeProjectedCount} Projected (active)`
    : null;
  const bidsProjectedText = bidProjectedCount > 0
    ? `${bidProjectedCount} Projected (bids)`
    : null;
  const combinedProjectedText = hasCombinedForecastSources && totalProjectedCount > 0
    ? `${totalProjectedCount} projected (active + bids)`
    : null;
  // T/P values already have their own dollar tooltips. Only the mixed-source
  // record count needs a hover, and its job is to split the *counts*.
  const forecastActivityTooltip = [
    projectBilledText,
    hasCombinedForecastSources
      ? `${activeProjectedCount} active ${activeProjectedCount === 1 ? 'project' : 'projects'} · ${bidProjectedCount} potential ${bidProjectedCount === 1 ? 'bid' : 'bids'}`
      : (projectProjectedText || bidsProjectedText),
  ].filter(Boolean).join('\n') || undefined;

  if (completedHistoryMode && allMode) {
    return (
      <span className="pivot-header-total" aria-label={`${label} completed actual${showMargin ? ' and margin' : ''}`}>
        <span className="pivot-header-total-label">{label}</span>
        <span className="pivot-header-total-values pivot-header-total-values-all">
          <small className="pivot-header-total-value pivot-header-total-value-actual"
            title={`Actual Billings: ${headerCurrency(actualValue)}`}>
            {headerCurrency(actualValue)}
          </small>
          {showMargin && <small className="pivot-header-total-value pivot-header-total-value-margin"
            title={marginCollectedValue == null ? 'Margin Collected unavailable or incomplete'
              : `Margin Collected: ${headerCurrency(marginCollectedValue)}`}>
            {headerCurrency(marginCollectedValue)}
          </small>}
        </span>
      </span>
    );
  }

  return (
    <span className="pivot-header-total">
      <span className="pivot-header-total-label">
        {label}
      </span>

      {allMode ? (
        <span className="pivot-header-total-values pivot-header-total-values-all">
          {hasCombinedForecastSources && (
            <small
              className="pivot-header-total-value pivot-header-total-value-total"
              title={totalForecastTooltip}
            >
              {headerCurrency(totalForecastValue)}
            </small>
          )}

          {includeProjectProjection ? (
            <>
              <small
                className="pivot-header-total-value"
                title={projectedTooltip}
              >
                {headerCurrency(projectedValue)}
              </small>

              <small
                className="pivot-header-total-value pivot-header-total-value-actual"
                title={actualTooltip}
              >
                {headerCurrency(actualValue)}
              </small>

              <small
                className={
                  `pivot-header-total-value pivot-header-total-value-variance ${
                    metricClass('variance', varianceValue)
                  }`
                }
                title={varianceTooltip}
              >
                {headerCurrency(varianceValue)}{varianceSuffix}
              </small>

              {showMargin && (
                <small
                  className="pivot-header-total-value pivot-header-total-value-margin"
                  title={marginCollectedValue == null
                    ? 'Margin Collected\nUnavailable or margin data incomplete'
                    : `Margin Collected\n${currency(marginCollectedValue)}`}
                >
                  {headerCurrency(marginCollectedValue)}
                </small>
              )}
            </>
          ) : (
            <small
              className="pivot-header-total-value"
              title={projectedTooltip}
            >
              {headerCurrency(bidProjectedValue)}
            </small>
          )}
        </span>
      ) : projectedMode ? (
        hasCombinedForecastSources ? (
          <span className="pivot-header-total-values pivot-header-total-values-projected">
            <small
              className="pivot-header-total-value pivot-header-total-value-total"
              title={totalForecastTooltip}
            >
              T {headerCurrency(totalForecastValue)}
            </small>

            <small
              className="pivot-header-total-value"
              title={projectedTooltip}
            >
              P {headerCurrency(projectedValue)}
            </small>
          </span>
        ) : (
          <small
            className="pivot-header-total-value"
            title={projectedTooltip}
          >
            P {headerCurrency(projectedDisplayValue)}
          </small>
        )
      ) : (
        (actualMode || varianceOnlyMode)
        && (value === null || value === undefined)
          ? null
          : (
              <small
                className={
                  `pivot-header-total-value ${
                    varianceOnlyMode
                      ? metricClass(
                          'variance',
                          value,
                        )
                      : ''
                  }`
                }
                title={singleValueTooltip}
              >
                {actualMode
                  ? 'A '
                  : ''}

                {varianceOnlyMode
                  ? 'V '
                  : ''}

                {marginMode
                  ? 'M '
                  : ''}

                {headerCurrency(value)}{varianceOnlyMode ? varianceSuffix : null}
              </small>
            )
      )}

      {showBaseline && includeProjectProjection && (
        <small className="baseline-reference" title={`System Estimate: ${headerCurrency(baselineValue)}`}>
          {allMode ? headerCurrency(baselineValue) : `System Estimate ${headerCurrency(baselineValue)}`}
        </small>
      )}

      {(allMode || projectBilledText || totalProjectedCount > 0) && (
        <span className="pivot-header-activity-counts">
          {allMode ? (
            <small
              className="pivot-header-billed-count pivot-header-forecast-count"
              title={forecastActivityTooltip}
            >
              {totalProjectedCount}
            </small>
          ) : (
            <>
              {projectBilledText && (
                <small className="pivot-header-billed-count" title={`${projectBilledText} in this month`}>
                  {projectBilledText}
                </small>
              )}
              {totalProjectedCount > 0 && (
                <small
                  className="pivot-header-billed-count pivot-header-forecast-count"
                  title={forecastActivityTooltip}
                >
                  {combinedProjectedText || projectProjectedText || bidsProjectedText}
                </small>
              )}
            </>
          )}
        </span>
      )}
    </span>
  );
}

export default function ProjectBillingPivot({
  months,
  currentProjects,
  bidProjects,
  currentMonthly,
  bidMonthly,
  currency,
  monthLabel,
  varianceAsOfUTC = null,
  onSelectCurrentProject,
  onSelectBidProject,
  canViewMargin = false,
  includeActiveProjects = true,
  includeBids = true,
  showBaseline = false,
  projectionSourceFilter = '__ALL__',
  projectionCoverage = null,
  portfolioBalanceAvailable = false,
  onProjectionSourceFilterChange = null,
  projectionSourceAllValue = '__ALL__',
  onBalanceReviewQuickFilter = null,
  completedHistoryMode = false,
}) {
  const [
    billingMetric,
    setBillingMetric,
  ] = useState(
    completedHistoryMode ? 'actual' : 'projected'
  );

  const showCombinedSources =
    includeActiveProjects
    && includeBids;

  const showPotentialOnly =
    includeBids
    && !includeActiveProjects;

  const showProbabilityColumn =
    includeBids;

  const sourceModeClass =
    showCombinedSources
      ? 'pivot-source-combined'
      : (
          showPotentialOnly
            ? 'pivot-source-potential'
            : 'pivot-source-active'
        );

  // Completed history is actual-only. No editable PM projection, baseline,
  // or 15th-day variance metrics are offered in this mode.
  const availableBillingMetrics =
    completedHistoryMode
      ? BILLING_METRICS.filter(metric =>
          metric.key === 'actual'
          || (canViewMargin && (metric.key === 'all' || metric.key === 'marginCollected')))
      : showPotentialOnly
      ? BILLING_METRICS.filter(
          metric =>
            metric.key === 'projected'
        )
      : (
          canViewMargin
            ? BILLING_METRICS
            : BILLING_METRICS.filter(
                metric => metric.key !== 'marginCollected'
              )
        );

  useEffect(
    () => {
      if (
        !availableBillingMetrics.some(
          metric =>
            metric.key === billingMetric
        )
      ) {
        setBillingMetric(
          availableBillingMetrics[0]?.key
          || 'projected'
        );
      }
    },
    [
      availableBillingMetrics,
      billingMetric,
    ],
  );


  const [
    sortState,
    setSortState,
  ] = useState({
    key: 'job',
    direction: 'desc',
  });


  function toggleSort(
    key,
    firstDirection = 'asc',
  ) {
    setSortState(
      current => {
        if (current.key !== key) {
          return {
            key,
            direction:
              firstDirection,
          };
        }

        return {
          key,
          direction:
            current.direction === 'asc'
              ? 'desc'
              : 'asc',
        };
      }
    );
  }


  const stickyTableRef =
    useStickyTableHeader(
      `${months.join('|')}|${billingMetric}|${sortState.key}|${sortState.direction}|${includeActiveProjects}|${includeBids}|${showBaseline}`
    );
  const [pivotViewport, setPivotViewport] = useState(null);
  const [metricLabelsPinned, setMetricLabelsPinned] = useState(false);

  const pivotWrapRef = useCallback(node => {
    stickyTableRef(node);
    setPivotViewport(node);
  }, [stickyTableRef]);

  useEffect(() => {
    if (!pivotViewport || billingMetric !== 'all') {
      setMetricLabelsPinned(false);
      return undefined;
    }

    const table = pivotViewport.querySelector('.project-pivot-table');
    const metricColumn = table?.querySelector('thead .pivot-metric-labels-column');
    // Probability is itself frozen in mixed-source views. Pin the metric
    // labels after the last identity field, not over a job or bid number.
    const frozenColumn = table?.querySelector(
      showProbabilityColumn
        ? 'thead .pivot-probability-column'
        : 'thead .pivot-project-column',
    );
    if (!table || !metricColumn || !frozenColumn) {
      return undefined;
    }

    // A live metric-cell bounding rectangle becomes sticky at the boundary.
    // Using it to decide whether to compact creates a feedback loop once the
    // column shrinks and changes the horizontal scroll limit. Measure ONLY
    // the preceding columns, whose widths do not change on compaction.
    const updatePinned = () => {
      const pinThreshold = metricPinThreshold(metricColumn, frozenColumn);
      if (pinThreshold === null) {
        setMetricLabelsPinned(false);
        return;
      }
      const scrollLeft = pivotViewport.scrollLeft;
      const maxScroll = Math.max(0,
        pivotViewport.scrollWidth - pivotViewport.clientWidth);

      setMetricLabelsPinned(current => shouldPinMetricLabels({
        scrollLeft,
        maxScroll,
        pinThreshold,
        isPinned: current,
      }));
    };

    // Observe the table as well as its viewport: responsive column widths and
    // switching between full/compact labels must retain the same threshold.
    pivotViewport.addEventListener('scroll', updatePinned, {passive: true});
    window.addEventListener('resize', updatePinned);
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(updatePinned) : null;
    resizeObserver?.observe(pivotViewport);
    resizeObserver?.observe(table);
    updatePinned();
    return () => {
      pivotViewport.removeEventListener('scroll', updatePinned);
      window.removeEventListener('resize', updatePinned);
      resizeObserver?.disconnect();
    };
  }, [pivotViewport, billingMetric, showProbabilityColumn, months.join('|')]);

  const rows =
    useMemo(
      () => {
        const result = [
          ...currentProjects.map(
            project =>
              currentProjectPivotRow(
                project,
                months,
                currentMonthly.get(
                  project.jobListId
                ),
              )
          ),

          ...bidProjects.map(
            bid =>
              bidPivotRow(
                bid,
                months,
                bidMonthly.get(
                  bid.sharePointItemId
                ),
              )
          ),
        ];


        function compareText(
          a,
          b,
        ) {
          return String(
            a || ''
          ).localeCompare(
            String(
              b || ''
            ),
            undefined,
            {
              numeric: true,
              sensitivity: 'base',
            },
          );
        }


        function compareNumber(
          a,
          b,
        ) {
          const aNumber =
            Number(a);

          const bNumber =
            Number(b);

          const aValid =
            Number.isFinite(
              aNumber
            );

          const bValid =
            Number.isFinite(
              bNumber
            );

          if (!aValid && !bValid) {
            return 0;
          }

          if (!aValid) {
            return 1;
          }

          if (!bValid) {
            return -1;
          }

          return (
            aNumber
            - bNumber
          );
        }


        function billingSortValue(
          row,
          cell,
        ) {
          if (billingMetric === 'all') {
            return completedHistoryMode ? (cell?.actual ?? null) : (cell?.projected ?? 0);
          }

          return (
            cell?.[
              billingMetric
            ]
            ?? null
          );
        }


        result.sort(
          (
            a,
            b,
          ) => {
            let comparison = 0;

            if (
              sortState.key
              === 'source'
            ) {
              comparison =
                compareText(
                  a.sourceLabel,
                  b.sourceLabel,
                );

            } else if (
              sortState.key
              === 'job'
            ) {
              comparison =
                compareNumber(
                  a.number,
                  b.number,
                );

            } else if (
              sortState.key
              === 'project'
            ) {
              comparison =
                compareText(
                  a.name,
                  b.name,
                );

            } else if (
              sortState.key
              === 'gc'
            ) {
              comparison =
                compareText(
                  a.gc,
                  b.gc,
                );

            } else if (
              sortState.key
              === 'probability'
            ) {
              comparison =
                compareNumber(
                  a.raw?.probability,
                  b.raw?.probability,
                );

            } else if (
              sortState.key
              === 'team'
            ) {
              comparison =
                compareText(
                  a.source === 'current'
                    ? [
                        a.raw?.pe,
                        a.raw?.superintendent,
                        a.raw?.apm,
                      ]
                        .filter(Boolean)
                        .join(' ')
                    : '',

                  b.source === 'current'
                    ? [
                        b.raw?.pe,
                        b.raw?.superintendent,
                        b.raw?.apm,
                      ]
                        .filter(Boolean)
                        .join(' ')
                    : '',
                );

            } else if (
              sortState.key
                .startsWith(
                  'month:'
                )
            ) {
              const month =
                sortState.key.slice(
                  6
                );

              comparison =
                compareNumber(
                  billingSortValue(
                    a,
                    a.cells.find(
                      cell =>
                        cell.month
                        === month
                    ),
                  ),

                  billingSortValue(
                    b,
                    b.cells.find(
                      cell =>
                        cell.month
                        === month
                    ),
                  ),
                );

            } else if (
              sortState.key
              === 'total'
            ) {
              comparison =
                compareNumber(
                  billingSortValue(
                    a,
                    a.total,
                  ),

                  billingSortValue(
                    b,
                    b.total,
                  ),
                );
            }

            return (
              sortState.direction
              === 'desc'
                ? -comparison
                : comparison
            );
          }
        );


        return result;
      },
      [
        months,
        currentProjects,
        bidProjects,
        currentMonthly,
        bidMonthly,
        billingMetric,
        sortState,
        completedHistoryMode,
      ],
    );


  const headerMetric =
    headerMetricKey(
      billingMetric
    );


  const monthTotals = useMemo(() => months.map((month, index) => ({ month,
    ...pivotTotals(rows, index, headerMetric, includeBids,
      {month, asOfUTC: varianceAsOfUTC}),
  })), [months, rows, headerMetric, includeBids, varianceAsOfUTC]);
  const grandTotals = useMemo(() => pivotTotals(rows, null, headerMetric, includeBids,
    {months, asOfUTC: varianceAsOfUTC}),
    [rows, months, headerMetric, includeBids, varianceAsOfUTC]);


  return (
    <div
      className={
        `project-pivot-shell pivot-view-${billingMetric}`
      }
    >
      {!showPotentialOnly && (
        <div
          className="project-pivot-toolbar"
          data-sticky-table-controls
        >
          {includeActiveProjects
          && projectionCoverage
          && onProjectionSourceFilterChange && (
            <div
              className="project-pivot-sticky-coverage projection-source-filter-group"
              aria-label="Projection source filter"
            >
              <button
                type="button"
                className={`projection-source-count-toggle ${projectionSourceFilter === projectionSourceAllValue || projectionSourceFilter === 'pm' ? 'active' : ''}`}
                aria-pressed={projectionSourceFilter === projectionSourceAllValue || projectionSourceFilter === 'pm'}
                title="Show projects with a submitted PM Projection"
                onClick={() => onProjectionSourceFilterChange(
                  projectionSourceFilter === 'pm'
                    ? projectionSourceAllValue
                    : 'pm'
                )}
              >
                {projectionCoverage.pm} PM Projection
              </button>

              <span
                className="projection-source-divider"
                aria-hidden="true"
              >
                ·
              </span>

              <button
                type="button"
                className={`projection-source-count-toggle ${projectionSourceFilter === projectionSourceAllValue || projectionSourceFilter === 'missing' ? 'active' : ''}`}
                aria-pressed={projectionSourceFilter === projectionSourceAllValue || projectionSourceFilter === 'missing'}
                title="* No submitted PM Projection"
                onClick={() => onProjectionSourceFilterChange(
                  projectionSourceFilter === 'missing'
                    ? projectionSourceAllValue
                    : 'missing'
                )}
              >
                {projectionCoverage.system} No PM Projection*
              </button>

              <span
                className="projection-source-divider"
                aria-hidden="true"
              >
                ·
              </span>

              <button
                type="button"
                className={`projection-source-count-toggle ${isBalanceReviewFilter(projectionSourceFilter) ? 'active' : ''} ${projectionCoverage.rebalance ? 'rebalance-count' : ''}`}
                aria-pressed={isBalanceReviewFilter(projectionSourceFilter)}
                title={portfolioBalanceAvailable
                  ? 'Show balance reviews, including projects pending Foundation billing'
                  : 'Portfolio balance statuses are loading or unavailable'}
                disabled={!portfolioBalanceAvailable}
                onClick={() => onProjectionSourceFilterChange(
                  projectionSourceFilter === 'rebalance'
                    ? projectionSourceAllValue
                    : 'rebalance'
                )}
              >
                {portfolioBalanceAvailable ? projectionCoverage.rebalance : '—'} Balance Reviews
              </button>
            </div>
          )}

          <span className="project-pivot-toolbar-label">
            Values
          </span>

          <div
            className="project-pivot-metric-toggle"
            role="group"
            aria-label="Project billing values"
          >
            {availableBillingMetrics.map(
              metric => (
                <button
                  type="button"
                  key={metric.key}
                  className={
                    billingMetric
                    === metric.key
                      ? 'active'
                      : undefined
                  }
                  aria-pressed={
                    billingMetric
                    === metric.key
                  }
                  onClick={
                    () =>
                      setBillingMetric(
                        metric.key
                      )
                  }
                >
                  {metric.label}
                </button>
              )
            )}
          </div>

          <div
            className="project-pivot-month-scroll"
            aria-label="Billing month navigation"
          >
            <span
              className="project-pivot-month-scroll-label"
            >
              Months
            </span>

            <button
              type="button"
              className="project-pivot-month-scroll-button"
              data-table-horizontal-scroll-step="-1"
              aria-label="Scroll billing months left"
              title="Previous month"
            >
              ‹
            </button>

            <input
              className="project-pivot-month-scroll-range"
              type="range"
              min="0"
              max="0"
              defaultValue="0"
              step="1"
              data-table-horizontal-scroll
              aria-label="Scroll billing months horizontally"
            />

            <button
              type="button"
              className="project-pivot-month-scroll-button"
              data-table-horizontal-scroll-step="1"
              aria-label="Scroll billing months right"
              title="Next month"
            >
              ›
            </button>
          </div>
        </div>
      )}


      <div
        className="monthly-table-wrap project-pivot-wrap"
        ref={pivotWrapRef}
      >
        <table
          className={
            `monthly-table project-pivot-table pivot-metric-${billingMetric} ${sourceModeClass} ${canViewMargin ? '' : 'pivot-no-margin'} ${completedHistoryMode ? 'pivot-history-only' : ''} ${metricLabelsPinned ? 'pivot-metric-labels-pinned' : ''}`
          }
        >
          <thead>
            <tr>
              {showCombinedSources && (
                <PivotSortHeader
                  label="Source"
                  sortKey="source"
                  sortState={sortState}
                  onSort={toggleSort}
                  className="pivot-source-column"
                />
              )}

              {includeActiveProjects && (
                <PivotSortHeader
                  label="Job #"
                  sortKey="job"
                  sortState={sortState}
                  onSort={toggleSort}
                  firstDirection="desc"
                  className="pivot-job-column"
                />
              )}

              <PivotSortHeader
                label={showPotentialOnly ? 'Potential Project' : (showCombinedSources ? 'Project / Bid' : 'Project')}
                sortKey="project"
                sortState={sortState}
                onSort={toggleSort}
                className="pivot-project-column"
              />

              {showProbabilityColumn && (
                <PivotSortHeader
                  label="Probability"
                  sortKey="probability"
                  sortState={sortState}
                  onSort={toggleSort}
                  firstDirection="desc"
                  className="pivot-probability-column"
                  numeric
                />
              )}

              <th className="pivot-project-values-column">
                Project Values
              </th>

              <PivotSortHeader
                label="GC"
                sortKey="gc"
                sortState={sortState}
                onSort={toggleSort}
                className="pivot-gc-column"
              />


              {billingMetric === 'all' && (
                <th
                  className="pivot-metric-labels-column"
                  title={completedHistoryMode ? 'Actual Billings and Margin Collected'
                    : canViewMargin ? 'Projected, Actual, Variance, Margin Collected'
                      : 'Projected, Actual, Variance'}
                  scope="col"
                >
                  <HeaderMetricRail
                    compact={metricLabelsPinned}
                    showMargin={canViewMargin}
                    includeProjectProjection={includeActiveProjects}
                    includeBidProjection={includeBids}
                    showBaseline={showBaseline}
                    completedHistoryMode={completedHistoryMode}
                  />
                </th>
              )}

              {months.map(
                (
                  month,
                  index,
                ) => (
                  <PivotSortHeader
                    key={month}
                    label={
                      <HeaderTotal
                        label={monthLabel(month)}
                        value={
                          monthTotals[
                            index
                          ]?.value
                        }
                        projectedValue={
                          monthTotals[
                            index
                          ]?.projectedValue
                        }
                        bidProjectedValue={
                          monthTotals[
                            index
                          ]?.bidProjectedValue
                        }
                        actualValue={
                          monthTotals[
                            index
                          ]?.actualValue
                        }
                        marginCollectedValue={monthTotals[index]?.marginCollectedValue}
                        showMargin={canViewMargin}
                        totalForecastValue={
                          monthTotals[
                            index
                          ]?.totalForecastValue
                        }
                        varianceValue={
                          monthTotals[
                            index
                          ]?.varianceValue
                        }
                        actualVarianceValue={monthTotals[index]?.actualVarianceValue}
                        comparableVarianceValue={monthTotals[index]?.comparableVarianceValue}
                        varianceMode={monthTotals[index]?.varianceMode}
                        varianceProjectedValue={monthTotals[index]?.varianceProjectedValue}
                        varianceActualValue={monthTotals[index]?.varianceActualValue}
                        varianceComparableProjects={monthTotals[index]?.varianceComparableProjects}
                        varianceActualProjects={monthTotals[index]?.varianceActualProjects}
                        varianceNoPmForecastProjects={monthTotals[index]?.varianceNoPmForecastProjects}
                        varianceMissingEditableProjects={monthTotals[index]?.varianceMissingEditableProjects}
                        varianceHistoricalUnavailableProjects={monthTotals[index]?.varianceHistoricalUnavailableProjects}
                        missingPmMonths={monthTotals[index]?.missingPmMonths}
                        hasSystemEstimate={monthTotals[index]?.hasSystemEstimate}
                        baselineValue={monthTotals[index]?.baselineValue}
                        showBaseline={showBaseline}
                        metric={billingMetric}
                        currency={currency}
                        activeProjectsBilled={
                          monthTotals[
                            index
                          ]?.activeProjectsBilled
                        }
                        potentialBidsProjected={
                          monthTotals[
                            index
                          ]?.potentialBidsProjected
                        }
                        activeProjectsProjected={monthTotals[index]?.activeProjectsProjected}
                        includeProjectProjection={includeActiveProjects}
                        includeBidProjection={includeBids}
                        completedHistoryMode={completedHistoryMode}
                      />
                    }
                    sortKey={`month:${month}`}
                    sortState={sortState}
                    onSort={toggleSort}
                    firstDirection="desc"
                    className="pivot-month-column"
                    numeric
                  />
                )
              )}

              <PivotSortHeader
                label={
                  <HeaderTotal
                    label="Total"
                    value={grandTotals.value}
                    projectedValue={
                      grandTotals.projectedValue
                    }
                    bidProjectedValue={
                      grandTotals.bidProjectedValue
                    }
                    actualValue={
                      grandTotals.actualValue
                    }
                    marginCollectedValue={grandTotals.marginCollectedValue}
                    showMargin={canViewMargin}
                    totalForecastValue={
                      grandTotals.totalForecastValue
                    }
                    varianceValue={
                      grandTotals.varianceValue
                    }
                    actualVarianceValue={grandTotals.actualVarianceValue}
                    comparableVarianceValue={grandTotals.comparableVarianceValue}
                    varianceMode={grandTotals.varianceMode}
                    comparisonScope="project-months"
                    varianceProjectedValue={grandTotals.varianceProjectedValue}
                    varianceActualValue={grandTotals.varianceActualValue}
                    varianceComparableProjects={grandTotals.varianceComparableProjects}
                    varianceActualProjects={grandTotals.varianceActualProjects}
                    varianceNoPmForecastProjects={grandTotals.varianceNoPmForecastProjects}
                    varianceMissingEditableProjects={grandTotals.varianceMissingEditableProjects}
                    varianceHistoricalUnavailableProjects={grandTotals.varianceHistoricalUnavailableProjects}
                    missingPmMonths={grandTotals.missingPmMonths}
                    hasSystemEstimate={grandTotals.hasSystemEstimate}
                    baselineValue={grandTotals.baselineValue}
                    showBaseline={showBaseline}
                    metric={billingMetric}
                    currency={currency}
                    includeProjectProjection={includeActiveProjects}
                    includeBidProjection={includeBids}
                    completedHistoryMode={completedHistoryMode}
                    activeProjectsBilled={grandTotals.activeProjectsBilled}
                    activeProjectsProjected={grandTotals.activeProjectsProjected}
                    potentialBidsProjected={grandTotals.potentialBidsProjected}
                  />
                }
                sortKey="total"
                sortState={sortState}
                onSort={toggleSort}
                firstDirection="desc"
                className="pivot-total-column"
                numeric
              />
            </tr>
          </thead>


          <tbody>
            {rows.map(
              row => {
                const totalCell = {
                  ...row.total,

                  hasActivity:
                    row.total.projected != null
                    || row.total.actual != null
                    || row.total.marginCollected !== null,
                };

                return (
                  <tr
                    key={row.key}
                    className="pivot-project-row clickable-project-row"
                    onClick={
                      event => {
                        if (
                          row.source === 'current'
                        ) {
                          onSelectCurrentProject(
                            row.raw,
                            event.target.closest('[data-needs-rebalance], [data-schedule-review]')
                              ? 'pm-forecast'
                              : null,
                          );
                        } else {
                          onSelectBidProject?.(
                            row.raw
                          );
                        }
                      }
                    }
                    onKeyDown={
                      event => {
                        if (
                          event.key === 'Enter'
                          || event.key === ' '
                        ) {
                          event.preventDefault();

                          if (
                            row.source === 'current'
                          ) {
                            onSelectCurrentProject(
                              row.raw
                            );
                          } else {
                            onSelectBidProject?.(
                              row.raw
                            );
                          }
                        }
                      }
                    }
                    role="button"
                    tabIndex={0}
                  >
                    {showCombinedSources && (
                      <td className="pivot-source-column">
                        <span
                          className={
                            row.source === 'current'
                              ? (
                                  row.raw?.projectCompleted
                                    ? 'source-chip completed'
                                    : 'source-chip current'
                                )
                              : 'source-chip bid'
                          }
                        >
                          {row.sourceLabel}
                        </span>
                      </td>
                    )}

                    {includeActiveProjects && (
                      <td className="pivot-job-column">
                        {row.number}
                      </td>
                    )}

                    <td className="pivot-project-column">
                      <ProjectMeta
                        row={row}
                        onOpenBalanceReview={() => onSelectCurrentProject(row.raw, 'pm-forecast')}
                        onBalanceReviewQuickFilter={onBalanceReviewQuickFilter}
                        selectedQuickFilter={projectionSourceFilter}
                        historicalOnly={completedHistoryMode}
                      />
                    </td>

                    {showProbabilityColumn && (
                      <td className="numeric pivot-probability-column">
                        {row.raw?.probability === null
                          || row.raw?.probability === undefined
                            ? '—'
                            : `${Math.round(Number(row.raw.probability) * 100)}%`}
                      </td>
                    )}

                    <td className="pivot-project-values-column">
                      <ProjectValuesCell row={row} />
                    </td>

                    <td className="pivot-gc-column">
                      <GeneralContractorDisplay
                        value={
                          row.raw?.generalContractors
                          || row.raw?.gc
                        }
                        compact
                      />
                    </td>


                    {billingMetric === 'all' && (
                      <td className="pivot-metric-labels-column">
                        <MetricLabels compact={metricLabelsPinned} showMargin={canViewMargin}
                          completedHistoryMode={completedHistoryMode} />
                      </td>
                    )}

                    {row.cells.map(
                      cell => (
                        <td
                          className="numeric pivot-month-column"
                          key={cell.month}
                        >
                          <BillingValue
                            cell={cell}
                            metric={billingMetric}
                            currency={currency}
                            source={row.source}
                            showBaseline={showBaseline}
                            showMargin={canViewMargin}
                            completedHistoryMode={completedHistoryMode}
                          />
                        </td>
                      )
                    )}

                    <td className="numeric pivot-total-column">
                      <BillingValue
                        cell={totalCell}
                        metric={billingMetric}
                        currency={currency}
                        source={row.source}
                        showBaseline={showBaseline}
                        showMargin={canViewMargin}
                        completedHistoryMode={completedHistoryMode}
                      />
                    </td>
                  </tr>
                );
              }
            )}


            {!rows.length && (
              <tr>
                <td
                  className="empty-cell"
                  colSpan={
                    months.length
                    + 4
                    + (showCombinedSources ? 1 : 0)
                    + (includeActiveProjects ? 1 : 0)
                    + (showProbabilityColumn ? 1 : 0)
                    + (billingMetric === 'all' ? 1 : 0)
                  }
                >
                  No projects match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
