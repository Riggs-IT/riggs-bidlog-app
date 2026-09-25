import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import useStickyTableHeader from './useStickyTableHeader.js';
import { ProjectTeamCell } from './BillingDisplay.jsx';
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
            row.projectedAmount
          );

        const hasActual =
          row.actualAmount !== null
          && row.actualAmount !== undefined;

        const actual =
          hasActual
            ? toNumber(
                row.actualAmount
              )
            : null;

        const marginCollected =
          row.marginCollected === null
          || row.marginCollected === undefined
            ? null
            : toNumber(
                row.marginCollected
              );

        return {
          month,

          hasActivity:
            projected !== 0
            || hasActual,

          projected,

          actual,

          variance:
            hasActual
              ? actual - projected
              : null,

          marginCollected,
        };
      }
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
      project.projectCompleted
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
        label: 'Contract',
        value:
          wholeCurrencyLabel(
            project.originalContractAmount
            ?? project.effectiveAmount
          ) || '—',
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

    total: {
      projected:
        toNumber(
          project.selectedProjected
        ),

      actual:
        toNumber(
          project.selectedActual
        ),

      variance:
        toNumber(
          project.selectedVariance
        ),

      marginCollected:
        toNumber(
          project.selectedMarginCollected
        ),
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
}) {
  return (
    <div className="pivot-project-info">
      <div className="pivot-project-name-line">
        <strong className="pivot-project-name">
          {row.name}
        </strong>

        {row.raw?.projectCompleted && (
          <span className="project-completed-pill">
            Completed
          </span>
        )}
      </div>

      <div
        className="pivot-project-pm-line"
        title={`PM: ${row.pmName}`}
      >
        <span
          className="pivot-pm-color-dot"
          style={{
            backgroundColor:
              normalizedPmColor(
                row.pmHexColor
              ),
          }}
          aria-hidden="true"
        />

        <span className="pivot-project-role-label">
          PM
        </span>

        <span className="pivot-pm-initials">
          {row.pmInitials}
        </span>
      </div>

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


function BillingLine({
  label,
  metric,
  value,
  currency,
}) {
  return (
    <span
      className={
        `pivot-billing-line ${
          metricClass(
            metric,
            value,
          )
        }`
      }
    >
      <small>
        {label}
      </small>

      <strong>
        {value === null
          || value === undefined
            ? '—'
            : currency(value)}
      </strong>
    </span>
  );
}


function AllBillingValues({
  cell,
  currency,
  source,
}) {
  if (!cell.hasActivity) {
    return (
      <span className="pivot-empty-value">
        —
      </span>
    );
  }

  return (
    <div className="pivot-billing-cell">
      <BillingLine
        label={source === 'bid' ? 'Bids' : 'Projected'}
        metric="projected"
        value={cell.projected}
        currency={currency}
      />

      <BillingLine
        label="Actual"
        metric="actual"
        value={cell.actual}
        currency={currency}
      />

      <BillingLine
        label="Variance"
        metric="variance"
        value={cell.variance}
        currency={currency}
      />

      <BillingLine
        label="Margin"
        metric="marginCollected"
        value={cell.marginCollected}
        currency={currency}
      />
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


function BillingValue({
  cell,
  metric,
  currency,
  source,
}) {
  if (metric === 'all') {
    return (
      <AllBillingValues
        cell={cell}
        currency={currency}
        source={source}
      />
    );
  }

  return (
    <SingleBillingValue
      cell={cell}
      metric={metric}
      currency={currency}
    />
  );
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


function HeaderTotal({
  label,
  value,
  projectedValue = null,
  bidProjectedValue = null,
  actualValue = null,
  metric,
  currency,
  activeProjectsBilled = null,
  potentialBidsProjected = null,
  includeProjectProjection = true,
  includeBidProjection = true,
}) {
  const allMode =
    metric === 'all';

  const actualMode =
    metric === 'actual';

  const projectedMode =
    metric === 'projected';

  const varianceMode =
    metric === 'variance';

  const marginMode =
    metric === 'marginCollected';

  const hasBidProjection =
    includeBidProjection
    && bidProjectedValue !== null
    && bidProjectedValue !== undefined;

  const projectBilledText =
    activeProjectsBilled !== null
    && activeProjectsBilled > 0
      ? `${activeProjectsBilled} ${
          activeProjectsBilled === 1
            ? 'project billed'
            : 'projects billed'
        }`
      : null;

  const bidsProjectedText =
    potentialBidsProjected !== null
    && potentialBidsProjected > 0
      ? `${potentialBidsProjected} ${
          potentialBidsProjected === 1
            ? 'bid projected'
            : 'bids projected'
        }`
      : null;

  const showSplitProjection =
    allMode
    || projectedMode;

  return (
    <span className="pivot-header-total">
      <span className="pivot-header-total-label">
        {label}
      </span>

      {showSplitProjection ? (
        <span
          className="pivot-header-total-values"
          title={
            [
              includeProjectProjection
                ? `Project projection: ${currency(projectedValue ?? 0)}`
                : null,
              hasBidProjection
                ? `Bid projection: ${currency(bidProjectedValue ?? 0)}`
                : null,
              allMode
                ? `Actual: ${currency(actualValue ?? 0)}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')
          }
        >
          {includeProjectProjection && (
            <small className="pivot-header-total-value">
              P {headerCurrency(projectedValue)}
            </small>
          )}

          {hasBidProjection && (
            <small className="pivot-header-total-value pivot-header-total-value-bid">
              B {headerCurrency(bidProjectedValue)}
            </small>
          )}

          {allMode && (
            <small className="pivot-header-total-value pivot-header-total-value-actual">
              A {headerCurrency(actualValue)}
            </small>
          )}
        </span>
      ) : (
        <small
          className="pivot-header-total-value"
          title={
            value === null
            || value === undefined
              ? 'No value for the selected metric.'
              : `Column total: ${currency(value)}`
          }
        >
          {actualMode
          && value !== null
          && value !== undefined
            ? 'A '
            : ''}

          {varianceMode
          && value !== null
          && value !== undefined
            ? 'V '
            : ''}

          {marginMode
          && value !== null
          && value !== undefined
            ? 'M '
            : ''}

          {headerCurrency(value)}
        </small>
      )}

      {(projectBilledText || bidsProjectedText) && (
        <span className="pivot-header-activity-counts">
          {projectBilledText && (
            <small
              className="pivot-header-billed-count"
              title={`${projectBilledText} in this month`}
            >
              {projectBilledText}
            </small>
          )}

          {projectBilledText && bidsProjectedText && (
            <span
              className="pivot-header-activity-separator"
              aria-hidden="true"
            >
              ·
            </span>
          )}

          {bidsProjectedText && (
            <small
              className="pivot-header-billed-count pivot-header-bid-count"
              title={`${bidsProjectedText} in this month`}
            >
              {bidsProjectedText}
            </small>
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
  onSelectCurrentProject,
  onSelectBidProject,
  canViewMargin = false,
  includeActiveProjects = true,
  includeBids = true,
}) {
  const [
    billingMetric,
    setBillingMetric,
  ] = useState(
    'projected'
  );

  const showCombinedSources =
    includeActiveProjects
    && includeBids;

  const showPotentialOnly =
    includeBids
    && !includeActiveProjects;

  const sourceModeClass =
    showCombinedSources
      ? 'pivot-source-combined'
      : (
          showPotentialOnly
            ? 'pivot-source-potential'
            : 'pivot-source-active'
        );

  const availableBillingMetrics =
    showPotentialOnly
      ? BILLING_METRICS.filter(
          metric =>
            metric.key === 'projected'
        )
      : (
          canViewMargin
            ? BILLING_METRICS
            : BILLING_METRICS.filter(
                metric =>
                  metric.key !== 'marginCollected'
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
      `${months.join('|')}|${billingMetric}|${sortState.key}|${sortState.direction}|${includeActiveProjects}|${includeBids}`
    );

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
            return (
              cell?.projected
              ?? 0
            );
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
      ],
    );


  const headerMetric =
    headerMetricKey(
      billingMetric
    );


  const monthTotals =
    useMemo(
      () =>
        months.map(
          (
            month,
            index,
          ) => {
            let hasValue =
              headerMetric
              === 'projected';

            let hasActualValue = false;

            const totals =
              rows.reduce(
                (
                  current,
                  row,
                ) => {
                  const cell =
                    row.cells[index];

                  const cellValue =
                    cell?.[
                      headerMetric
                    ];

                  if (
                    cellValue !== null
                    && cellValue !== undefined
                  ) {
                    hasValue = true;
                    current.value +=
                      toNumber(cellValue);
                  }

                  if (row.source === 'bid') {
                    current.bidProjectedValue +=
                      toNumber(
                        cell?.projected
                      );

                    if (
                      cell?.hasActivity
                      && toNumber(cell?.projected) !== 0
                    ) {
                      current.potentialBidsProjected += 1;
                    }
                  } else {
                    current.projectedValue +=
                      toNumber(
                        cell?.projected
                      );
                  }

                  if (
                    cell?.actual !== null
                    && cell?.actual !== undefined
                  ) {
                    hasActualValue = true;
                    current.actualValue +=
                      toNumber(
                        cell.actual
                      );
                  }

                  return current;
                },
                {
                  value: 0,
                  projectedValue: 0,
                  bidProjectedValue: 0,
                  actualValue: 0,
                  potentialBidsProjected: 0,
                },
              );

            const activeProjectsBilled =
              includeActiveProjects
                ? rows.reduce(
                    (
                      count,
                      row,
                    ) => {
                      if (row.source !== 'current') {
                        return count;
                      }

                      const actual =
                        row.cells[index]?.actual;

                      if (
                        actual === null
                        || actual === undefined
                        || toNumber(actual) === 0
                      ) {
                        return count;
                      }

                      return count + 1;
                    },
                    0,
                  )
                : null;

            return {
              month,

              value:
                hasValue
                  ? totals.value
                  : null,

              projectedValue:
                totals.projectedValue,

              bidProjectedValue:
                includeBids
                && totals.potentialBidsProjected > 0
                  ? totals.bidProjectedValue
                  : null,

              actualValue:
                hasActualValue
                  ? totals.actualValue
                  : null,

              activeProjectsBilled,

              potentialBidsProjected:
                includeBids
                  ? totals.potentialBidsProjected
                  : null,
            };
          }
        ),
      [
        months,
        rows,
        headerMetric,
        includeActiveProjects,
        includeBids,
      ],
    );


  const grandTotals =
    useMemo(
      () => {
        let hasValue =
          headerMetric
          === 'projected';

        let hasActualValue = false;

        const totals =
          rows.reduce(
            (
              current,
              row,
            ) => {
              const totalValue =
                row.total?.[
                  headerMetric
                ];

              if (
                totalValue !== null
                && totalValue !== undefined
              ) {
                hasValue = true;
                current.value +=
                  toNumber(
                    totalValue
                  );
              }

              if (row.source === 'bid') {
                current.bidProjectedValue +=
                  toNumber(
                    row.total?.projected
                  );
              } else {
                current.projectedValue +=
                  toNumber(
                    row.total?.projected
                  );
              }

              if (
                row.total?.actual !== null
                && row.total?.actual !== undefined
              ) {
                hasActualValue = true;
                current.actualValue +=
                  toNumber(
                    row.total.actual
                  );
              }

              return current;
            },
            {
              value: 0,
              projectedValue: 0,
              bidProjectedValue: 0,
              actualValue: 0,
            },
          );

        const hasBidProjectedValue =
          includeBids
          && rows.some(
            row =>
              row.source === 'bid'
              && toNumber(row.total?.projected) !== 0
          );

        return {
          value:
            hasValue
              ? totals.value
              : null,

          projectedValue:
            totals.projectedValue,

          bidProjectedValue:
            hasBidProjectedValue
              ? totals.bidProjectedValue
              : null,

          actualValue:
            hasActualValue
              ? totals.actualValue
              : null,
        };
      },
      [
        rows,
        headerMetric,
        includeBids,
      ],
    );


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
        ref={stickyTableRef}
      >
        <table
          className={
            `monthly-table project-pivot-table pivot-metric-${billingMetric} ${sourceModeClass}`
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

              {showPotentialOnly && (
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

              {includeActiveProjects && (
                <PivotSortHeader
                  label="Team"
                  sortKey="team"
                  sortState={sortState}
                  onSort={toggleSort}
                  className="pivot-team-column"
                />
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
                        includeProjectProjection={includeActiveProjects}
                        includeBidProjection={includeBids}
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
                    metric={billingMetric}
                    currency={currency}
                    includeProjectProjection={includeActiveProjects}
                    includeBidProjection={includeBids}
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
                    row.total.projected !== 0
                    || row.total.actual !== null
                    || row.total.marginCollected !== null,
                };

                return (
                  <tr
                    key={row.key}
                    className="pivot-project-row clickable-project-row"
                    onClick={
                      () => {
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
                      />
                    </td>

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

                    {showPotentialOnly && (
                      <td className="numeric pivot-probability-column">
                        {row.raw?.probability === null
                          || row.raw?.probability === undefined
                            ? '—'
                            : `${Math.round(Number(row.raw.probability) * 100)}%`}
                      </td>
                    )}

                    {includeActiveProjects && (
                      <td className="pivot-team-column">
                        <ProjectTeamCell
                          pe={
                            row.source === 'current'
                              ? row.raw?.pe
                              : null
                          }
                          superintendent={
                            row.source === 'current'
                              ? row.raw?.superintendent
                              : null
                          }
                          apm={
                            row.source === 'current'
                              ? row.raw?.apm
                              : null
                          }
                        />
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
                    + 3
                    + (showCombinedSources ? 1 : 0)
                    + (includeActiveProjects ? 2 : 0)
                    + (showPotentialOnly ? 1 : 0)
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
