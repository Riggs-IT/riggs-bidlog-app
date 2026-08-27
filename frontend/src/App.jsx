import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import ProjectAccountability from './ProjectAccountability.jsx';


const ALL = '__ALL__';
const UNASSIGNED = '__UNASSIGNED__';


function getInitialTheme() {
  const saved =
    window.localStorage.getItem(
      'riggs-theme',
    );

  if (
    saved === 'light'
    || saved === 'dark'
  ) {
    return saved;
  }

  return (
    window.matchMedia?.(
      '(prefers-color-scheme: dark)',
    ).matches
      ? 'dark'
      : 'light'
  );
}


function ThemeControl({
  theme,
  onChange,
}) {
  const next =
    theme === 'dark'
      ? 'light'
      : 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => onChange(next)}
      title={`Switch to ${next} mode`}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}


function friendlyError(detail) {
  const messages = {
    authentication_required:
      'Sign in with your Riggs Microsoft account to continue.',

    session_inactive_timeout:
      'Your session expired after 1 hour of inactivity.',

    bid_log_user_not_authorized:
      'Your Riggs account does not currently have Bid Log access.',

    bid_log_identity_conflict:
      'Your Microsoft identity maps to conflicting Riggs access records.',

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

    projected_billing_resource_not_found:
      'The requested projected-billing record could not be found.',
  };

  return (
    messages[detail]
    || detail
    || 'An unexpected application error occurred.'
  );
}


function monthValueFromDate(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1,
    ).padStart(
      2,
      '0',
    );

  return `${year}-${month}`;
}


function addMonths(
  monthValue,
  offset,
) {
  const [
    year,
    month,
  ] = monthValue
    .split('-')
    .map(Number);

  const date =
    new Date(
      year,
      month - 1 + offset,
      1,
    );

  return monthValueFromDate(
    date
  );
}


function monthLabel(
  monthValue,
) {
  const [
    year,
    month,
  ] = monthValue
    .split('-')
    .map(Number);

  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      year: 'numeric',
    },
  ).format(
    new Date(
      year,
      month - 1,
      1,
    ),
  );
}


function buildMonthRange(
  fromMonth,
  throughMonth,
) {
  if (
    !fromMonth
    || !throughMonth
    || fromMonth > throughMonth
  ) {
    return [];
  }

  const result = [];

  let current =
    fromMonth;

  for (
    let count = 0;
    count < 121;
    count += 1
  ) {
    result.push(
      current
    );

    if (
      current === throughMonth
    ) {
      return result;
    }

    current =
      addMonths(
        current,
        1,
      );
  }

  return [];
}


function monthKey(
  value,
) {
  if (!value) {
    return '';
  }

  return String(value)
    .slice(
      0,
      7,
    );
}


function toNumber(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}


function currency(
  value,
) {
  return new Intl.NumberFormat(
    'en-US',
    {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    },
  ).format(
    toNumber(value),
  );
}


function percent(
  value,
) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return `${Math.round(number * 100)}%`;
}


function normalizeProjectType(
  value,
) {
  const normalized =
    String(
      value || '',
    )
      .trim()
      .toUpperCase();

  if (
    normalized === 'TILT'
  ) {
    return 'TILT';
  }

  if (
    normalized === 'OTH'
    || normalized === 'OTHER'
  ) {
    return 'OTHER';
  }

  return normalized;
}


function projectTypeLabel(
  value,
) {
  const normalized =
    normalizeProjectType(
      value
    );

  const labels = {
    TILT: 'Tilt',
    OTHER: 'Other',
    CIP: 'CIP',
    SITE: 'Site',
    PRE: 'Preconstruction',
  };

  return (
    labels[normalized]
    || normalized
    || 'Unassigned'
  );
}


function displayValue(
  value,
  fallback = '—',
) {
  if (
    value === null
    || value === undefined
    || value === ''
  ) {
    return fallback;
  }

  if (Array.isArray(value)) {
    return (
      value
        .filter(Boolean)
        .join(', ')
      || fallback
    );
  }

  return String(value);
}


function pmKey(
  value,
) {
  const text =
    String(
      value || '',
    ).trim();

  if (
    !text
    || text.toLowerCase()
      === 'no pm assigned'
  ) {
    return UNASSIGNED;
  }

  return text;
}


function pmLabel(
  value,
) {
  return (
    value === UNASSIGNED
      ? 'No PM Assigned'
      : value
  );
}


function containsText(
  value,
  search,
) {
  if (!search) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some(
      item =>
        containsText(
          item,
          search,
        )
    );
  }

  return String(
    value ?? '',
  )
    .toLowerCase()
    .includes(
      search
    );
}


function currentMatchesSearch(
  row,
  search,
) {
  if (!search) {
    return true;
  }

  return [
    row.jobNumber,
    row.jobName,
    row.pm,
    row.projectType,
    row.purpose,
    row.generalContractors,
    row.streetAddress,
    row.cityStateZip,
    row.apm,
    row.pe,
    row.superintendent,
  ].some(
    value =>
      containsText(
        value,
        search,
      )
  );
}


function bidMatchesSearch(
  row,
  search,
) {
  if (!search) {
    return true;
  }

  return [
    row.sharePointItemId,
    row.bidName,
    row.pm,
    row.projectType,
    row.purpose,
    row.generalContractors,
    row.streetAddress,
    row.city,
    row.state,
    row.status,
  ].some(
    value =>
      containsText(
        value,
        search,
      )
  );
}


async function fetchJson(
  path,
) {
  const response =
    await window.fetch(
      path,
      {
        credentials:
          'same-origin',
      },
    );

  if (!response.ok) {
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

    const error =
      new Error(
        friendlyError(
          detail
        )
      );

    error.detail =
      detail;

    error.status =
      response.status;

    throw error;
  }

  return response.json();
}


async function mapWithConcurrency(
  items,
  concurrency,
  worker,
  onProgress,
) {
  const result =
    new Map();

  let cursor = 0;

  async function runner() {
    while (true) {
      const index =
        cursor;

      cursor += 1;

      if (
        index >= items.length
      ) {
        return;
      }

      const item =
        items[index];

      const [
        key,
        value,
      ] = await worker(
        item
      );

      result.set(
        key,
        value,
      );

      onProgress?.();
    }
  }

  const workerCount =
    Math.min(
      concurrency,
      items.length,
    );

  await Promise.all(
    Array.from(
      {
        length:
          workerCount,
      },
      () => runner(),
    )
  );

  return result;
}


