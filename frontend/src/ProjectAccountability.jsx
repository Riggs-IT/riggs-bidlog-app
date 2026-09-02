import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import CompletedProjectBillingDrawer
  from './CompletedProjectBillingDrawer.jsx';
import {
  commercialSourceLabel,
  moneyDifference,
  MoneyValue,
  retentionLabel,
  retentionNumber,
} from './BillingDisplay.jsx';


const ALL = '__ALL__';
const UNASSIGNED = '__UNASSIGNED__';


function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}


function dateLabel(value) {
  if (!value) {
    return '—';
  }

  const text =
    String(value).slice(
      0,
      10,
    );

  const date = new Date(
    `${text}T12:00:00`,
  );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return text;
  }

  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    },
  ).format(date);
}


function containsText(
  value,
  search,
) {
  return String(
    value || '',
  )
    .toLowerCase()
    .includes(
      search
    );
}


function displayValue(
  value,
  fallback = '—',
) {
  const text = String(
    value ?? '',
  ).trim();

  return text || fallback;
}


function pmKey(value) {
  const text = String(
    value || '',
  ).trim();

  return (
    text
    || UNASSIGNED
  );
}


function pmLabel(value) {
  return (
    value === UNASSIGNED
      ? 'No PM Assigned'
      : value
  );
}


function sourceShortLabel(value) {
  const labels = {
    OPERATIONS_PLANNED_START:
      'Ops',

    OPERATIONS_ANTICIPATED_START:
      'Ops',

    OPERATIONS_COMPLETION:
      'Ops',

    FOUNDATION_BILLING_DERIVED:
      'Foundation',

    OPERATIONS:
      'Operations',

    MIXED:
      'Mixed',

    INVALID_DATE_RANGE:
      'Invalid',

    INCOMPLETE:
      'Incomplete',
  };

  return (
    labels[value]
    || value
    || '—'
  );
}


async function fetchJson(path) {
  const response = await window.fetch(
    path,
    {
      credentials: 'same-origin',
    },
  );

  if (response.ok) {
    return response.json();
  }

  let detail =
    'data_api_unavailable';

  try {
    const payload =
      await response.json();

    detail =
      payload?.detail
      || detail;
  } catch {
    // Keep default.
  }

  const labels = {
    data_api_cloudflare_access_rejected:
      'Cloudflare Access rejected the Bid Log application credentials.',

    data_api_bid_log_service_auth_rejected:
      'The Riggs Data API rejected the Bid Log application credential.',

    sql_capacity_unavailable:
      'RiggsDataHub is temporarily at connection capacity.',

    sql_unavailable:
      'RiggsDataHub is temporarily unavailable.',

    data_api_unavailable:
      'The Riggs Data API is temporarily unavailable.',

    data_api_not_configured:
      'The Bid Log Data API client is not fully configured.',

    invalid_data_api_response:
      'The Riggs Data API returned an unexpected response.',
  };

  throw new Error(
    labels[detail]
    || detail
    || 'Unable to load completed projects.',
  );
}


function StatCard({
  label,
  value,
  detail,
  emphasis = false,
  tone = '',
}) {
  const classes = [
    'stat-card',
    emphasis
      ? 'emphasis'
      : '',
    tone
      ? `tone-${tone}`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={classes}>
      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

      <small>
        {detail}
      </small>
    </article>
  );
}


function dataStateLabel(value) {
  const labels = {
    NO_BID_LINK:
      'No Bid Link',

    PARTIAL_ESTIMATOR_DATA:
      'Partial Estimator Data',

    HISTORICAL_ESTIMATOR_DATA:
      'Estimator Data',

    MISSING_ESTIMATOR_DATA:
      'Estimator Data Missing',
  };

  return (
    labels[value]
    || value
    || 'Unknown'
  );
}


