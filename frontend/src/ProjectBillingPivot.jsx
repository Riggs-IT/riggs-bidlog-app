import {
  useMemo,
  useState,
} from 'react';

import useStickyTableHeader from './useStickyTableHeader.js';


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
      'Active',

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

    gc:
      displayText(
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

    gc:
      displayText(
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
      <strong className="pivot-project-name">
        {row.name}
      </strong>

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

        <span className="pivot-pm-initials">
          {row.pmInitials}
        </span>
      </div>

      <div
        className="pivot-project-gc"
        title={`GC: ${row.gc}`}
      >
        {row.gc}
      </div>
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
        label="Projected"
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


function BillingValue({
  cell,
  metric,
  currency,
}) {
  if (metric === 'all') {
    return (
      <AllBillingValues
        cell={cell}
        currency={currency}
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


export default function ProjectBillingPivot({
  months,
  currentProjects,
  bidProjects,
  currentMonthly,
  bidMonthly,
  currency,
  monthLabel,
  onSelectCurrentProject,
}) {
  const [
    billingMetric,
    setBillingMetric,
  ] = useState(
    'projected'
  );

  const stickyTableRef =
    useStickyTableHeader(
      `${months.join('|')}|${billingMetric}`
    );

  const rows =
    useMemo(
      () => [
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
      ],
      [
        months,
        currentProjects,
        bidProjects,
        currentMonthly,
        bidMonthly,
      ],
    );


  return (
    <div
      className={
        `project-pivot-shell pivot-view-${billingMetric}`
      }
    >
      <div
        className="project-pivot-toolbar"
        data-sticky-table-controls
      >
        <span className="project-pivot-toolbar-label">
          Show
        </span>

        <div
          className="project-pivot-metric-toggle"
          role="group"
          aria-label="Project billing values"
        >
          {BILLING_METRICS.map(
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
      </div>


      <div
        className="monthly-table-wrap project-pivot-wrap"
        ref={stickyTableRef}
      >
        <table
          className={
            `monthly-table project-pivot-table pivot-metric-${billingMetric}`
          }
        >
          <thead>
            <tr>
              <th className="pivot-source-column">
                Source
              </th>

              <th className="pivot-job-column">
                Job #
              </th>

              <th className="pivot-project-column">
                Project / Bid
              </th>

              {months.map(
                month => (
                  <th
                    className="numeric pivot-month-column"
                    key={month}
                  >
                    {monthLabel(month)}
                  </th>
                )
              )}

              <th className="numeric pivot-total-column">
                Total
              </th>
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
                    className={
                      row.source === 'current'
                        ? 'pivot-project-row clickable-project-row'
                        : 'pivot-project-row'
                    }
                    onClick={
                      row.source === 'current'
                        ? () =>
                            onSelectCurrentProject(
                              row.raw
                            )
                        : undefined
                    }
                    onKeyDown={
                      row.source === 'current'
                        ? event => {
                            if (
                              event.key === 'Enter'
                              || event.key === ' '
                            ) {
                              event.preventDefault();

                              onSelectCurrentProject(
                                row.raw
                              );
                            }
                          }
                        : undefined
                    }
                    role={
                      row.source === 'current'
                        ? 'button'
                        : undefined
                    }
                    tabIndex={
                      row.source === 'current'
                        ? 0
                        : undefined
                    }
                  >
                    <td className="pivot-source-column">
                      <span
                        className={
                          row.source === 'current'
                            ? 'source-chip current'
                            : 'source-chip bid'
                        }
                      >
                        {row.sourceLabel}
                      </span>
                    </td>

                    <td className="pivot-job-column">
                      {row.number}
                    </td>

                    <td className="pivot-project-column">
                      <ProjectMeta
                        row={row}
                      />
                    </td>

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
                          />
                        </td>
                      )
                    )}

                    <td className="numeric pivot-total-column">
                      <BillingValue
                        cell={totalCell}
                        metric={billingMetric}
                        currency={currency}
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
                    months.length + 4
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