function aggregateCurrentMonthly(
  rows,
  fromMonth,
  throughMonth,
) {
  let projected = 0;
  let actual = 0;

  for (const row of rows || []) {
    const key =
      monthKey(
        row.monthStart
      );

    if (
      key < fromMonth
      || key > throughMonth
    ) {
      continue;
    }

    projected +=
      toNumber(
        row.projectedAmount
      );

    actual +=
      toNumber(
        row.actualAmount
      );
  }

  return {
    projected,
    actual,
    variance:
      actual - projected,
  };
}


function aggregateBidMonthly(
  rows,
  fromMonth,
  throughMonth,
) {
  let forecast = 0;
  let weighted = 0;

  for (const row of rows || []) {
    const key =
      monthKey(
        row.monthStart
      );

    if (
      key < fromMonth
      || key > throughMonth
    ) {
      continue;
    }

    forecast +=
      toNumber(
        row.monthlyForecastAmount
      );

    weighted +=
      toNumber(
        row.weightedMonthlyForecastAmount
      );
  }

  return {
    forecast,
    weighted,
  };
}


function sortedUnique(
  values,
  labeler = value => value,
) {
  return Array.from(
    new Set(
      values.filter(
        value =>
          value !== null
          && value !== undefined
          && value !== ''
      )
    )
  ).sort(
    (a, b) =>
      labeler(a)
        .localeCompare(
          labeler(b),
        )
  );
}


function booleanFilterMatch(
  value,
  filter,
) {
  if (
    filter === ALL
  ) {
    return true;
  }

  return (
    Boolean(value)
    === (
      filter === 'true'
    )
  );
}


function csvValue(
  value,
) {
  const text =
    value === null
    || value === undefined
      ? ''
      : String(value);

  return (
    `"${text.replaceAll(
      '"',
      '""',
    )}"`
  );
}


function downloadCsv(
  filename,
  headers,
  rows,
) {
  const lines = [
    headers
      .map(csvValue)
      .join(','),
    ...rows.map(
      row =>
        headers
          .map(
            header =>
              csvValue(
                row[header]
              )
          )
          .join(',')
    ),
  ];

  const blob =
    new Blob(
      [
        '\uFEFF'
        + lines.join('\r\n'),
      ],
      {
        type:
          'text/csv;charset=utf-8',
      },
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      'a'
    );

  anchor.href =
    url;

  anchor.download =
    filename;

  document.body.appendChild(
    anchor
  );

  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(
    url
  );
}


function SelectField({
  label,
  value,
  onChange,
  children,
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>

      <select
        value={value}
        onChange={
          event =>
            onChange(
              event.target.value
            )
        }
      >
        {children}
      </select>
    </label>
  );
}


function TextField({
  label,
  value,
  onChange,
  placeholder,
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>

      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={
          event =>
            onChange(
              event.target.value
            )
        }
      />
    </label>
  );
}


