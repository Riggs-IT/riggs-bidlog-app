import {
  useMemo,
} from 'react';

import useStickyTableHeader from './useStickyTableHeader.js';


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


function currentProjectPivotRow(
  project,
  months,
  rows,
) {
  const indexed = monthlyIndex(
    rows
  );

  const cells = months.map(
    month => {
      const row = indexed.get(
        month
      );

      if (!row) {
        return {
          month,
          hasActivity: false,
          projected: null,
          actual: null,
          variance: null,
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
      };
    }
  );

  return {
    key:
      `pivot-current-${project.jobListId}`,
    source: 'current',
    sourceLabel: 'Active',
    number:
      project.jobNumber || '—',
    name:
      project.jobName || 'Unnamed project',
    secondary:
      project.pm || 'No PM Assigned',
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
    },
    raw: project,
  };
}


function bidPivotRow(
  bid,
  months,
  rows,
) {
  const indexed = monthlyIndex(
    rows
  );

  const cells = months.map(
    month => {
      const row = indexed.get(
        month
      );

      if (!row) {
        return {
          month,
          hasActivity: false,
          projected: null,
          actual: null,
          variance: null,
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
        actual: null,
        variance: null,
      };
    }
  );

  return {
    key:
      `pivot-bid-${bid.sharePointItemId}`,
    source: 'bid',
    sourceLabel: 'Bid',
    number: '—',
    name:
      bid.bidName || 'Unnamed bid',
    secondary:
      bid.pm || 'No PM Assigned',
    cells,
    total: {
      projected:
        toNumber(
          bid.selectedWeightedForecast
        ),
      actual: null,
      variance: null,
    },
    raw: bid,
  };
}


function varianceClass(value) {
  if (value === null) {
    return '';
  }

  if (value > 0) {
    return 'variance-positive';
  }

  if (value < 0) {
    return 'variance-negative';
  }

  return '';
}


function BillingCell({
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
      <span>
        <small>Projected</small>

        <strong>
          {currency(
            cell.projected
          )}
        </strong>
      </span>

      <span>
        <small>Actual</small>

        <strong>
          {cell.actual === null
            ? '—'
            : currency(
                cell.actual
              )}
        </strong>
      </span>

      <span
        className={
          varianceClass(
            cell.variance
          )
        }
      >
        <small>Variance</small>

        <strong>
          {cell.variance === null
            ? '—'
            : currency(
                cell.variance
              )}
        </strong>
      </span>
    </div>
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
  const stickyTableRef =
    useStickyTableHeader(
      months.join('|')
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
      className="monthly-table-wrap project-pivot-wrap"
      ref={stickyTableRef}
    >
      <table className="monthly-table project-pivot-table">
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
            row => (
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

                <td className="project-cell pivot-project-column">
                  <strong>
                    {row.name}
                  </strong>

                  <span>
                    {row.secondary}
                  </span>
                </td>

                {row.cells.map(
                  cell => (
                    <td
                      className="numeric pivot-month-column"
                      key={cell.month}
                    >
                      <BillingCell
                        cell={cell}
                        currency={currency}
                      />
                    </td>
                  )
                )}

                <td className="numeric pivot-total-column">
                  <BillingCell
                    cell={{
                      ...row.total,
                      hasActivity:
                        row.total.projected !== 0
                        || row.total.actual !== null,
                    }}
                    currency={currency}
                  />
                </td>
              </tr>
            )
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
  );
}