export default function ProjectAccountability({
  user,
}) {
  const [rows, setRows] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);

  const [selectedProject, setSelectedProject] =
    useState(null);

  const [search, setSearch] =
    useState('');

  const [pmFilter, setPmFilter] =
    useState(ALL);

  const [typeFilter, setTypeFilter] =
    useState(ALL);

  const [purposeFilter, setPurposeFilter] =
    useState(ALL);

  const [dataFilter, setDataFilter] =
    useState(ALL);


  const isAdmin =
    String(
      user?.appRole
      || ''
    ).toUpperCase()
    === 'ADMIN';


  useEffect(() => {
    let cancelled = false;

    async function loadCompletedProjects() {
      setLoading(true);
      setError(null);

      try {
        const payload =
          await fetchJson(
            '/api/completed-projects',
          );

        if (
          !cancelled
          && Array.isArray(
            payload
          )
        ) {
          setRows(
            payload
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError.message
            || 'Unable to load completed projects.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCompletedProjects();

    return () => {
      cancelled = true;
    };
  }, []);


  const pmOptions = useMemo(
    () => [
      ...new Set(
        rows.map(
          row => pmKey(
            row.projectManager
          ),
        ),
      ),
    ].sort(
      (
        a,
        b,
      ) => (
        pmLabel(a)
          .localeCompare(
            pmLabel(b)
          )
      ),
    ),
    [rows],
  );


  const typeOptions = useMemo(
    () => [
      ...new Set(
        rows
          .map(
            row => String(
              row.projectType
              || ''
            ).trim()
          )
          .filter(Boolean),
      ),
    ].sort(),
    [rows],
  );


  const purposeOptions = useMemo(
    () => [
      ...new Set(
        rows
          .map(
            row => String(
              row.purpose
              || ''
            ).trim()
          )
          .filter(Boolean),
      ),
    ].sort(),
    [rows],
  );


  const metrics = useMemo(
    () => {
      const contract =
        rows.reduce(
          (
            total,
            row,
          ) => (
            total
            + toNumber(
                row.contractAmount
              )
          ),
          0,
        );

      const billed =
        rows.reduce(
          (
            total,
            row,
          ) => (
            total
            + toNumber(
                row.foundationActualTotal
              )
          ),
          0,
        );

      const historicalEstimates =
        rows.filter(
          row => (
            row.estimatorEstimatedAmount
              !== null
            && row.estimatorEstimatedAmount
              !== undefined
          ),
        ).length;

      return {
        total:
          rows.length,

        contract,
        billed,

        actualVsContract:
          billed - contract,

        historicalEstimates,
      };
    },
    [rows],
  );


  const filteredRows = useMemo(
    () => {
      const normalizedSearch =
        search
          .trim()
          .toLowerCase();

      return rows
        .filter(
          row => {
            if (
              pmFilter !== ALL
              && pmKey(
                row.projectManager
              ) !== pmFilter
            ) {
              return false;
            }

            if (
              typeFilter !== ALL
              && row.projectType
                 !== typeFilter
            ) {
              return false;
            }

            if (
              purposeFilter !== ALL
              && row.purpose
                 !== purposeFilter
            ) {
              return false;
            }

            if (
              dataFilter === 'foundation'
              && !(
                row.foundationDerivedStart
                || row.foundationDerivedEnd
              )
            ) {
              return false;
            }

            if (
              dataFilter === 'estimator-missing'
              && !row.missingEstimatorBidLink
            ) {
              return false;
            }

            if (
              dataFilter === 'estimator-present'
              && row.missingEstimatorBidLink
            ) {
              return false;
            }

            if (
              dataFilter === 'invalid'
              && !row.invalidResolvedDateRange
            ) {
              return false;
            }

            if (
              normalizedSearch
              && ![
                row.jobNumber,
                row.jobName,
                row.projectManager,
                row.projectEngineer,
                row.superintendent,
                row.generalContractor,
                row.projectType,
                row.purpose,
                row.primaryEstimator,
                row.secondaryEstimator,
              ].some(
                value => (
                  containsText(
                    value,
                    normalizedSearch,
                  )
                ),
              )
            ) {
              return false;
            }

            return true;
          },
        )
        .sort(
          (
            a,
            b,
          ) => (
            toNumber(
              b.jobNumber
            )
            -
            toNumber(
              a.jobNumber
            )
          ),
        );
    },
    [
      rows,
      search,
      pmFilter,
      typeFilter,
      purposeFilter,
      dataFilter,
    ],
  );


  function resetFilters() {
    setSearch('');
    setPmFilter(ALL);
    setTypeFilter(ALL);
    setPurposeFilter(ALL);
    setDataFilter(ALL);
  }


  return (
    <main className="page-shell completed-projects-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            HISTORICAL PERFORMANCE
          </div>

          <h1>
            Completed Projects
          </h1>

          <p>
            Review original contract values, actual billings,
            completed-project performance, and available
            historical estimating information.
          </p>
        </div>

        <div className="heading-actions">
          <span className="role-chip">
            {user.appRole}
          </span>
        </div>
      </div>


      {error && (
        <div
          className="page-alert"
          role="alert"
        >
          <strong>
            Completed projects could not be loaded.
          </strong>

          <span>
            {error}
          </span>
        </div>
      )}


      {loading && (
        <div className="loading-panel">
          <div>
            <strong>
              Loading completed projects…
            </strong>
          </div>
        </div>
      )}


      <section className="stats-grid completed-project-stats">
        <StatCard
          label="Completed Projects"
          value={
            metrics.total.toLocaleString(
              'en-US'
            )
          }
          detail="Completed non-side projects"
          emphasis
        />

        <StatCard
          label="Original Contract Value"
          value={
            <MoneyValue
              value={
                metrics.contract
              }
            />
          }
          detail="Foundation original contract"
        />

        <StatCard
          label="Actual Billings"
          value={
            <MoneyValue
              value={
                metrics.billed
              }
            />
          }
          detail="Posted Foundation billings"
        />

        <StatCard
          label="Actual vs Original Contract"
          value={
            <MoneyValue
              value={
                metrics.actualVsContract
              }
            />
          }
          detail="Actual billings less original contract"
        />

        <StatCard
          label="Historical Estimates"
          value={
            metrics.historicalEstimates
              .toLocaleString(
                'en-US'
              )
          }
          detail="Projects with historical estimate amount"
        />
      </section>


      <section className="content-card completed-project-card">
        <div className="section-heading">
          <div>
            <span className="section-kicker">
              COMPLETED PROJECT BILLINGS
            </span>

            <h2>
              Completed Project Billing Breakdown
            </h2>
          </div>

          <span className="section-note">
            {filteredRows.length.toLocaleString(
              'en-US'
            )} projects
          </span>
        </div>


        <div className="completed-project-filter-grid">
          <label className="filter-field">
            <span>
              Search
            </span>

            <input
              type="search"
              value={search}
              onChange={
                event => setSearch(
                  event.target.value
                )
              }
              placeholder="Job #, project, PM, GC, estimator…"
            />
          </label>


          <label className="filter-field">
            <span>
              PM
            </span>

            <select
              value={pmFilter}
              onChange={
                event => setPmFilter(
                  event.target.value
                )
              }
            >
              <option value={ALL}>
                All PMs
              </option>

              {pmOptions.map(
                value => (
                  <option
                    key={value}
                    value={value}
                  >
                    {pmLabel(
                      value
                    )}
                  </option>
                )
              )}
            </select>
          </label>


          <label className="filter-field">
            <span>
              Project Type
            </span>

            <select
              value={typeFilter}
              onChange={
                event => setTypeFilter(
                  event.target.value
                )
              }
            >
              <option value={ALL}>
                All Types
              </option>

              {typeOptions.map(
                value => (
                  <option
                    key={value}
                    value={value}
                  >
                    {value}
                  </option>
                )
              )}
            </select>
          </label>


          <label className="filter-field">
            <span>
              Purpose
            </span>

            <select
              value={purposeFilter}
              onChange={
                event => setPurposeFilter(
                  event.target.value
                )
              }
            >
              <option value={ALL}>
                All Purposes
              </option>

              {purposeOptions.map(
                value => (
                  <option
                    key={value}
                    value={value}
                  >
                    {value}
                  </option>
                )
              )}
            </select>
          </label>


          <label className="filter-field">
            <span>
              Data Quality
            </span>

            <select
              value={dataFilter}
              onChange={
                event => setDataFilter(
                  event.target.value
                )
              }
            >
              <option value={ALL}>
                All Projects
              </option>

              <option value="foundation">
                Foundation-Derived Dates
              </option>

              <option value="estimator-present">
                Has Historical Bid Link
              </option>

              <option value="estimator-missing">
                Missing Historical Bid Link
              </option>

              <option value="invalid">
                Invalid Date Range
              </option>
            </select>
          </label>


          <div className="completed-filter-reset">
            <button
              type="button"
              className="text-button"
              onClick={resetFilters}
            >
              Reset
            </button>
          </div>
        </div>


        <div className="detail-table-wrap">
          <table className="detail-table completed-project-table">
            <thead>
              <tr>
                <th>
                  Project
                </th>

                <th>
                  PM
                </th>

                <th>
                  Type / Purpose
                </th>

                <th className="numeric">
                  Original Contract
                </th>

                <th className="numeric">
                  Actual Billings
                </th>

                <th className="numeric">
                  Actual vs Contract
                </th>

                <th>
                  Retention
                </th>

                <th>
                  Lifecycle
                </th>

                <th>
                  Estimator
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map(
                row => (
                  <tr
                    key={row.jobListId}
                    className="completed-project-row"
                    tabIndex="0"
                    onClick={
                      () => setSelectedProject(
                        row
                      )
                    }
                    onKeyDown={
                      event => {
                        if (
                          event.key === 'Enter'
                          || event.key === ' '
                        ) {
                          event.preventDefault();

                          setSelectedProject(
                            row
                          );
                        }
                      }
                    }
                  >
                    <td className="completed-project-name">
                      <strong>
                        {displayValue(
                          row.jobName,
                          'Unnamed Project',
                        )}
                      </strong>

                      <span>
                        Job {displayValue(
                          row.jobNumber
                        )}

                        {row.generalContractor
                          ? ` · ${row.generalContractor}`
                          : ''}
                      </span>
                    </td>

                    <td>
                      {displayValue(
                        row.projectManager,
                        'No PM Assigned',
                      )}
                    </td>

                    <td>
                      <strong>
                        {displayValue(
                          row.projectType
                        )}
                      </strong>

                      <small className="cell-subtext">
                        {displayValue(
                          row.purpose
                        )}
                      </small>
                    </td>

                    <td className="numeric">
                      <MoneyValue
                        value={
                          row.contractAmount
                        }
                      />

                      <small className="cell-subtext commercial-source-note">
                        {
                          commercialSourceLabel(
                            row.contractAmountSource
                          )
                        }
                      </small>

                      {isAdmin
                        && moneyDifference(
                             row.foundationOriginalContractAmount,
                             row.cognitoContractAmount
                           ) !== null
                        && Math.abs(
                             moneyDifference(
                               row.foundationOriginalContractAmount,
                               row.cognitoContractAmount
                             )
                           ) >= 0.005
                        && (
                          <small className="cell-subtext admin-source-hint">
                            Cognito difference:{' '}
                            <MoneyValue
                              value={
                                moneyDifference(
                                  row.foundationOriginalContractAmount,
                                  row.cognitoContractAmount
                                )
                              }
                            />
                          </small>
                        )}
                    </td>

                    <td className="numeric strong-cell">
                      <MoneyValue
                        value={
                          row.foundationActualTotal
                        }
                      />
                    </td>

                    <td className="numeric">
                      <MoneyValue
                        value={
                          row.contractVsActualVariance
                        }
                      />
                    </td>

                    <td>
                      <strong>
                        {retentionLabel(
                          row.retention
                        )}
                      </strong>

                      <small className="cell-subtext commercial-source-note">
                        {
                          commercialSourceLabel(
                            row.retentionSource
                          )
                        }
                      </small>

                      {isAdmin
                        && row.cognitoRetention
                        && retentionNumber(
                             row.cognitoRetention
                           ) !== retentionNumber(
                             row.foundationRetentionPercent
                           )
                        && (
                          <small className="cell-subtext admin-source-hint">
                            Cognito:{' '}
                            {retentionLabel(
                              row.cognitoRetention
                            )}
                          </small>
                        )}
                    </td>


                    <td>
                      <div className="completed-lifecycle-cell">
                        <strong>
                          {dateLabel(
                            row.resolvedStartDate
                          )}
                          {' → '}
                          {dateLabel(
                            row.resolvedEndDate
                          )}
                        </strong>

                        <span>
                          {sourceShortLabel(
                            row.resolvedDurationSource
                          )}

                          {row.resolvedDurationDays
                            ? (
                              ` · ${row.resolvedDurationDays.toLocaleString(
                                'en-US'
                              )} days`
                            )
                            : ''}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div className="completed-estimator-cell">
                        <strong>
                          {row.primaryEstimator
                           || row.secondaryEstimator
                           || '—'}
                        </strong>

                        <span>
                          {row.estimatorEstimatedAmount
                            !== null
                            && row.estimatorEstimatedAmount
                            !== undefined
                            ? (
                                <MoneyValue
                                  value={
                                    row.estimatorEstimatedAmount
                                  }
                                />
                              )
                            : dataStateLabel(
                                row.estimatorDataState
                              )}
                        </span>
                      </div>
                    </td>

                  </tr>
                )
              )}

              {!filteredRows.length && (
                <tr>
                  <td
                    colSpan="9"
                    className="empty-cell"
                  >
                    {loading
                      ? 'Loading completed projects…'
                      : 'No completed projects match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>


      <CompletedProjectBillingDrawer
        project={
          selectedProject
        }
        user={user}
        onClose={
          () => setSelectedProject(
            null
          )
        }
      />
    </main>
  );
}