function StatCard({
  label,
  value,
  detail,
  emphasis = false,
}) {
  return (
    <article
      className={
        emphasis
          ? 'stat-card emphasis'
          : 'stat-card'
      }
    >
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


function SignInView({
  theme,
  setTheme,
  authError,
}) {
  return (
    <div className="auth-page">
      <div className="auth-theme">
        <ThemeControl
          theme={theme}
          onChange={setTheme}
        />
      </div>

      <section className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark large">
            R
          </div>

          <div>
            <div className="eyebrow">
              RIGGS COMPANIES
            </div>

            <h1>Bid Log</h1>
          </div>
        </div>

        <p className="auth-copy">
          Secure internal bidding and
          projected-billings workspace.
        </p>

        {authError && (
          <div
            className="auth-alert"
            role="alert"
          >
            <strong>
              Unable to verify access
            </strong>

            <span>
              {friendlyError(authError)}
            </span>
          </div>
        )}

        <a
          className="primary-button"
          href="/api/auth/login"
        >
          <span>
            Sign in with Microsoft
          </span>

          <span aria-hidden="true">
            →
          </span>
        </a>

        <div className="security-note">
          Microsoft Entra ID · Riggs Data API ·
          Private SQL access
        </div>
      </section>
    </div>
  );
}


export default function App() {
  const todayMonth =
    monthValueFromDate(
      new Date()
    );

  const [
    theme,
    setTheme,
  ] = useState(
    getInitialTheme,
  );

  const [
    user,
    setUser,
  ] = useState(null);

  const [
    activePage,
    setActivePage,
  ] = useState('projected');

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    authError,
    setAuthError,
  ] = useState(null);

  const [
    dataLoading,
    setDataLoading,
  ] = useState(false);

  const [
    dataError,
    setDataError,
  ] = useState(null);

  const [
    currentProjects,
    setCurrentProjects,
  ] = useState([]);

  const [
    activeBids,
    setActiveBids,
  ] = useState([]);

  const [
    currentMonthly,
    setCurrentMonthly,
  ] = useState(
    new Map()
  );

  const [
    bidMonthly,
    setBidMonthly,
  ] = useState(
    new Map()
  );

  const [
    monthlyProgress,
    setMonthlyProgress,
  ] = useState({
    loaded: 0,
    total: 0,
  });

  const [
    sourceMode,
    setSourceMode,
  ] = useState(
    'combined'
  );

  const [
    search,
    setSearch,
  ] = useState('');

  const [
    pmFilter,
    setPmFilter,
  ] = useState(ALL);

  const [
    projectTypeFilter,
    setProjectTypeFilter,
  ] = useState(ALL);

  const [
    purposeFilter,
    setPurposeFilter,
  ] = useState(ALL);

  const [
    forecastStateFilter,
    setForecastStateFilter,
  ] = useState(ALL);

  const [
    gcFilter,
    setGcFilter,
  ] = useState('');

  const [
    fromMonth,
    setFromMonth,
  ] = useState(
    todayMonth
  );

  const [
    throughMonth,
    setThroughMonth,
  ] = useState(
    addMonths(
      todayMonth,
      11,
    )
  );

  const [
    showMoreFilters,
    setShowMoreFilters,
  ] = useState(false);

  const [
    peFilter,
    setPeFilter,
  ] = useState(ALL);

  const [
    superintendentFilter,
    setSuperintendentFilter,
  ] = useState(ALL);

  const [
    apmFilter,
    setApmFilter,
  ] = useState(ALL);

  const [
    foundationFilter,
    setFoundationFilter,
  ] = useState(ALL);

  const [
    varianceFilter,
    setVarianceFilter,
  ] = useState(ALL);

  const [
    bidStatusFilter,
    setBidStatusFilter,
  ] = useState(ALL);

  const [
    probabilityStateFilter,
    setProbabilityStateFilter,
  ] = useState(ALL);

  const [
    stateFilter,
    setStateFilter,
  ] = useState(ALL);

  const [
    isNewBidFilter,
    setIsNewBidFilter,
  ] = useState(ALL);

  const [
    snoozedFilter,
    setSnoozedFilter,
  ] = useState(ALL);


  useEffect(() => {
    document.documentElement.dataset.theme =
      theme;

    window.localStorage.setItem(
      'riggs-theme',
      theme,
    );
  }, [theme]);


  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const response =
          await window.fetch(
            '/api/auth/me',
            {
              credentials:
                'same-origin',
            },
          );

        if (response.ok) {
          const payload =
            await response.json();

          if (!cancelled) {
            setUser(payload);
          }

          return;
        }

        let detail =
          'authentication_required';

        try {
          const payload =
            await response.json();

          detail =
            payload?.detail
            || detail;

        } catch {
          // Keep default.
        }

        if (!cancelled) {
          const params =
            new URLSearchParams(
              window.location.search,
            );

          setAuthError(
            params.get('signed_out')
              === 'timeout'
              ? 'session_inactive_timeout'
              : detail,
          );
        }

      } catch {
        if (!cancelled) {
          setAuthError(
            'data_api_unavailable',
          );
        }

      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadUser();

    return () => {
      cancelled = true;
    };

  }, []);


  useEffect(() => {
    if (!user) {
      return undefined;
    }

    let cancelled = false;

    async function loadProjectedBillings() {
      setDataLoading(true);
      setDataError(null);

      try {
        const [
          currentPayload,
          bidPayload,
        ] = await Promise.all([
          fetchJson(
            '/api/projected-billings/current-projects'
          ),
          fetchJson(
            '/api/projected-billings/active-bids'
          ),
        ]);

        const bids =
          Array.isArray(
            bidPayload?.items
          )
            ? bidPayload.items
            : [];

        if (cancelled) {
          return;
        }

        setCurrentProjects(
          currentPayload
        );

        setActiveBids(
          bids
        );

        const readyBids =
          bids.filter(
            row =>
              row.forecastReady
              === true
          );

        const totalRequests =
          currentPayload.length
          + readyBids.length;

        let loadedRequests = 0;

        setMonthlyProgress({
          loaded: 0,
          total:
            totalRequests,
        });

        const onProgress = () => {
          loadedRequests += 1;

          if (!cancelled) {
            setMonthlyProgress({
              loaded:
                loadedRequests,
              total:
                totalRequests,
            });
          }
        };

        const [
          currentMap,
          bidMap,
        ] = await Promise.all([
          mapWithConcurrency(
            currentPayload,
            6,
            async row => {
              const payload =
                await fetchJson(
                  (
                    '/api/projected-billings/'
                    + 'current-projects/'
                    + `${row.jobListId}/monthly`
                  )
                );

              return [
                row.jobListId,
                payload.items || [],
              ];
            },
            onProgress,
          ),

          mapWithConcurrency(
            readyBids,
            4,
            async row => {
              const payload =
                await fetchJson(
                  (
                    '/api/projected-billings/'
                    + 'active-bids/'
                    + `${row.sharePointItemId}/monthly`
                  )
                );

              return [
                row.sharePointItemId,
                payload.items || [],
              ];
            },
            onProgress,
          ),
        ]);

        if (cancelled) {
          return;
        }

        setCurrentMonthly(
          currentMap
        );

        setBidMonthly(
          bidMap
        );

      } catch (error) {
        if (!cancelled) {
          setDataError(
            error.message
            || 'Unable to load projected billings.'
          );
        }

      } finally {
        if (!cancelled) {
          setDataLoading(false);
        }
      }
    }

    loadProjectedBillings();

    return () => {
      cancelled = true;
    };

  }, [user]);


  async function signOut() {
    await window.fetch(
      '/api/auth/logout',
      {
        method: 'POST',
        credentials:
          'same-origin',
      },
    );

    window.location.assign(
      '/?signed_out=1',
    );
  }


  async function verifyApi() {
    try {
      const response =
        await window.fetch(
          '/api/platform/status',
          {
            credentials:
              'same-origin',
          },
        );

      if (!response.ok) {
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

        window.alert(
          friendlyError(detail),
        );

        return;
      }

      const payload =
        await response.json();

      window.alert(
        `Riggs Data API: ${payload.dataApi.status}`
        + ` · SQL: ${payload.dataApi.sql}`,
      );

    } catch {
      window.alert(
        friendlyError(
          'data_api_unavailable'
        ),
      );
    }
  }


  const monthRange =
    useMemo(
      () =>
        buildMonthRange(
          fromMonth,
          throughMonth,
        ),
      [
        fromMonth,
        throughMonth,
      ],
    );

  const rangeValid =
    monthRange.length > 0;


  const pmOptions =
    useMemo(
      () => {
        const values = [];

        if (
          sourceMode !== 'active'
        ) {
          values.push(
            ...currentProjects.map(
              row =>
                pmKey(
                  row.pm
                )
            )
          );
        }

        if (
          sourceMode !== 'current'
        ) {
          values.push(
            ...activeBids.map(
              row =>
                pmKey(
                  row.pm
                )
            )
          );
        }

        return sortedUnique(
          values,
          pmLabel,
        );
      },
      [
        sourceMode,
        currentProjects,
        activeBids,
      ],
    );


  const projectTypeOptions =
    useMemo(
      () => {
        const values = [];

        if (
          sourceMode !== 'active'
        ) {
          values.push(
            ...currentProjects.map(
              row =>
                normalizeProjectType(
                  row.projectType
                )
            )
          );
        }

        if (
          sourceMode !== 'current'
        ) {
          values.push(
            ...activeBids.map(
              row =>
                normalizeProjectType(
                  row.projectType
                )
            )
          );
        }

        return sortedUnique(
          values,
          projectTypeLabel,
        );
      },
      [
        sourceMode,
        currentProjects,
        activeBids,
      ],
    );


  const purposeOptions =
    useMemo(
      () => {
        const values = [];

        if (
          sourceMode !== 'active'
        ) {
          values.push(
            ...currentProjects.map(
              row =>
                row.purpose
            )
          );
        }

        if (
          sourceMode !== 'current'
        ) {
          values.push(
            ...activeBids.map(
              row =>
                row.purpose
            )
          );
        }

        return sortedUnique(
          values
        );
      },
      [
        sourceMode,
        currentProjects,
        activeBids,
      ],
    );


  const peOptions =
    useMemo(
      () =>
        sortedUnique(
          currentProjects.map(
            row =>
              row.pe
          )
        ),
      [currentProjects],
    );


  const superintendentOptions =
    useMemo(
      () =>
        sortedUnique(
          currentProjects.map(
            row =>
              row.superintendent
          )
        ),
      [currentProjects],
    );


  const apmOptions =
    useMemo(
      () =>
        sortedUnique(
          currentProjects.map(
            row =>
              row.apm
          )
        ),
      [currentProjects],
    );


  const bidStatusOptions =
    useMemo(
      () =>
        sortedUnique(
          activeBids.map(
            row =>
              row.status
          )
        ),
      [activeBids],
    );


  const probabilityStateOptions =
    useMemo(
      () =>
        sortedUnique(
          activeBids.map(
            row =>
              row.probabilityState
          )
        ),
      [activeBids],
    );


  const stateOptions =
    useMemo(
      () =>
        sortedUnique(
          activeBids.map(
            row =>
              row.state
          )
        ),
      [activeBids],
    );


  const normalizedSearch =
    search
      .trim()
      .toLowerCase();

  const normalizedGc =
    gcFilter
      .trim()
      .toLowerCase();


  const currentDetails =
    useMemo(
      () => {
        if (
          sourceMode === 'active'
          || !rangeValid
        ) {
          return [];
        }

        return currentProjects
          .filter(
            row => {
              if (
                !currentMatchesSearch(
                  row,
                  normalizedSearch,
                )
              ) {
                return false;
              }

              if (
                pmFilter !== ALL
                && pmKey(row.pm)
                  !== pmFilter
              ) {
                return false;
              }

              if (
                projectTypeFilter
                  !== ALL
                && normalizeProjectType(
                  row.projectType
                ) !==
                  projectTypeFilter
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
                forecastStateFilter
                  !== ALL
                && row.forecastState
                  !== forecastStateFilter
              ) {
                return false;
              }

              if (
                normalizedGc
                && !containsText(
                  row.generalContractors,
                  normalizedGc,
                )
              ) {
                return false;
              }

              if (
                peFilter !== ALL
                && row.pe
                  !== peFilter
              ) {
                return false;
              }

              if (
                superintendentFilter
                  !== ALL
                && row.superintendent
                  !== superintendentFilter
              ) {
                return false;
              }

              if (
                apmFilter !== ALL
                && row.apm
                  !== apmFilter
              ) {
                return false;
              }

              if (
                !booleanFilterMatch(
                  row.hasFoundationBillingHistory,
                  foundationFilter,
                )
              ) {
                return false;
              }

              return true;
            }
          )
          .map(
            row => {
              const monthly =
                aggregateCurrentMonthly(
                  currentMonthly.get(
                    row.jobListId
                  ),
                  fromMonth,
                  throughMonth,
                );

              return {
                ...row,
                selectedProjected:
                  monthly.projected,
                selectedActual:
                  monthly.actual,
                selectedVariance:
                  monthly.variance,
              };
            }
          )
          .filter(
            row => {
              if (
                varianceFilter
                  === ALL
              ) {
                return true;
              }

              if (
                varianceFilter
                  === 'over'
              ) {
                return (
                  row.selectedVariance
                  > 0
                );
              }

              if (
                varianceFilter
                  === 'under'
              ) {
                return (
                  row.selectedVariance
                  < 0
                );
              }

              return (
                Math.abs(
                  row.selectedVariance
                ) < 0.01
              );
            }
          );
      },
      [
        sourceMode,
        rangeValid,
        currentProjects,
        currentMonthly,
        normalizedSearch,
        pmFilter,
        projectTypeFilter,
        purposeFilter,
        forecastStateFilter,
        normalizedGc,
        peFilter,
        superintendentFilter,
        apmFilter,
        foundationFilter,
        varianceFilter,
        fromMonth,
        throughMonth,
      ],
    );


  const bidDetails =
    useMemo(
      () => {
        if (
          sourceMode === 'current'
          || !rangeValid
        ) {
          return [];
        }

        return activeBids
          .filter(
            row => {
              if (
                !bidMatchesSearch(
                  row,
                  normalizedSearch,
                )
              ) {
                return false;
              }

              if (
                pmFilter !== ALL
                && pmKey(row.pm)
                  !== pmFilter
              ) {
                return false;
              }

              if (
                projectTypeFilter
                  !== ALL
                && normalizeProjectType(
                  row.projectType
                ) !==
                  projectTypeFilter
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
                forecastStateFilter
                  !== ALL
                && row.forecastState
                  !== forecastStateFilter
              ) {
                return false;
              }

              if (
                normalizedGc
                && !containsText(
                  row.generalContractors,
                  normalizedGc,
                )
              ) {
                return false;
              }

              if (
                bidStatusFilter
                  !== ALL
                && row.status
                  !== bidStatusFilter
              ) {
                return false;
              }

              if (
                probabilityStateFilter
                  !== ALL
                && row.probabilityState
                  !== probabilityStateFilter
              ) {
                return false;
              }

              if (
                stateFilter !== ALL
                && row.state
                  !== stateFilter
              ) {
                return false;
              }

              if (
                !booleanFilterMatch(
                  row.isNewBid,
                  isNewBidFilter,
                )
              ) {
                return false;
              }

              if (
                !booleanFilterMatch(
                  row.snoozed,
                  snoozedFilter,
                )
              ) {
                return false;
              }

              return true;
            }
          )
          .map(
            row => {
              const monthly =
                aggregateBidMonthly(
                  bidMonthly.get(
                    row.sharePointItemId
                  ),
                  fromMonth,
                  throughMonth,
                );

              return {
                ...row,
                selectedBidForecast:
                  monthly.forecast,
                selectedWeightedForecast:
                  monthly.weighted,
              };
            }
          );
      },
      [
        sourceMode,
        rangeValid,
        activeBids,
        bidMonthly,
        normalizedSearch,
        pmFilter,
        projectTypeFilter,
        purposeFilter,
        forecastStateFilter,
        normalizedGc,
        bidStatusFilter,
        probabilityStateFilter,
        stateFilter,
        isNewBidFilter,
        snoozedFilter,
        fromMonth,
        throughMonth,
      ],
    );


  const currentProjectedTotal =
    currentDetails.reduce(
      (
        total,
        row,
      ) =>
        total
        + row.selectedProjected,
      0,
    );

  const currentActualTotal =
    currentDetails.reduce(
      (
        total,
        row,
      ) =>
        total
        + row.selectedActual,
      0,
    );

  const weightedBidTotal =
    bidDetails.reduce(
      (
        total,
        row,
      ) =>
        total
        + row.selectedWeightedForecast,
      0,
    );

  const rawBidTotal =
    bidDetails.reduce(
      (
        total,
        row,
      ) =>
        total
        + row.selectedBidForecast,
      0,
    );

  const combinedExpected =
    currentProjectedTotal
    + weightedBidTotal;


  const monthlyComparison =
    useMemo(
      () => {
        if (!rangeValid) {
          return [];
        }

        return monthRange.map(
          month => {
            let currentProjected = 0;
            let currentActual = 0;
            let weightedBids = 0;

            for (
              const row
              of currentDetails
            ) {
              const monthlyRows =
                currentMonthly.get(
                  row.jobListId
                )
                || [];

              for (
                const monthly
                of monthlyRows
              ) {
                if (
                  monthKey(
                    monthly.monthStart
                  ) !== month
                ) {
                  continue;
                }

                currentProjected +=
                  toNumber(
                    monthly.projectedAmount
                  );

                currentActual +=
                  toNumber(
                    monthly.actualAmount
                  );
              }
            }

            for (
              const row
              of bidDetails
            ) {
              const monthlyRows =
                bidMonthly.get(
                  row.sharePointItemId
                )
                || [];

              for (
                const monthly
                of monthlyRows
              ) {
                if (
                  monthKey(
                    monthly.monthStart
                  ) !== month
                ) {
                  continue;
                }

                weightedBids +=
                  toNumber(
                    monthly.weightedMonthlyForecastAmount
                  );
              }
            }

            return {
              month,
              currentProjected,
              currentActual,
              weightedBids,
              combinedExpected:
                currentProjected
                + weightedBids,
            };
          }
        );
      },
      [
        rangeValid,
        monthRange,
        currentDetails,
        bidDetails,
        currentMonthly,
        bidMonthly,
      ],
    );


  const detailRows =
    useMemo(
      () => {
        const currentRows =
          currentDetails.map(
            row => ({
              key:
                `current-${row.jobListId}`,
              source:
                'Current Project',
              nativeId:
                row.jobListId,
              number:
                row.jobNumber,
              name:
                row.jobName,
              pm:
                displayValue(
                  row.pm,
                  'No PM Assigned',
                ),
              projectType:
                projectTypeLabel(
                  row.projectType
                ),
              purpose:
                displayValue(
                  row.purpose
                ),
              gc:
                displayValue(
                  row.generalContractors
                ),
              state:
                row.forecastState,
              expected:
                row.selectedProjected,
              actual:
                row.selectedActual,
              variance:
                row.selectedVariance,
              probability:
                null,
              location:
                displayValue(
                  row.cityStateZip
                ),
              raw:
                row,
            })
          );

        const bidRows =
          bidDetails.map(
            row => ({
              key:
                `bid-${row.sharePointItemId}`,
              source:
                'Active Bid',
              nativeId:
                row.sharePointItemId,
              number:
                null,
              name:
                row.bidName,
              pm:
                displayValue(
                  row.pm,
                  'No PM Assigned',
                ),
              projectType:
                projectTypeLabel(
                  row.projectType
                ),
              purpose:
                displayValue(
                  row.purpose
                ),
              gc:
                displayValue(
                  row.generalContractors
                ),
              state:
                row.forecastState,
              expected:
                row.selectedWeightedForecast,
              actual:
                null,
              variance:
                null,
              probability:
                row.probability,
              location:
                [
                  row.city,
                  row.state,
                ]
                  .filter(Boolean)
                  .join(', '),
              raw:
                row,
            })
          );

        return [
          ...currentRows,
          ...bidRows,
        ].sort(
          (a, b) => {
            if (
              b.expected !== a.expected
            ) {
              return (
                b.expected
                - a.expected
              );
            }

            return String(
              a.name || ''
            ).localeCompare(
              String(
                b.name || ''
              )
            );
          }
        );
      },
      [
        currentDetails,
        bidDetails,
      ],
    );


  function exportCurrentView() {
    const headers = [
      'SourceType',
      'NativeID',
      'JobNumber',
      'Name',
      'PM',
      'ProjectTypeNormalized',
      'ProjectTypeSource',
      'Purpose',
      'GeneralContractor',
      'Location',
      'ForecastState',
      'ForecastFrom',
      'ForecastThrough',
      'SelectedExpectedAmount',
      'CurrentProjectProjectedAmount',
      'WeightedActiveBidAmount',
      'UnweightedActiveBidAmount',
      'CurrentProjectActualAmount',
      'CurrentProjectVariance',
      'Probability',
    ];

    const rows = [
      ...currentDetails.map(
        row => ({
          SourceType:
            'Current Project',
          NativeID:
            row.jobListId,
          JobNumber:
            row.jobNumber,
          Name:
            row.jobName,
          PM:
            row.pm,
          ProjectTypeNormalized:
            projectTypeLabel(
              row.projectType
            ),
          ProjectTypeSource:
            row.projectType,
          Purpose:
            row.purpose,
          GeneralContractor:
            row.generalContractors,
          Location:
            row.cityStateZip,
          ForecastState:
            row.forecastState,
          ForecastFrom:
            fromMonth,
          ForecastThrough:
            throughMonth,
          SelectedExpectedAmount:
            row.selectedProjected,
          CurrentProjectProjectedAmount:
            row.selectedProjected,
          WeightedActiveBidAmount:
            '',
          UnweightedActiveBidAmount:
            '',
          CurrentProjectActualAmount:
            row.selectedActual,
          CurrentProjectVariance:
            row.selectedVariance,
          Probability:
            '',
        })
      ),

      ...bidDetails.map(
        row => ({
          SourceType:
            'Active Bid',
          NativeID:
            row.sharePointItemId,
          JobNumber:
            '',
          Name:
            row.bidName,
          PM:
            row.pm,
          ProjectTypeNormalized:
            projectTypeLabel(
              row.projectType
            ),
          ProjectTypeSource:
            row.projectType,
          Purpose:
            row.purpose,
          GeneralContractor:
            displayValue(
              row.generalContractors,
              '',
            ),
          Location:
            [
              row.city,
              row.state,
            ]
              .filter(Boolean)
              .join(', '),
          ForecastState:
            row.forecastState,
          ForecastFrom:
            fromMonth,
          ForecastThrough:
            throughMonth,
          SelectedExpectedAmount:
            row.selectedWeightedForecast,
          CurrentProjectProjectedAmount:
            '',
          WeightedActiveBidAmount:
            row.selectedWeightedForecast,
          UnweightedActiveBidAmount:
            row.selectedBidForecast,
          CurrentProjectActualAmount:
            '',
          CurrentProjectVariance:
            '',
          Probability:
            row.probability,
        })
      ),
    ];

    downloadCsv(
      (
        'riggs-projected-billings-'
        + `${sourceMode}-`
        + `${fromMonth}-to-${throughMonth}.csv`
      ),
      headers,
      rows,
    );
  }


  function resetFilters() {
    setSearch('');
    setPmFilter(ALL);
    setProjectTypeFilter(ALL);
    setPurposeFilter(ALL);
    setForecastStateFilter(ALL);
    setGcFilter('');
    setPeFilter(ALL);
    setSuperintendentFilter(ALL);
    setApmFilter(ALL);
    setFoundationFilter(ALL);
    setVarianceFilter(ALL);
    setBidStatusFilter(ALL);
    setProbabilityStateFilter(ALL);
    setStateFilter(ALL);
    setIsNewBidFilter(ALL);
    setSnoozedFilter(ALL);
  }


  if (loading) {
    return (
      <div className="loading-screen">
        Loading Riggs Bid Log…
      </div>
    );
  }


  if (!user) {
    return (
      <SignInView
        theme={theme}
        setTheme={setTheme}
        authError={authError}
      />
    );
  }


  const progressPercent =
    monthlyProgress.total > 0
      ? Math.round(
          (
            monthlyProgress.loaded
            / monthlyProgress.total
          )
          * 100
        )
      : 100;

  const maxMonthlyValue =
    Math.max(
      1,
      ...monthlyComparison
        .flatMap(
          row => [
            row.currentProjected,
            row.weightedBids,
            row.combinedExpected,
            row.currentActual,
          ]
        ),
    );


  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-area">
          <div className="brand">
            <div className="brand-mark">
              R
            </div>

            <div className="brand-copy">
              <strong>Bid Log</strong>
              <span>
                Riggs Companies
              </span>
            </div>
          </div>

          <nav className="app-nav">
            <button
              type="button"
              className={
                activePage === 'projected'
                  ? 'active'
                  : ''
              }
              onClick={() => setActivePage('projected')}
            >
              Projected Billings
            </button>

            <button
              type="button"
              className={
                activePage === 'accountability'
                  ? 'active'
                  : ''
              }
              onClick={() => setActivePage('accountability')}
            >
              Project Accountability
            </button>
          </nav>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="top-button"
            onClick={verifyApi}
          >
            Verify API
          </button>

          <ThemeControl
            theme={theme}
            onChange={setTheme}
          />

          <div className="current-user">
            <strong>
              {user.displayName}
            </strong>

            <span>
              {user.appRole}
            </span>
          </div>

          <button
            type="button"
            className="top-button"
            onClick={signOut}
          >
            Sign Out
          </button>
        </div>
      </header>


      {activePage === 'projected' ? (
      <main className="page-shell">
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              FORECASTING
            </div>

            <h1>
              Projected Billings
            </h1>

            <p>
              Compare current project forecasts
              with probability-weighted active bids.
              Foundation actual billings remain separate.
            </p>
          </div>

          <div className="heading-actions">
            <span className="role-chip">
              {user.appRole}
            </span>

            <button
              type="button"
              className="secondary-button"
              onClick={exportCurrentView}
              disabled={
                dataLoading
                || !rangeValid
              }
            >
              Export CSV
            </button>
          </div>
        </div>


        <section className="mode-tabs">
          <button
            type="button"
            className={
              sourceMode === 'combined'
                ? 'active'
                : ''
            }
            onClick={
              () =>
                setSourceMode(
                  'combined'
                )
            }
          >
            Combined
          </button>

          <button
            type="button"
            className={
              sourceMode === 'active'
                ? 'active'
                : ''
            }
            onClick={
              () =>
                setSourceMode(
                  'active'
                )
            }
          >
            Active Bids
            <span>
              {activeBids.length}
            </span>
          </button>

          <button
            type="button"
            className={
              sourceMode === 'current'
                ? 'active'
                : ''
            }
            onClick={
              () =>
                setSourceMode(
                  'current'
                )
            }
          >
            Current Projects
            <span>
              {currentProjects.length}
            </span>
          </button>
        </section>


        {dataError && (
          <div
            className="page-alert"
            role="alert"
          >
            <strong>
              Projected billings could not be loaded.
            </strong>

            <span>
              {dataError}
            </span>
          </div>
        )}


        <section className="filter-panel">
          <div className="filter-grid primary-filters">
            <TextField
              label="Search"
              value={search}
              onChange={setSearch}
              placeholder="Project, bid, job #, GC, city…"
            />

            <SelectField
              label="PM"
              value={pmFilter}
              onChange={setPmFilter}
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
            </SelectField>

            <label className="filter-field">
              <span>
                From Month
              </span>

              <input
                type="month"
                value={fromMonth}
                onChange={
                  event =>
                    setFromMonth(
                      event.target.value
                    )
                }
              />
            </label>

            <label className="filter-field">
              <span>
                Through Month
              </span>

              <input
                type="month"
                value={throughMonth}
                onChange={
                  event =>
                    setThroughMonth(
                      event.target.value
                    )
                }
              />
            </label>

            <div className="filter-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={
                  () =>
                    setShowMoreFilters(
                      value => !value
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
          </div>


          {showMoreFilters && (
            <div className="more-filters">
              <div className="filter-grid">
                <SelectField
                  label="Project Type"
                  value={projectTypeFilter}
                  onChange={setProjectTypeFilter}
                >
                  <option value={ALL}>
                    All Types
                  </option>

                  {projectTypeOptions.map(
                    value => (
                      <option
                        key={value}
                        value={value}
                      >
                        {projectTypeLabel(value)}
                      </option>
                    )
                  )}
                </SelectField>

                <SelectField
                  label="Purpose"
                  value={purposeFilter}
                  onChange={setPurposeFilter}
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
                </SelectField>

                <SelectField
                  label="Forecast State"
                  value={forecastStateFilter}
                  onChange={setForecastStateFilter}
                >
                  <option value={ALL}>
                    All States
                  </option>

                  <option value="READY">
                    Ready
                  </option>

                  <option value="NOT_CONFIGURED">
                    Not Configured
                  </option>
                </SelectField>

                <TextField
                  label="General Contractor"
                  value={gcFilter}
                  onChange={setGcFilter}
                  placeholder="Search GC…"
                />
              </div>


              {sourceMode !== 'active' && (
                <div className="source-filter-group">
                  <div className="filter-group-title">
                    Current Project Filters
                  </div>

                  <div className="filter-grid">
                    <SelectField
                      label="PE"
                      value={peFilter}
                      onChange={setPeFilter}
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
                    </SelectField>

                    <SelectField
                      label="Superintendent"
                      value={superintendentFilter}
                      onChange={setSuperintendentFilter}
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
                    </SelectField>

                    <SelectField
                      label="APM"
                      value={apmFilter}
                      onChange={setApmFilter}
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
                    </SelectField>

                    <SelectField
                      label="Foundation History"
                      value={foundationFilter}
                      onChange={setFoundationFilter}
                    >
                      <option value={ALL}>
                        All
                      </option>

                      <option value="true">
                        Has Billings
                      </option>

                      <option value="false">
                        No Billings
                      </option>
                    </SelectField>

                    <SelectField
                      label="Selected Variance"
                      value={varianceFilter}
                      onChange={setVarianceFilter}
                    >
                      <option value={ALL}>
                        All
                      </option>

                      <option value="over">
                        Actual Over Forecast
                      </option>

                      <option value="under">
                        Actual Under Forecast
                      </option>

                      <option value="even">
                        Even
                      </option>
                    </SelectField>
                  </div>
                </div>
              )}


              {sourceMode !== 'current' && (
                <div className="source-filter-group">
                  <div className="filter-group-title">
                    Active Bid Filters
                  </div>

                  <div className="filter-grid">
                    <SelectField
                      label="Bid Status"
                      value={bidStatusFilter}
                      onChange={setBidStatusFilter}
                    >
                      <option value={ALL}>
                        All Statuses
                      </option>

                      {bidStatusOptions.map(
                        value => (
                          <option
                            key={value}
                            value={value}
                          >
                            {value}
                          </option>
                        )
                      )}
                    </SelectField>

                    <SelectField
                      label="Probability"
                      value={probabilityStateFilter}
                      onChange={setProbabilityStateFilter}
                    >
                      <option value={ALL}>
                        All
                      </option>

                      {probabilityStateOptions.map(
                        value => (
                          <option
                            key={value}
                            value={value}
                          >
                            {value === 'VALID'
                              ? 'Valid'
                              : 'Missing / Invalid'}
                          </option>
                        )
                      )}
                    </SelectField>

                    <SelectField
                      label="State"
                      value={stateFilter}
                      onChange={setStateFilter}
                    >
                      <option value={ALL}>
                        All States
                      </option>

                      {stateOptions.map(
                        value => (
                          <option
                            key={value}
                            value={value}
                          >
                            {value}
                          </option>
                        )
                      )}
                    </SelectField>

                    <SelectField
                      label="New Bid"
                      value={isNewBidFilter}
                      onChange={setIsNewBidFilter}
                    >
                      <option value={ALL}>
                        All
                      </option>

                      <option value="true">
                        New
                      </option>

                      <option value="false">
                        Existing
                      </option>
                    </SelectField>

                    <SelectField
                      label="Snoozed"
                      value={snoozedFilter}
                      onChange={setSnoozedFilter}
                    >
                      <option value={ALL}>
                        All
                      </option>

                      <option value="true">
                        Snoozed
                      </option>

                      <option value="false">
                        Not Snoozed
                      </option>
                    </SelectField>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>


        {!rangeValid && (
          <div className="page-alert">
            <strong>
              Invalid forecast range.
            </strong>

            <span>
              Through Month must be on or after
              From Month, with a maximum range of
              121 months.
            </span>
          </div>
        )}


        {dataLoading && (
          <section className="loading-panel">
            <div>
              <strong>
                Loading monthly allocations
              </strong>

              <span>
                {monthlyProgress.loaded}
                {' / '}
                {monthlyProgress.total}
              </span>
            </div>

            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width:
                    `${progressPercent}%`,
                }}
              />
            </div>

            <small>
              Current Projects are cached once.
              Only forecast-ready Active Bids request
              monthly allocation rows.
            </small>
          </section>
        )}


        <section className="stats-grid">
          <StatCard
            label="Current Project Forecast"
            value={
              dataLoading
                ? 'Loading…'
                : currency(
                    currentProjectedTotal
                  )
            }
            detail={
              sourceMode === 'active'
                ? 'Excluded in Active Bids mode'
                : `${currentDetails.length} filtered projects`
            }
          />

          <StatCard
            label="Weighted Active Bids"
            value={
              dataLoading
                ? 'Loading…'
                : currency(
                    weightedBidTotal
                  )
            }
            detail={
              sourceMode === 'current'
                ? 'Excluded in Current Projects mode'
                : `${bidDetails.length} filtered bids · ${currency(rawBidTotal)} unweighted`
            }
          />

          <StatCard
            label="Combined Expected"
            value={
              dataLoading
                ? 'Loading…'
                : currency(
                    combinedExpected
                  )
            }
            detail={
              rangeValid
                ? `${monthLabel(fromMonth)} through ${monthLabel(throughMonth)}`
                : 'Select a valid forecast month range'
            }
            emphasis
          />

          <StatCard
            label="Current Project Actual"
            value={
              dataLoading
                ? 'Loading…'
                : currency(
                    currentActualTotal
                  )
            }
            detail="Foundation actuals · shown separately"
          />
        </section>


        <section className="content-card">
          <div className="section-heading">
            <div>
              <span className="section-kicker">
                MONTHLY COMPARISON
              </span>

              <h2>
                Expected vs. actual
              </h2>
            </div>

            <span className="section-note">
              Combined expected excludes actual billing
            </span>
          </div>

          <div className="monthly-table-wrap">
            <table className="monthly-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>
                    Current Forecast
                  </th>
                  <th>
                    Weighted Bids
                  </th>
                  <th>
                    Combined Expected
                  </th>
                  <th>
                    Current Actual
                  </th>
                  <th className="visual-column">
                    Comparison
                  </th>
                </tr>
              </thead>

              <tbody>
                {monthlyComparison.map(
                  row => (
                    <tr key={row.month}>
                      <td className="month-cell">
                        {monthLabel(
                          row.month
                        )}
                      </td>

                      <td>
                        {currency(
                          row.currentProjected
                        )}
                      </td>

                      <td>
                        {currency(
                          row.weightedBids
                        )}
                      </td>

                      <td className="strong-cell">
                        {currency(
                          row.combinedExpected
                        )}
                      </td>

                      <td>
                        {currency(
                          row.currentActual
                        )}
                      </td>

                      <td className="visual-column">
                        <div className="comparison-bars">
                          <div
                            className="comparison-bar expected"
                            style={{
                              width:
                                `${
                                  (
                                    row.combinedExpected
                                    / maxMonthlyValue
                                  )
                                  * 100
                                }%`,
                            }}
                            title="Combined Expected"
                          />

                          <div
                            className="comparison-bar actual"
                            style={{
                              width:
                                `${
                                  (
                                    row.currentActual
                                    / maxMonthlyValue
                                  )
                                  * 100
                                }%`,
                            }}
                            title="Current Project Actual"
                          />
                        </div>
                      </td>
                    </tr>
                  )
                )}

                {!monthlyComparison.length && (
                  <tr>
                    <td
                      colSpan="6"
                      className="empty-cell"
                    >
                      No monthly range selected.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>


        <section className="content-card">
          <div className="section-heading">
            <div>
              <span className="section-kicker">
                FILTERED DETAIL
              </span>

              <h2>
                Forecast sources
              </h2>
            </div>

            <span className="section-note">
              {detailRows.length} rows
            </span>
          </div>

          <div className="detail-table-wrap">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Project / Bid</th>
                  <th>PM</th>
                  <th>Type</th>
                  <th>Purpose</th>
                  <th>GC</th>
                  <th>Forecast State</th>
                  <th className="numeric">
                    Expected
                  </th>
                  <th className="numeric">
                    Actual
                  </th>
                  <th className="numeric">
                    Variance
                  </th>
                </tr>
              </thead>

              <tbody>
                {detailRows.map(
                  row => (
                    <tr key={row.key}>
                      <td>
                        <span
                          className={
                            row.source
                              === 'Active Bid'
                              ? 'source-chip bid'
                              : 'source-chip current'
                          }
                        >
                          {row.source}
                        </span>
                      </td>

                      <td className="project-cell">
                        <strong>
                          {displayValue(
                            row.name
                          )}
                        </strong>

                        <span>
                          {row.number
                            ? `Job ${row.number}`
                            : `Bid ${row.nativeId}`}
                          {row.location
                            ? ` · ${row.location}`
                            : ''}
                        </span>
                      </td>

                      <td>
                        {row.pm}
                      </td>

                      <td>
                        {row.projectType}
                      </td>

                      <td>
                        {row.purpose}
                      </td>

                      <td className="gc-cell">
                        {row.gc}
                      </td>

                      <td>
                        <div className="state-cell">
                          <span
                            className={
                              row.state === 'READY'
                                ? 'state-dot ready'
                                : 'state-dot'
                            }
                          />

                          <span>
                            {row.state === 'READY'
                              ? 'Ready'
                              : 'Not Configured'}
                          </span>

                          {row.probability !== null
                            && row.probability !== undefined
                            ? (
                              <small>
                                {percent(
                                  row.probability
                                )}
                              </small>
                            )
                            : null}
                        </div>
                      </td>

                      <td className="numeric strong-cell">
                        {currency(
                          row.expected
                        )}
                      </td>

                      <td className="numeric">
                        {row.actual === null
                          ? '—'
                          : currency(
                              row.actual
                            )}
                      </td>

                      <td
                        className={
                          row.variance === null
                            ? 'numeric'
                            : (
                              row.variance > 0
                                ? 'numeric variance-positive'
                                : (
                                  row.variance < 0
                                    ? 'numeric variance-negative'
                                    : 'numeric'
                                )
                            )
                        }
                      >
                        {row.variance === null
                          ? '—'
                          : currency(
                              row.variance
                            )}
                      </td>
                    </tr>
                  )
                )}

                {!detailRows.length && (
                  <tr>
                    <td
                      colSpan="10"
                      className="empty-cell"
                    >
                      {dataLoading
                        ? 'Loading forecast detail…'
                        : 'No records match the current filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      ) : (
        <ProjectAccountability
          user={user}
        />
      )}
    </div>
  );
}
