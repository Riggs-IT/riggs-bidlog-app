import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import CompletedProjectBillingDrawer
  from './CompletedProjectBillingDrawer.jsx';
import {
  commercialSourceLabel,
  moneyDifference,
  MoneyValue,
  ProjectTeamCell,
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


function lifecycleDateLabel(
  value,
) {
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

  const monthDay =
    new Intl.DateTimeFormat(
      'en-US',
      {
        month: 'short',
        day: 'numeric',
      },
    ).format(date);

  const year =
    String(
      date.getFullYear()
    ).slice(-2);

  return `${monthDay} ’${year}`;
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


function CompletedSortHeader({
  label,
  sortKey,
  sortState,
  onSort,
  firstDirection = 'asc',
  numeric = false,
  className = '',
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
          () =>
            onSort(
              sortKey,
              firstDirection,
            )
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

  const [peFilter, setPeFilter] =
    useState(ALL);

  const [
    superintendentFilter,
    setSuperintendentFilter,
  ] = useState(ALL);

  const [apmFilter, setApmFilter] =
    useState(ALL);

  const [gcFilter, setGcFilter] =
    useState('');

  const [
    completionYearFilter,
    setCompletionYearFilter,
  ] = useState(ALL);

  const [
    estimatorFilter,
    setEstimatorFilter,
  ] = useState(ALL);

  const [
    marginDataFilter,
    setMarginDataFilter,
  ] = useState(ALL);

  const [
    showMoreFilters,
    setShowMoreFilters,
  ] = useState(false);

  const [
    completedFilterDrawerOpen,
    setCompletedFilterDrawerOpen,
  ] = useState(false);

  const [
    completedMainFiltersVisible,
    setCompletedMainFiltersVisible,
  ] = useState(true);

  const completedFiltersRef =
    useRef(null);


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


  const isAdmin =
    String(
      user?.appRole
      || ''
    ).toUpperCase()
    === 'ADMIN';


  useEffect(
    () => {
      const element =
        completedFiltersRef.current;

      if (!element) {
        return undefined;
      }

      if (
        typeof IntersectionObserver
        === 'undefined'
      ) {
        return undefined;
      }

      const observer =
        new IntersectionObserver(
          entries => {
            setCompletedMainFiltersVisible(
              Boolean(
                entries[0]?.isIntersecting
              )
            );
          },
          {
            threshold: 0.08,

            rootMargin:
              '-72px 0px 0px 0px',
          },
        );

      observer.observe(element);

      return () => {
        observer.disconnect();
      };
    },
    [],
  );


  useEffect(
    () => {
      if (!completedFilterDrawerOpen) {
        return undefined;
      }

      const handleKeyDown =
        event => {
          if (event.key === 'Escape') {
            setCompletedFilterDrawerOpen(false);
          }
        };

      window.addEventListener(
        'keydown',
        handleKeyDown,
      );

      return () => {
        window.removeEventListener(
          'keydown',
          handleKeyDown,
        );
      };
    },
    [completedFilterDrawerOpen],
  );


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


  const peOptions = useMemo(
    () => [
      ...new Set(
        rows
          .map(
            row => String(
              row.projectEngineer
              || ''
            ).trim()
          )
          .filter(Boolean),
      ),
    ].sort(),
    [rows],
  );


  const superintendentOptions =
    useMemo(
      () => [
        ...new Set(
          rows
            .map(
              row => String(
                row.superintendent
                || ''
              ).trim()
            )
            .filter(Boolean),
        ),
      ].sort(),
      [rows],
    );


  const apmOptions = useMemo(
    () => [
      ...new Set(
        rows
          .map(
            row => String(
              row.apm
              || ''
            ).trim()
          )
          .filter(Boolean),
      ),
    ].sort(),
    [rows],
  );


  const completionYearOptions =
    useMemo(
      () => [
        ...new Set(
          rows
            .map(
              row => {
                const value =
                  row.resolvedEndDate
                  || row.operationsCompletionDate;

                if (!value) {
                  return null;
                }

                const year =
                  Number(
                    String(value)
                      .slice(0, 4)
                  );

                return (
                  Number.isFinite(year)
                    ? year
                    : null
                );
              }
            )
            .filter(Boolean),
        ),
      ].sort(
        (a, b) => b - a
      ),
      [rows],
    );


  const estimatorOptions =
    useMemo(
      () => [
        ...new Set(
          rows
            .flatMap(
              row => [
                row.primaryEstimator,
                row.secondaryEstimator,
              ]
            )
            .map(
              value =>
                String(
                  value || ''
                ).trim()
            )
            .filter(Boolean),
        ),
      ].sort(),
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
              peFilter !== ALL
              && String(
                   row.projectEngineer
                   || ''
                 ).trim()
                 !== peFilter
            ) {
              return false;
            }

            if (
              superintendentFilter !== ALL
              && String(
                   row.superintendent
                   || ''
                 ).trim()
                 !== superintendentFilter
            ) {
              return false;
            }

            if (
              apmFilter !== ALL
              && String(
                   row.apm
                   || ''
                 ).trim()
                 !== apmFilter
            ) {
              return false;
            }

            if (
              gcFilter.trim()
              && !containsText(
                row.generalContractor,
                gcFilter
                  .trim()
                  .toLowerCase(),
              )
            ) {
              return false;
            }

            if (
              completionYearFilter !== ALL
            ) {
              const completionValue =
                row.resolvedEndDate
                || row.operationsCompletionDate;

              const completionYear =
                completionValue
                  ? String(
                      completionValue
                    ).slice(0, 4)
                  : '';

              if (
                completionYear
                !== completionYearFilter
              ) {
                return false;
              }
            }

            if (
              estimatorFilter !== ALL
              && ![
                row.primaryEstimator,
                row.secondaryEstimator,
              ].some(
                value =>
                  String(
                    value || ''
                  ).trim()
                  === estimatorFilter
              )
            ) {
              return false;
            }

            if (
              marginDataFilter === 'complete'
              && !row.marginDataComplete
            ) {
              return false;
            }

            if (
              marginDataFilter === 'incomplete'
              && row.marginDataComplete
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
                row.apm,
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
      peFilter,
      superintendentFilter,
      apmFilter,
      gcFilter,
      completionYearFilter,
      estimatorFilter,
      marginDataFilter,
      typeFilter,
      purposeFilter,
      dataFilter,
    ],
  );


  const sortedRows =
    useMemo(
      () => {
        function compareText(
          aValue,
          bValue,
        ) {
          return String(
            aValue || ''
          ).localeCompare(
            String(
              bValue || ''
            ),
            undefined,
            {
              numeric: true,
              sensitivity: 'base',
            },
          );
        }


        function compareNumber(
          aValue,
          bValue,
        ) {
          const aMissing =
            aValue === null
            || aValue === undefined
            || aValue === '';

          const bMissing =
            bValue === null
            || bValue === undefined
            || bValue === '';

          if (
            aMissing
            && bMissing
          ) {
            return 0;
          }

          if (aMissing) {
            return 1;
          }

          if (bMissing) {
            return -1;
          }

          const aNumber =
            Number(aValue);

          const bNumber =
            Number(bValue);

          if (
            !Number.isFinite(aNumber)
            && !Number.isFinite(bNumber)
          ) {
            return 0;
          }

          if (!Number.isFinite(aNumber)) {
            return 1;
          }

          if (!Number.isFinite(bNumber)) {
            return -1;
          }

          return (
            aNumber
            - bNumber
          );
        }


        const result = [
          ...filteredRows
        ];


        result.sort(
          (
            a,
            b,
          ) => {
            let comparison = 0;


            switch (
              sortState.key
            ) {
              case 'job':
                comparison =
                  compareNumber(
                    a.jobNumber,
                    b.jobNumber,
                  );
                break;


              case 'project':
                comparison =
                  compareText(
                    a.jobName,
                    b.jobName,
                  );
                break;


              case 'pm':
                comparison =
                  compareText(
                    a.projectManager,
                    b.projectManager,
                  );
                break;


              case 'team':
                comparison =
                  compareText(
                    [
                      a.projectEngineer,
                      a.superintendent,
                      a.apm,
                    ]
                      .filter(Boolean)
                      .join(' '),

                    [
                      b.projectEngineer,
                      b.superintendent,
                      b.apm,
                    ]
                      .filter(Boolean)
                      .join(' '),
                  );
                break;


              case 'type':
                comparison =
                  compareText(
                    `${
                      a.projectType || ''
                    } ${
                      a.purpose || ''
                    }`,

                    `${
                      b.projectType || ''
                    } ${
                      b.purpose || ''
                    }`,
                  );
                break;


              case 'contract':
                comparison =
                  compareNumber(
                    a.contractAmount,
                    b.contractAmount,
                  );
                break;


              case 'actual':
                comparison =
                  compareNumber(
                    a.foundationActualTotal,
                    b.foundationActualTotal,
                  );
                break;


              case 'margin':
                comparison =
                  compareNumber(
                    a.marginCollectedTotal,
                    b.marginCollectedTotal,
                  );
                break;


              case 'variance':
                comparison =
                  compareNumber(
                    a.contractVsActualVariance,
                    b.contractVsActualVariance,
                  );
                break;


              case 'retention':
                comparison =
                  compareNumber(
                    retentionNumber(
                      a.retention
                    ),
                    retentionNumber(
                      b.retention
                    ),
                  );
                break;


              case 'lifecycle':
                comparison =
                  compareText(
                    a.resolvedEndDate
                    || '',

                    b.resolvedEndDate
                    || '',
                  );
                break;


              case 'estimator':
                comparison =
                  compareText(
                    [
                      a.primaryEstimator,
                      a.secondaryEstimator,
                    ]
                      .filter(Boolean)
                      .join(' '),

                    [
                      b.primaryEstimator,
                      b.secondaryEstimator,
                    ]
                      .filter(Boolean)
                      .join(' '),
                  );
                break;


              default:
                comparison =
                  compareNumber(
                    a.jobNumber,
                    b.jobNumber,
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
        filteredRows,
        sortState,
      ],
    );


  function resetFilters() {
    setSearch('');
    setPmFilter(ALL);
    setPeFilter(ALL);
    setSuperintendentFilter(ALL);
    setApmFilter(ALL);
    setGcFilter('');
    setCompletionYearFilter(ALL);
    setEstimatorFilter(ALL);
    setMarginDataFilter(ALL);
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


        <div
          className="completed-project-filter-grid"
          ref={completedFiltersRef}
        >
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
              className="secondary-button"
              onClick={
                () =>
                  setShowMoreFilters(
                    current => !current
                  )
              }
            >
              {showMoreFilters
                ? 'Less Filters'
                : 'More Filters'}
            </button>

            <button
              type="button"
              className="text-button"
              onClick={resetFilters}
            >
              Reset
            </button>
          </div>


          {showMoreFilters && (
            <div className="completed-more-filter-grid">
              <label className="filter-field">
                <span>
                  PE
                </span>

                <select
                  value={peFilter}
                  onChange={
                    event =>
                      setPeFilter(
                        event.target.value
                      )
                  }
                >
                  <option value={ALL}>
                    All PEs
                  </option>

                  {peOptions.map(
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
                  Superintendent
                </span>

                <select
                  value={superintendentFilter}
                  onChange={
                    event =>
                      setSuperintendentFilter(
                        event.target.value
                      )
                  }
                >
                  <option value={ALL}>
                    All Superintendents
                  </option>

                  {superintendentOptions.map(
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
                  APM
                </span>

                <select
                  value={apmFilter}
                  onChange={
                    event =>
                      setApmFilter(
                        event.target.value
                      )
                  }
                >
                  <option value={ALL}>
                    All APMs
                  </option>

                  {apmOptions.map(
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
                  General Contractor
                </span>

                <input
                  type="search"
                  value={gcFilter}
                  onChange={
                    event =>
                      setGcFilter(
                        event.target.value
                      )
                  }
                  placeholder="Search GC…"
                />
              </label>


              <label className="filter-field">
                <span>
                  Completion Year
                </span>

                <select
                  value={completionYearFilter}
                  onChange={
                    event =>
                      setCompletionYearFilter(
                        event.target.value
                      )
                  }
                >
                  <option value={ALL}>
                    All Years
                  </option>

                  {completionYearOptions.map(
                    value => (
                      <option
                        key={value}
                        value={String(value)}
                      >
                        {value}
                      </option>
                    )
                  )}
                </select>
              </label>


              <label className="filter-field">
                <span>
                  Estimator
                </span>

                <select
                  value={estimatorFilter}
                  onChange={
                    event =>
                      setEstimatorFilter(
                        event.target.value
                      )
                  }
                >
                  <option value={ALL}>
                    All Estimators
                  </option>

                  {estimatorOptions.map(
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
                  Margin Data
                </span>

                <select
                  value={marginDataFilter}
                  onChange={
                    event =>
                      setMarginDataFilter(
                        event.target.value
                      )
                  }
                >
                  <option value={ALL}>
                    All
                  </option>

                  <option value="complete">
                    Complete
                  </option>

                  <option value="incomplete">
                    Incomplete
                  </option>
                </select>
              </label>
            </div>
          )}
        </div>


        {!completedMainFiltersVisible
          && !completedFilterDrawerOpen && (
            <button
              type="button"
              className="floating-filter-tab"
              onClick={
                () =>
                  setCompletedFilterDrawerOpen(true)
              }
              aria-label="Open completed project filters"
            >
              <span>
                Filters
              </span>
            </button>
          )}


        {completedFilterDrawerOpen && (
          <div
            className="side-filter-backdrop"
            role="presentation"
            onMouseDown={
              event => {
                if (
                  event.target
                  === event.currentTarget
                ) {
                  setCompletedFilterDrawerOpen(false);
                }
              }
            }
          >
            <aside
              className="side-filter-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="completed-side-filter-title"
            >
              <header className="side-filter-header">
                <div>
                  <span className="section-kicker">
                    COMPLETED PROJECTS
                  </span>

                  <h2 id="completed-side-filter-title">
                    Filters
                  </h2>

                  <p>
                    These control the completed-project table.
                  </p>
                </div>

                <button
                  type="button"
                  className="side-filter-close"
                  onClick={
                    () =>
                      setCompletedFilterDrawerOpen(false)
                  }
                  aria-label="Close filters"
                >
                  ×
                </button>
              </header>


              <div className="side-filter-body">
                <div className="side-filter-fields">
                  <label className="filter-field">
                    <span>Search</span>
                    <input
                      type="search"
                      value={search}
                      onChange={
                        event =>
                          setSearch(
                            event.target.value
                          )
                      }
                      placeholder="Job #, project, PM, GC…"
                    />
                  </label>


                  <label className="filter-field">
                    <span>PM</span>
                    <select
                      value={pmFilter}
                      onChange={
                        event =>
                          setPmFilter(
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
                            {pmLabel(value)}
                          </option>
                        )
                      )}
                    </select>
                  </label>


                  <label className="filter-field">
                    <span>PE</span>
                    <select
                      value={peFilter}
                      onChange={
                        event =>
                          setPeFilter(
                            event.target.value
                          )
                      }
                    >
                      <option value={ALL}>
                        All PEs
                      </option>

                      {peOptions.map(
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
                    <span>Superintendent</span>
                    <select
                      value={superintendentFilter}
                      onChange={
                        event =>
                          setSuperintendentFilter(
                            event.target.value
                          )
                      }
                    >
                      <option value={ALL}>
                        All Superintendents
                      </option>

                      {superintendentOptions.map(
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
                    <span>APM</span>
                    <select
                      value={apmFilter}
                      onChange={
                        event =>
                          setApmFilter(
                            event.target.value
                          )
                      }
                    >
                      <option value={ALL}>
                        All APMs
                      </option>

                      {apmOptions.map(
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
                    <span>Project Type</span>
                    <select
                      value={typeFilter}
                      onChange={
                        event =>
                          setTypeFilter(
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
                    <span>Purpose</span>
                    <select
                      value={purposeFilter}
                      onChange={
                        event =>
                          setPurposeFilter(
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
                    <span>General Contractor</span>
                    <input
                      type="search"
                      value={gcFilter}
                      onChange={
                        event =>
                          setGcFilter(
                            event.target.value
                          )
                      }
                      placeholder="Search GC…"
                    />
                  </label>


                  <label className="filter-field">
                    <span>Completion Year</span>
                    <select
                      value={completionYearFilter}
                      onChange={
                        event =>
                          setCompletionYearFilter(
                            event.target.value
                          )
                      }
                    >
                      <option value={ALL}>
                        All Years
                      </option>

                      {completionYearOptions.map(
                        value => (
                          <option
                            key={value}
                            value={String(value)}
                          >
                            {value}
                          </option>
                        )
                      )}
                    </select>
                  </label>


                  <label className="filter-field">
                    <span>Estimator</span>
                    <select
                      value={estimatorFilter}
                      onChange={
                        event =>
                          setEstimatorFilter(
                            event.target.value
                          )
                      }
                    >
                      <option value={ALL}>
                        All Estimators
                      </option>

                      {estimatorOptions.map(
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
                    <span>Margin Data</span>
                    <select
                      value={marginDataFilter}
                      onChange={
                        event =>
                          setMarginDataFilter(
                            event.target.value
                          )
                      }
                    >
                      <option value={ALL}>
                        All
                      </option>

                      <option value="complete">
                        Complete
                      </option>

                      <option value="incomplete">
                        Incomplete
                      </option>
                    </select>
                  </label>


                  <label className="filter-field">
                    <span>Data Quality</span>
                    <select
                      value={dataFilter}
                      onChange={
                        event =>
                          setDataFilter(
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
                </div>
              </div>


              <footer className="side-filter-footer">
                <button
                  type="button"
                  className="text-button"
                  onClick={resetFilters}
                >
                  Reset Filters
                </button>

                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    () =>
                      setCompletedFilterDrawerOpen(false)
                  }
                >
                  Done
                </button>
              </footer>
            </aside>
          </div>
        )}


        <div className="detail-table-wrap">
          <table className="detail-table completed-project-table">
            <thead>
              <tr>
                <CompletedSortHeader
                  label="Job #"
                  sortKey="job"
                  sortState={sortState}
                  onSort={toggleSort}
                  firstDirection="desc"
                  className="completed-job-number-column"
                />

                <CompletedSortHeader
                  label="Project"
                  sortKey="project"
                  sortState={sortState}
                  onSort={toggleSort}
                />

                <CompletedSortHeader
                  label="PM"
                  sortKey="pm"
                  sortState={sortState}
                  onSort={toggleSort}
                />

                <CompletedSortHeader
                  label="Team"
                  sortKey="team"
                  sortState={sortState}
                  onSort={toggleSort}
                  className="project-team-column"
                />

                <CompletedSortHeader
                  label="Type / Purpose"
                  sortKey="type"
                  sortState={sortState}
                  onSort={toggleSort}
                />

                <CompletedSortHeader
                  label="Original Contract"
                  sortKey="contract"
                  sortState={sortState}
                  onSort={toggleSort}
                  firstDirection="desc"
                  numeric
                />

                <CompletedSortHeader
                  label="Actual Billings"
                  sortKey="actual"
                  sortState={sortState}
                  onSort={toggleSort}
                  firstDirection="desc"
                  numeric
                />

                <CompletedSortHeader
                  label="Margin Collected"
                  sortKey="margin"
                  sortState={sortState}
                  onSort={toggleSort}
                  firstDirection="desc"
                  numeric
                />

                <CompletedSortHeader
                  label="Actual vs Contract"
                  sortKey="variance"
                  sortState={sortState}
                  onSort={toggleSort}
                  firstDirection="desc"
                  numeric
                />

                <CompletedSortHeader
                  label="Retention"
                  sortKey="retention"
                  sortState={sortState}
                  onSort={toggleSort}
                  firstDirection="desc"
                />

                <CompletedSortHeader
                  label="Lifecycle"
                  sortKey="lifecycle"
                  sortState={sortState}
                  onSort={toggleSort}
                  firstDirection="desc"
                />

                <CompletedSortHeader
                  label="Estimator"
                  sortKey="estimator"
                  sortState={sortState}
                  onSort={toggleSort}
                />
              </tr>
            </thead>

            <tbody>
              {sortedRows.map(
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
                    <td className="completed-job-number">
                      {displayValue(
                        row.jobNumber
                      )}
                    </td>

                    <td className="completed-project-name">
                      <strong>
                        {displayValue(
                          row.jobName,
                          'Unnamed Project',
                        )}
                      </strong>

                      {row.generalContractor && (
                        <span>
                          {row.generalContractor}
                        </span>
                      )}
                    </td>

                    <td>
                      {displayValue(
                        row.projectManager,
                        'No PM Assigned',
                      )}
                    </td>

                    <td className="project-team-column">
                      <ProjectTeamCell
                        pe={row.projectEngineer}
                        superintendent={row.superintendent}
                        apm={row.apm}
                      />
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

                    <td className="numeric strong-cell">
                      <MoneyValue
                        value={
                          row.marginCollectedTotal
                        }
                      />

                      {row.marginDataComplete ? (
                        <small className="cell-subtext">
                          {retentionLabel(
                            row.weightedHistoricalMarginPercent
                          )}
                        </small>
                      ) : (
                        <small className="cell-subtext">
                          <span className="completed-project-pill warning">
                            Margin incomplete
                          </span>
                        </small>
                      )}
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
                          {lifecycleDateLabel(
                            row.resolvedStartDate
                          )}
                          {' → '}
                          {lifecycleDateLabel(
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
                    colSpan="12"
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
