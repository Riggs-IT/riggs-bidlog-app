import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import ProjectAccountability from './ProjectAccountability.jsx';
import CurrentProjectBillingDrawer from './CurrentProjectBillingDrawer.jsx';
import ProjectBillingPivot from './ProjectBillingPivot.jsx';
import useStickyTableHeader from './useStickyTableHeader.js';


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

  return 'dark';
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
      'Sign in with your Riggs Companies Microsoft account to continue.',

    session_inactive_timeout:
      'Your session ended after 1 hour of inactivity. Sign in again to continue.',

    invalid_session:
      'Your previous Bid Log session is no longer valid. Sign in again to continue.',

    microsoft_sign_in_failed:
      'Microsoft sign-in could not be completed. Try again, or contact Riggs IT if the problem continues.',

    microsoft_identity_missing:
      'Microsoft did not return the identity information Bid Log needs. Try signing in again.',

    bid_log_user_not_authorized:
      'Your Riggs Companies account is not currently authorized to use Bid Log.',

    bid_log_identity_conflict:
      'Your Riggs Companies account could not be matched to a single Bid Log access record. Contact Riggs IT.',

    entra_not_configured:
      'Microsoft sign-in is temporarily unavailable for Bid Log. Contact Riggs IT if the problem continues.',

    data_api_cloudflare_access_rejected:
      'Bid Log could not verify application access. Try again in a moment.',

    data_api_bid_log_service_auth_rejected:
      'Bid Log could not verify application access. Try again in a moment.',

    sql_capacity_unavailable:
      'Riggs data services are busy right now. Try again in a moment.',

    sql_unavailable:
      'Riggs data services are temporarily unavailable.',

    data_api_unavailable:
      'Bid Log could not reach Riggs data services. Check your connection and try again.',

    data_api_not_configured:
      'Bid Log services are temporarily unavailable.',

    invalid_data_api_response:
      'Bid Log received an unexpected response from Riggs data services.',

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


function projectMonthDisplay(
  effectiveStartDate,
  estimatedDurationMonths,
) {
  const duration =
    Number(
      estimatedDurationMonths
    );

  if (
    !effectiveStartDate
    || !Number.isFinite(duration)
    || duration <= 0
  ) {
    return {
      label: '—',
      sortValue: null,
    };
  }


  const start =
    new Date(
      `${String(effectiveStartDate).slice(0, 10)}T12:00:00`
    );


  if (
    Number.isNaN(
      start.getTime()
    )
  ) {
    return {
      label: '—',
      sortValue: null,
    };
  }


  const now =
    new Date();


  const monthDifference =
    (
      now.getFullYear()
      - start.getFullYear()
    ) * 12
    + now.getMonth()
    - start.getMonth();


  if (monthDifference < 0) {
    return {
      label:
        `Starts ${monthLabel(
          monthKey(
            effectiveStartDate
          )
        )}`,

      sortValue:
        0,
    };
  }


  const currentMonth =
    Math.min(
      duration,
      monthDifference + 1,
    );


  return {
    label:
      `${currentMonth}/${duration}`,

    sortValue:
      currentMonth,
  };
}


function pmBadgeTextColor(
  hexColor,
) {
  const match =
    String(
      hexColor || ''
    )
      .trim()
      .match(
        /^#?([0-9a-f]{6})$/i
      );


  if (!match) {
    return '#ffffff';
  }


  const value =
    match[1];


  const red =
    parseInt(
      value.slice(0, 2),
      16,
    );

  const green =
    parseInt(
      value.slice(2, 4),
      16,
    );

  const blue =
    parseInt(
      value.slice(4, 6),
      16,
    );


  const luminance =
    (
      red * 299
      + green * 587
      + blue * 114
    ) / 1000;


  return luminance > 160
    ? '#111111'
    : '#ffffff';
}


function PMInitialsBadge({
  initials,
  hexColor,
}) {
  const value =
    String(
      initials || ''
    ).trim();


  if (!value) {
    return (
      <span className="pm-badge-empty">
        —
      </span>
    );
  }


  const background =
    /^#[0-9a-f]{6}$/i.test(
      String(
        hexColor || ''
      ).trim()
    )
      ? String(
          hexColor
        ).trim()
      : '#4b5563';


  return (
    <span
      className="pm-initials-badge"
      title="Project Manager"
      style={{
        backgroundColor:
          background,

        color:
          pmBadgeTextColor(
            background
          ),
      }}
    >
      {value}
    </span>
  );
}


function SortHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  firstDirection = 'asc',
  numeric = false,
}) {
  const ascending =
    currentSort
    === `${sortKey}-asc`;


  const descending =
    currentSort
    === `${sortKey}-desc`;


  const active =
    ascending
    || descending;


  return (
    <th
      className={
        numeric
          ? 'numeric sortable-column'
          : 'sortable-column'
      }
      aria-sort={
        ascending
          ? 'ascending'
          : (
              descending
                ? 'descending'
                : 'none'
            )
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
          {ascending
            ? '↑'
            : (
                descending
                  ? '↓'
                  : '↕'
              )}
        </span>
      </button>
    </th>
  );
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
  let marginCollected = 0;

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

    marginCollected +=
      toNumber(
        row.marginCollected
      );
  }

  return {
    projected,
    actual,
    marginCollected,
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


function MicrosoftMark() {
  return (
    <span
      className="microsoft-mark"
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}


function SignInView({
  authError,
}) {
  const params =
    new URLSearchParams(
      window.location.search,
    );

  const signedOutValue =
    params.get('signed_out');

  const isSignedOut =
    signedOutValue === '1';

  const isTimeout =
    signedOutValue === 'timeout'
    || authError === 'session_inactive_timeout';

  const hasError =
    Boolean(authError)
    && !isTimeout;

  let statusLabel = 'SIGN IN';
  let heading = 'Sign in to Bid Log';
  let message =
    'Use your Riggs Companies Microsoft account to continue.';
  let actionLabel =
    'Continue with Microsoft';
  let statusClass = '';

  if (isSignedOut) {
    statusLabel = 'SIGNED OUT';
    heading = "You're signed out";
    message =
      'Your Bid Log session has ended securely.';
    actionLabel = 'Sign back in';
    statusClass = 'success';
  } else if (isTimeout) {
    statusLabel = 'SESSION ENDED';
    heading = 'Your session ended';
    message =
      friendlyError(
        'session_inactive_timeout'
      );
    actionLabel = 'Sign in again';
    statusClass = 'notice';
  } else if (hasError) {
    statusLabel = 'SIGN-IN ISSUE';
    heading = "We couldn't sign you in";
    message =
      friendlyError(authError);
    actionLabel = 'Try again';
    statusClass = 'error';
  }

  return (
    <div className="auth-page">
      <div
        className="auth-blueprint-grid"
        aria-hidden="true"
      />

      <header className="auth-header">
        <div className="auth-company-brand">
          <div className="auth-riggs-mark">
            R
          </div>

          <div className="auth-company-copy">
            <strong>
              RIGGS COMPANIES
            </strong>
            <span>
              Internal Business Systems
            </span>
          </div>
        </div>

        <div className="auth-header-note">
          Authorized personnel only
        </div>
      </header>

      <main className="auth-layout">
        <section className="auth-intro">
          <div className="auth-kicker">
            ESTIMATING · PROJECTED BILLINGS · PROJECT HISTORY
          </div>

          <h1>
            Bid Log
          </h1>

          <div className="auth-product-title">
            Estimating &amp; Projected Billings
          </div>

          <p className="auth-intro-copy">
            A secure internal workspace for Riggs Companies bidding,
            projected billings, and completed-project performance.
          </p>

          <div className="auth-trust-list">
            <div>
              <span className="auth-trust-icon">✓</span>
              <span>
                Riggs Companies Microsoft account required
              </span>
            </div>

            <div>
              <span className="auth-trust-icon">✓</span>
              <span>
                Access limited to authorized employees
              </span>
            </div>

            <div>
              <span className="auth-trust-icon">✓</span>
              <span>
                Sessions automatically expire when inactive
              </span>
            </div>
          </div>
        </section>

        <section className="auth-access-column">
          <div className="auth-access-panel">
            <div
              className={
                `auth-state-label ${statusClass}`
              }
            >
              {statusLabel}
            </div>

            <h2>
              {heading}
            </h2>

            <p className="auth-access-copy">
              {message}
            </p>

            {hasError && (
              <div
                className="auth-support-note"
                role="alert"
              >
                If this continues, contact Riggs IT.
              </div>
            )}

            <a
              className="auth-microsoft-button"
              href="/api/auth/login"
            >
              <span className="auth-microsoft-button-main">
                <MicrosoftMark />
                <span>{actionLabel}</span>
              </span>

              <span
                className="auth-button-arrow"
                aria-hidden="true"
              >
                →
              </span>
            </a>

            <div className="auth-protection-note">
              Protected by Riggs Companies Microsoft authentication
            </div>
          </div>
        </section>
      </main>

      <footer className="auth-footer">
        <span>
          © {new Date().getFullYear()} Riggs Companies
        </span>

        <span>
          Bid Log · Internal application
        </span>
      </footer>
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
    selectedCurrentProject,
    setSelectedCurrentProject,
  ] = useState(null);

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
    bidScope,
    setBidScope,
  ] = useState(
    'none'
  );

  const [
    detailSort,
    setDetailSort,
  ] = useState(
    'job-desc'
  );

  const [
    selectedComparisonMonth,
    setSelectedComparisonMonth,
  ] = useState(null);

  const [
    monthlyComparisonOpen,
    setMonthlyComparisonOpen,
  ] = useState(true);

  const [
    monthlyComparisonView,
    setMonthlyComparisonView,
  ] = useState('month');

  const monthlySummaryTableRef =
    useStickyTableHeader(
      monthlyComparisonView
    );

  const billingDetailTableRef =
    useStickyTableHeader(
      detailSort
    );

  const [
    includeActiveProjects,
    setIncludeActiveProjects,
  ] = useState(true);

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

          const signedOut =
            params.get('signed_out');

          const callbackError =
            params.get('auth_error');

          if (signedOut === 'timeout') {
            setAuthError(
              'session_inactive_timeout'
            );
          } else if (callbackError) {
            setAuthError(
              callbackError
            );
          } else if (
            detail
            !== 'authentication_required'
          ) {
            setAuthError(detail);
          } else {
            setAuthError(null);
          }
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
        let loadedBatches = 0;

        setMonthlyProgress({
          loaded: 0,
          total: 3,
        });


        const track = promise =>
          promise.then(
            payload => {
              loadedBatches += 1;

              if (!cancelled) {
                setMonthlyProgress({
                  loaded:
                    loadedBatches,

                  total:
                    3,
                });
              }

              return payload;
            }
          );


        const [
          currentPayload,
          currentMonthlyPayload,
          bidDashboardPayload,
        ] = await Promise.all([
          track(
            fetchJson(
              '/api/projected-billings/current-projects'
            )
          ),

          track(
            fetchJson(
              '/api/projected-billings/current-projects/monthly'
            )
          ),

          track(
            fetchJson(
              '/api/projected-billings/active-bids/dashboard'
            )
          ),
        ]);


        const bidPayload =
          bidDashboardPayload
            ?.projects
          || {};


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


        const currentMap =
          new Map(
            (
              currentMonthlyPayload
                ?.items
              || []
            ).map(
              row => [
                row.jobListId,
                row.items || [],
              ]
            )
          );


        const bidMap =
          new Map(
            (
              bidDashboardPayload
                ?.monthly
              || []
            ).map(
              row => [
                row.sharePointItemId,
                row.items || [],
              ]
            )
          );


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


  const includeBids =
    bidScope !== 'none';

  const selectedBidSourceRows =
    useMemo(
      () => {
        if (!includeBids) {
          return [];
        }

        if (bidScope === 'potential') {
          return activeBids.filter(
            row =>
              Number(row.probability) >= 0.85
          );
        }

        return activeBids;
      },
      [
        activeBids,
        bidScope,
        includeBids,
      ],
    );

  const potentialBidCount =
    useMemo(
      () =>
        activeBids.filter(
          row =>
            Number(row.probability) >= 0.85
        ).length,
      [activeBids],
    );

  const sourceSelectionKey =
    `${bidScope}-${includeActiveProjects ? 'projects' : 'no-projects'}`;


  function toggleBidScope(scope) {
    if (bidScope === scope) {
      if (includeActiveProjects) {
        setBidScope('none');
      }

      return;
    }

    setBidScope(scope);
  }


  function toggleActiveProjects() {
    if (
      includeActiveProjects
      && bidScope === 'none'
    ) {
      return;
    }

    setIncludeActiveProjects(
      value => !value
    );
  }



  function toggleDetailSort(
    key,
    firstDirection = 'asc',
  ) {
    setDetailSort(
      current => {
        const ascending =
          `${key}-asc`;

        const descending =
          `${key}-desc`;


        if (
          current === ascending
        ) {
          return descending;
        }


        if (
          current === descending
        ) {
          return ascending;
        }


        return (
          `${key}-${firstDirection}`
        );
      }
    );
  }


  const pmOptions =
    useMemo(
      () => {
        const values = [];

        if (
          includeActiveProjects
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
          includeBids
        ) {
          values.push(
            ...selectedBidSourceRows.map(
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
        includeActiveProjects,
        includeBids,
        currentProjects,
        selectedBidSourceRows,
      ],
    );


  const projectTypeOptions =
    useMemo(
      () => {
        const values = [];

        if (
          includeActiveProjects
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
          includeBids
        ) {
          values.push(
            ...selectedBidSourceRows.map(
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
        includeActiveProjects,
        includeBids,
        currentProjects,
        selectedBidSourceRows,
      ],
    );


  const purposeOptions =
    useMemo(
      () => {
        const values = [];

        if (
          includeActiveProjects
        ) {
          values.push(
            ...currentProjects.map(
              row =>
                row.purpose
            )
          );
        }

        if (
          includeBids
        ) {
          values.push(
            ...selectedBidSourceRows.map(
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
        includeActiveProjects,
        includeBids,
        currentProjects,
        selectedBidSourceRows,
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
          selectedBidSourceRows.map(
            row =>
              row.status
          )
        ),
      [selectedBidSourceRows],
    );


  const probabilityStateOptions =
    useMemo(
      () =>
        sortedUnique(
          selectedBidSourceRows.map(
            row =>
              row.probabilityState
          )
        ),
      [selectedBidSourceRows],
    );


  const stateOptions =
    useMemo(
      () =>
        sortedUnique(
          selectedBidSourceRows.map(
            row =>
              row.state
          )
        ),
      [selectedBidSourceRows],
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
          !includeActiveProjects
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
                selectedMarginCollected:
                  monthly.marginCollected,
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
        includeActiveProjects,
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
          !includeBids
          || !rangeValid
        ) {
          return [];
        }

        return selectedBidSourceRows
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
        includeBids,
        rangeValid,
        selectedBidSourceRows,
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
            let currentMarginCollected = 0;
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

                currentMarginCollected +=
                  toNumber(
                    monthly.marginCollected
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

            const combinedProjected =
              currentProjected
              + weightedBids;


            return {
              month,
              currentProjected,
              currentActual,
              currentMarginCollected,
              weightedBids,

              combinedExpected:
                combinedProjected,

              variance:
                currentActual
                - combinedProjected,
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


  const monthlyComparisonTotals =
    useMemo(
      () =>
        monthlyComparison.reduce(
          (
            totals,
            row,
          ) => ({
            currentProjected:
              totals.currentProjected
              + row.currentProjected,

            weightedBids:
              totals.weightedBids
              + row.weightedBids,

            combinedExpected:
              totals.combinedExpected
              + row.combinedExpected,

            currentActual:
              totals.currentActual
              + row.currentActual,

            currentMarginCollected:
              totals.currentMarginCollected
              + row.currentMarginCollected,

            variance:
              totals.variance
              + row.variance,
          }),
          {
            currentProjected: 0,
            weightedBids: 0,
            combinedExpected: 0,
            currentActual: 0,
            currentMarginCollected: 0,
            variance: 0,
          },
        ),
      [monthlyComparison],
    );


  const selectedMonthDetailRows =
    useMemo(
      () => {
        if (!selectedComparisonMonth) {
          return [];
        }

        const rows = [];

        for (
          const project
          of currentDetails
        ) {
          const monthlyRows =
            currentMonthly.get(
              project.jobListId
            )
            || [];

          const monthly =
            monthlyRows.find(
              item =>
                monthKey(
                  item.monthStart
                )
                === selectedComparisonMonth
            );

          if (!monthly) {
            continue;
          }

          const projected =
            toNumber(
              monthly.projectedAmount
            );

          const actual =
            monthly.actualAmount
              === null
              || monthly.actualAmount
                === undefined
              ? null
              : toNumber(
                  monthly.actualAmount
                );

          const marginCollected =
            monthly.marginCollected
              === null
              || monthly.marginCollected
                === undefined
              ? null
              : toNumber(
                  monthly.marginCollected
                );

          rows.push({
            key:
              `month-current-${project.jobListId}`,
            source:
              'Current Project',
            nativeId:
              project.jobListId,
            number:
              project.jobNumber,
            name:
              project.jobName,
            pm:
              displayValue(
                project.pm,
                'No PM Assigned',
              ),

            pmInitials:
              project.pmInitials,

            pmHexColor:
              project.pmHexColor,

            location:
              [
                project.streetAddress,
                project.cityStateZip,
              ]
                .filter(Boolean)
                .join(' · '),

            dueDate:
              null,
            probability:
              null,
            expected:
              projected,
            actual,
            marginCollected,
            variance:
              actual === null
                ? null
                : actual - projected,
            raw:
              project,
          });
        }

        for (
          const bid
          of bidDetails
        ) {
          const monthlyRows =
            bidMonthly.get(
              bid.sharePointItemId
            )
            || [];

          const monthly =
            monthlyRows.find(
              item =>
                monthKey(
                  item.monthStart
                )
                === selectedComparisonMonth
            );

          if (!monthly) {
            continue;
          }

          rows.push({
            key:
              `month-bid-${bid.sharePointItemId}`,
            source:
              'Active Bid',
            nativeId:
              bid.sharePointItemId,
            number:
              null,
            name:
              bid.bidName,
            pm:
              displayValue(
                bid.pm,
                'No PM Assigned',
              ),

            pmInitials:
              bid.pmInitials,

            pmHexColor:
              bid.pmHexColor,

            location:
              [
                bid.streetAddress,

                [
                  bid.city,
                  bid.state,
                ]
                  .filter(Boolean)
                  .join(', '),
              ]
                .filter(Boolean)
                .join(' · '),

            dueDate:
              bid.dueDate || null,
            probability:
              bid.probability,
            expected:
              toNumber(
                monthly.weightedMonthlyForecastAmount
              ),
            actual:
              null,
            marginCollected:
              null,
            variance:
              null,
            raw:
              bid,
          });
        }

        return rows.sort(
          (a, b) => {
            if (
              a.source !== b.source
            ) {
              return (
                a.source
                  === 'Current Project'
                  ? -1
                  : 1
              );
            }

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
        selectedComparisonMonth,
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
            row => {
              const monthPosition =
                projectMonthDisplay(
                  row.effectiveStartDate,
                  row.estimatedDurationMonths,
                );


              return {
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

                pmInitials:
                  row.pmInitials,

                pmHexColor:
                  row.pmHexColor,

                projectValue:
                  row.effectiveAmount,

                projectMonth:
                  monthPosition.label,

                projectMonthSort:
                  monthPosition.sortValue,

                expected:
                  row.selectedProjected,

                actual:
                  row.selectedActual,

                variance:
                  row.selectedVariance,

                probability:
                  null,

                location:
                  [
                    row.streetAddress,
                    row.cityStateZip,
                  ]
                    .filter(Boolean)
                    .join(' · '),

                raw:
                  row,
              };
            }
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

              pmInitials:
                row.pmInitials,

              pmHexColor:
                row.pmHexColor,

              projectValue:
                row.effectiveAmount
                ?? row.estimatedPrice,

              projectMonth:
                '—',

              projectMonthSort:
                null,

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
                  row.streetAddress,

                  [
                    row.city,
                    row.state,
                  ]
                    .filter(Boolean)
                    .join(', '),
                ]
                  .filter(Boolean)
                  .join(' · '),

              raw:
                row,
            })
          );


        const rows = [
          ...currentRows,
          ...bidRows,
        ];


        const direction =
          detailSort.endsWith(
            '-asc'
          )
            ? 1
            : -1;


        const sortKey =
          detailSort.replace(
            /-(asc|desc)$/,
            '',
          );


        const sourceName =
          row =>
            row.source
            === 'Current Project'
              ? 'Active'
              : 'Bid';


        const compareText =
          (a, b) =>
            String(
              a || ''
            ).localeCompare(
              String(
                b || ''
              )
            ) * direction;


        const compareNumber =
          (a, b) => {
            const aNumber =
              Number(a);

            const bNumber =
              Number(b);


            const aMissing =
              a === null
              || a === undefined
              || !Number.isFinite(
                aNumber
              );


            const bMissing =
              b === null
              || b === undefined
              || !Number.isFinite(
                bNumber
              );


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


            return (
              aNumber
              - bNumber
            ) * direction;
          };


        return rows.sort(
          (a, b) => {
            let result = 0;


            if (
              sortKey === 'source'
            ) {
              result =
                compareText(
                  sourceName(a),
                  sourceName(b),
                );

            } else if (
              sortKey === 'job'
            ) {
              result =
                compareNumber(
                  a.number,
                  b.number,
                );

            } else if (
              sortKey === 'project'
            ) {
              result =
                compareText(
                  a.name,
                  b.name,
                );

            } else if (
              sortKey === 'pm'
            ) {
              result =
                compareText(
                  a.pmInitials,
                  b.pmInitials,
                );

            } else if (
              sortKey === 'value'
            ) {
              result =
                compareNumber(
                  a.projectValue,
                  b.projectValue,
                );

            } else if (
              sortKey === 'month'
            ) {
              result =
                compareNumber(
                  a.projectMonthSort,
                  b.projectMonthSort,
                );

            } else if (
              sortKey === 'projected'
            ) {
              result =
                compareNumber(
                  a.expected,
                  b.expected,
                );

            } else if (
              sortKey === 'actual'
            ) {
              result =
                compareNumber(
                  a.actual,
                  b.actual,
                );

            } else if (
              sortKey === 'variance'
            ) {
              result =
                compareNumber(
                  a.variance,
                  b.variance,
                );
            }


            if (result !== 0) {
              return result;
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
        detailSort,
      ],
    );



  function exportCurrentView() {
    const headers = [
      'Source',
      'Job Number',
      'Job List ID',
      'Bid ID',
      'Project / Bid',
      'PM',
      'Project Type',
      'Purpose',
      'General Contractor',
      'Location',
      'Due Date',
      'Projection State',
      'Probability',
      'Projected From',
      'Projected Through',
      'Projected Billings In Range',
      'Actual In Range',
      'Variance In Range',
      'Unweighted Bid Projected Billings In Range',
      'Project Value',
      'Effective Start',
      'Estimated Duration Months',
      'Est. Complete Date',
      'Foundation Billing History',
    ];

    const rows =
      detailRows.map(
        row => {
          const raw =
            row.raw || {};

          const isBid =
            row.source
            === 'Active Bid';

          const hasFoundationHistory =
            typeof raw.hasFoundationBillingHistory
              === 'boolean'
              ? (
                  raw.hasFoundationBillingHistory
                    ? 'Yes'
                    : 'No'
                )
              : '';

          const probabilityValue =
            isBid
            && raw.probability !== null
            && raw.probability !== undefined
              ? percent(
                  raw.probability
                )
              : '';

          return {
            'Source':
              row.source,

            'Job Number':
              isBid
                ? ''
                : row.number,

            'Job List ID':
              isBid
                ? ''
                : row.nativeId,

            'Bid ID':
              isBid
                ? row.nativeId
                : '',

            'Project / Bid':
              row.name,

            'PM':
              row.pm,

            'Project Type':
              row.projectType,

            'Purpose':
              row.purpose,

            'General Contractor':
              row.gc,

            'Location':
              row.location,

            'Due Date':
              isBid
                ? (
                    raw.dueDate
                    || row.dueDate
                    || ''
                  )
                : '',

            'Projection State':
              row.state,

            'Probability':
              probabilityValue,

            'Projected From':
              fromMonth,

            'Projected Through':
              throughMonth,

            'Projected Billings In Range':
              row.expected,

            'Actual In Range':
              row.actual === null
                || row.actual === undefined
                ? ''
                : row.actual,

            'Variance In Range':
              row.variance === null
                || row.variance === undefined
                ? ''
                : row.variance,

            'Unweighted Bid Projected Billings In Range':
              isBid
                ? (
                    raw.selectedBidForecast
                    ?? ''
                  )
                : '',

            'Project Value':
              raw.effectiveAmount
              ?? '',

            'Effective Start':
              raw.effectiveStartDate
              ?? '',

            'Estimated Duration Months':
              raw.estimatedDurationMonths
              ?? '',

            'Est. Complete Date':
              raw.projectedCompletionDate
              ?? raw.effectiveEndDate
              ?? '',

            'Foundation Billing History':
              isBid
                ? ''
                : hasFoundationHistory,
          };
        }
      );

    downloadCsv(
      (
        'riggs-projected-billings-'
        + `${sourceSelectionKey}-`
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
      <div className="loading-screen auth-loading-screen">
        <div className="auth-loading-brand">
          <div className="auth-riggs-mark">
            R
          </div>

          <div>
            <strong>RIGGS COMPANIES</strong>
            <span>Checking your Bid Log session…</span>
          </div>
        </div>
      </div>
    );
  }


  if (!user) {
    return (
      <SignInView
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
              Completed Projects
            </button>
          </nav>
        </div>

        <div className="topbar-actions">
          <div className="current-user">
            <strong>
              {user.displayName}
            </strong>

            <span>
              Riggs Companies
            </span>
          </div>

          <ThemeControl
            theme={theme}
            onChange={setTheme}
          />

          <button
            type="button"
            className="signout-button"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      </header>


      {activePage === 'projected' ? (
      <main className="page-shell">
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              PROJECTED BILLINGS
            </div>

            <h1>
              Projected Billings
            </h1>

            <p>
              Review active projects and high-probability potential projects.
              Projected billings update to the selected sources and month range,
              while Foundation actual billings remain separate.
            </p>
          </div>

          <div className="heading-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={exportCurrentView}
              disabled={
                dataLoading
                || !rangeValid
                || !detailRows.length
              }
            >
              {`Export CSV (${detailRows.length})`}
            </button>
          </div>
        </div>


        <section className="source-selector" aria-label="Projected billing sources">
          <div className="source-selector-copy">
            <span>SHOW IN PROJECTED BILLINGS</span>
            <small>
              Show active projects, potential projects, or both.
            </small>
          </div>

          <div className="source-toggles">
            <button
              type="button"
              aria-pressed={bidScope === 'potential'}
              className={
                bidScope === 'potential'
                  ? 'active'
                  : ''
              }
              onClick={() => toggleBidScope('potential')}
            >
              <span className="toggle-label">
                <strong>Potential Projects</strong>
                <small>Probability 85% or higher · {potentialBidCount}</small>
              </span>
            </button>

            <button
              type="button"
              aria-pressed={includeActiveProjects}
              className={
                includeActiveProjects
                  ? 'active'
                  : ''
              }
              onClick={toggleActiveProjects}
            >
              <span className="toggle-label">
                <strong>Active Projects</strong>
                <small>{currentProjects.length} projects</small>
              </span>
            </button>
          </div>
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
                  label="Projection State"
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


              {includeActiveProjects && (
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
                        Actual Over Projection
                      </option>

                      <option value="under">
                        Actual Under Projection
                      </option>

                      <option value="even">
                        Even
                      </option>
                    </SelectField>
                  </div>
                </div>
              )}


              {includeBids && (
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
              Invalid projection range.
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
                Loading billing data
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
              Preparing projects and projection data.
            </small>
          </section>
        )}


        <section className="stats-grid">
          <StatCard
            label="Projected Billings · Active Projects"
            value={
              dataLoading
                ? 'Loading…'
                : currency(
                    currentProjectedTotal
                  )
            }
            detail={
              includeActiveProjects
                ? `${currentDetails.length} selected projects`
                : 'Active Projects not selected'
            }
          />

          <StatCard
            label="Projected Billings · Potential Projects"
            value={
              dataLoading
                ? 'Loading…'
                : currency(
                    weightedBidTotal
                  )
            }
            detail={
              includeBids
                ? `${bidDetails.length} potential projects · ${currency(rawBidTotal)} project value`
                : 'Potential Projects not selected'
            }
          />

          <StatCard
            label="Total Projected Billings"
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
                : 'Select a valid projected billing month range'
            }
            emphasis
          />

          <StatCard
            label="Actual Billings"
            value={
              dataLoading
                ? 'Loading…'
                : currency(
                    currentActualTotal
                  )
            }
            detail={includeActiveProjects ? "Foundation actual billings" : "Active Projects not selected"}
          />
        </section>


        <section
          className={
            monthlyComparisonOpen
              ? 'content-card'
              : 'content-card monthly-comparison-collapsed'
          }
        >
          <div className="section-heading">
            <div>
              <span className="section-kicker">
                MONTHLY BILLINGS
              </span>

              <h2>
                Projected vs Actual Billings
              </h2>
            </div>

            <div className="monthly-heading-actions">
              <div
                className="comparison-view-toggle"
                role="group"
                aria-label="Projected versus actual billing view"
              >
                <button
                  type="button"
                  className={
                    monthlyComparisonView === 'month'
                      ? 'active'
                      : undefined
                  }
                  aria-pressed={
                    monthlyComparisonView === 'month'
                  }
                  onClick={
                    () =>
                      setMonthlyComparisonView(
                        'month'
                      )
                  }
                >
                  By Month
                </button>

                <button
                  type="button"
                  className={
                    monthlyComparisonView === 'project'
                      ? 'active'
                      : undefined
                  }
                  aria-pressed={
                    monthlyComparisonView === 'project'
                  }
                  onClick={
                    () => {
                      setSelectedComparisonMonth(
                        null
                      );

                      setMonthlyComparisonView(
                        'project'
                      );
                    }
                  }
                >
                  By Project
                </button>
              </div>

              <span className="section-note">
                Potential Projects are probability weighted
              </span>

              <button
                type="button"
                className="section-collapse-button"
                aria-expanded={monthlyComparisonOpen}
                onClick={
                  () =>
                    setMonthlyComparisonOpen(
                      current => !current
                    )
                }
              >
                {monthlyComparisonOpen
                  ? 'Collapse'
                  : 'Expand'}
              </button>
            </div>
          </div>


          {monthlyComparisonView === 'project'
            ? (
              <ProjectBillingPivot
                months={monthRange}
                currentProjects={currentDetails}
                bidProjects={bidDetails}
                currentMonthly={currentMonthly}
                bidMonthly={bidMonthly}
                currency={currency}
                monthLabel={monthLabel}
                onSelectCurrentProject={
                  setSelectedCurrentProject
                }
              />
            )
            : (
          <div
            className="monthly-table-wrap monthly-summary-wrap"
            ref={monthlySummaryTableRef}
          >
            <table className="monthly-table projected-monthly-table">
              <thead>
                <tr>
                  <th>Month</th>

                  <th className="numeric">
                    Active Project
                  </th>

                  <th className="numeric">
                    Potential Projects
                  </th>

                  <th className="numeric">
                    Total Projected Billing
                  </th>

                  <th className="numeric">
                    Actual Billings
                  </th>

                  <th className="numeric">
                    Margin Collected
                  </th>

                  <th className="numeric">
                    Variance
                  </th>
                </tr>
              </thead>


              <tbody>
                {monthlyComparison.map(
                  row => (
                    <>
                      <tr
                        key={row.month}
                        className={
                          selectedComparisonMonth
                            === row.month
                            ? 'monthly-comparison-row selected'
                            : 'monthly-comparison-row'
                        }
                        onClick={
                          () =>
                            setSelectedComparisonMonth(
                              current =>
                                current === row.month
                                  ? null
                                  : row.month
                            )
                        }
                      >
                        <td className="month-cell">
                          {monthLabel(
                            row.month
                          )}
                        </td>

                        <td className="numeric">
                          {currency(
                            row.currentProjected
                          )}
                        </td>

                        <td className="numeric">
                          {currency(
                            row.weightedBids
                          )}
                        </td>

                        <td className="numeric strong-cell">
                          {currency(
                            row.combinedExpected
                          )}
                        </td>

                        <td className="numeric">
                          {currency(
                            row.currentActual
                          )}
                        </td>

                        <td className="numeric">
                          {currency(
                            row.currentMarginCollected
                          )}
                        </td>

                        <td
                          className={
                            row.variance > 0
                              ? 'numeric variance-positive'
                              : (
                                  row.variance < 0
                                    ? 'numeric variance-negative'
                                    : 'numeric'
                                )
                          }
                        >
                          {currency(
                            row.variance
                          )}
                        </td>
                      </tr>


                      {selectedComparisonMonth
                        === row.month
                        && (
                          <tr
                            key={
                              `${row.month}-detail`
                            }
                            className="monthly-project-detail-row"
                          >
                            <td colSpan="7">
                              <div className="monthly-project-detail">
                                <div className="monthly-project-detail-heading">
                                  <div>
                                    <span className="section-kicker">
                                      MONTH DETAIL
                                    </span>

                                    <strong>
                                      {monthLabel(
                                        row.month
                                      )}
                                    </strong>
                                  </div>

                                  <span>
                                    {
                                      selectedMonthDetailRows.length
                                    } projected records
                                  </span>
                                </div>


                                <div className="monthly-project-table-wrap">
                                  <table className="monthly-project-table">
                                    <thead>
                                      <tr>
                                        <th>
                                          Source
                                        </th>

                                        <th>
                                          Job #
                                        </th>

                                        <th>
                                          Project / Bid
                                        </th>

                                        <th>
                                          PM
                                        </th>

                                        <th className="numeric">
                                          Projected
                                        </th>

                                        <th className="numeric">
                                          Actual Billings
                                        </th>

                                        <th className="numeric">
                                          Margin Collected
                                        </th>

                                        <th className="numeric">
                                          Variance
                                        </th>
                                      </tr>
                                    </thead>


                                    <tbody>
                                      {
                                        selectedMonthDetailRows.map(
                                          detail => (
                                            <tr
                                              key={
                                                detail.key
                                              }
                                              className={
                                                detail.source
                                                  === 'Current Project'
                                                  ? 'month-current-project-row'
                                                  : undefined
                                              }
                                              onClick={
                                                detail.source
                                                  === 'Current Project'
                                                  ? event => {
                                                      event.stopPropagation();

                                                      setSelectedCurrentProject(
                                                        detail.raw
                                                      );
                                                    }
                                                  : event =>
                                                      event.stopPropagation()
                                              }
                                            >
                                              <td>
                                                <span
                                                  className={
                                                    detail.source
                                                      === 'Active Bid'
                                                      ? 'source-chip bid'
                                                      : 'source-chip current'
                                                  }
                                                >
                                                  {detail.source
                                                    === 'Current Project'
                                                    ? 'Active'
                                                    : 'Bid'}
                                                </span>
                                              </td>

                                              <td>
                                                {detail.number
                                                  || '—'}
                                              </td>

                                              <td className="project-cell">
                                                <strong>
                                                  {displayValue(
                                                    detail.name
                                                  )}
                                                </strong>

                                                <span>
                                                  {detail.location
                                                    || '—'}
                                                </span>
                                              </td>

                                              <td>
                                                <PMInitialsBadge
                                                  initials={detail.pmInitials}
                                                  hexColor={detail.pmHexColor}
                                                />
                                              </td>

                                              <td className="numeric strong-cell">
                                                {currency(
                                                  detail.expected
                                                )}
                                              </td>

                                              <td className="numeric">
                                                {detail.actual
                                                  === null
                                                  ? '—'
                                                  : currency(
                                                      detail.actual
                                                    )}
                                              </td>

                                              <td className="numeric">
                                                {detail.marginCollected
                                                  === null
                                                  ? '—'
                                                  : currency(
                                                      detail.marginCollected
                                                    )}
                                              </td>

                                              <td
                                                className={
                                                  detail.variance
                                                    === null
                                                    ? 'numeric'
                                                    : (
                                                        detail.variance > 0
                                                          ? 'numeric variance-positive'
                                                          : (
                                                              detail.variance < 0
                                                                ? 'numeric variance-negative'
                                                                : 'numeric'
                                                            )
                                                      )
                                                }
                                              >
                                                {detail.variance
                                                  === null
                                                  ? '—'
                                                  : currency(
                                                      detail.variance
                                                    )}
                                              </td>
                                            </tr>
                                          )
                                        )
                                      }
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                    </>
                  )
                )}


                {!monthlyComparison.length && (
                  <tr>
                    <td
                      colSpan="7"
                      className="empty-cell"
                    >
                      No monthly range selected.
                    </td>
                  </tr>
                )}
              </tbody>


              {monthlyComparison.length > 0 && (
                <tfoot>
                  <tr className="monthly-total-row">
                    <th>
                      Total
                    </th>

                    <td className="numeric">
                      {currency(
                        monthlyComparisonTotals.currentProjected
                      )}
                    </td>

                    <td className="numeric">
                      {currency(
                        monthlyComparisonTotals.weightedBids
                      )}
                    </td>

                    <td className="numeric strong-cell">
                      {currency(
                        monthlyComparisonTotals.combinedExpected
                      )}
                    </td>

                    <td className="numeric">
                      {currency(
                        monthlyComparisonTotals.currentActual
                      )}
                    </td>

                    <td className="numeric">
                      {currency(
                        monthlyComparisonTotals.currentMarginCollected
                      )}
                    </td>

                    <td
                      className={
                        monthlyComparisonTotals.variance > 0
                          ? 'numeric variance-positive'
                          : (
                              monthlyComparisonTotals.variance < 0
                                ? 'numeric variance-negative'
                                : 'numeric'
                            )
                      }
                    >
                      {currency(
                        monthlyComparisonTotals.variance
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
            )}
        </section>


        <section className="content-card">
          <div className="section-heading">
            <div>
              <span className="section-kicker">
                PROJECTED BILLING DETAIL
              </span>

              <h2>
                Projected Billings Breakdown
              </h2>
            </div>

            <span className="section-note">
              {detailRows.length} rows
            </span>
          </div>


          <div
            className="detail-table-wrap projected-breakdown-wrap"
            ref={billingDetailTableRef}
          >
            <table className="detail-table projected-breakdown-table">
              <thead>
                <tr>
                  <SortHeader
                    label="Source"
                    sortKey="source"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                  />

                  <SortHeader
                    label="Job #"
                    sortKey="job"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                    firstDirection="desc"
                  />

                  <SortHeader
                    label="Project / Bid"
                    sortKey="project"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                  />

                  <SortHeader
                    label="PM"
                    sortKey="pm"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                  />

                  <SortHeader
                    label="Project Value"
                    sortKey="value"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                    firstDirection="desc"
                    numeric
                  />

                  <SortHeader
                    label="Project Month"
                    sortKey="month"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                    firstDirection="desc"
                  />

                  <SortHeader
                    label="Projected Billings"
                    sortKey="projected"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                    firstDirection="desc"
                    numeric
                  />

                  <SortHeader
                    label="Actual Billings"
                    sortKey="actual"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                    firstDirection="desc"
                    numeric
                  />

                  <SortHeader
                    label="Variance"
                    sortKey="variance"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                    firstDirection="desc"
                    numeric
                  />
                </tr>
              </thead>


              <tbody>
                {detailRows.map(
                  row => (
                    <tr
                      key={row.key}
                      className={
                        row.source
                        === 'Current Project'
                          ? 'clickable-project-row'
                          : undefined
                      }
                      onClick={
                        row.source
                        === 'Current Project'
                          ? () =>
                              setSelectedCurrentProject(
                                row.raw
                              )
                          : undefined
                      }
                      onKeyDown={
                        row.source
                        === 'Current Project'
                          ? event => {
                              if (
                                event.key === 'Enter'
                                || event.key === ' '
                              ) {
                                event.preventDefault();

                                setSelectedCurrentProject(
                                  row.raw
                                );
                              }
                            }
                          : undefined
                      }
                      tabIndex={
                        row.source
                        === 'Current Project'
                          ? 0
                          : undefined
                      }
                    >
                      <td>
                        <span
                          className={
                            row.source
                            === 'Active Bid'
                              ? 'source-chip bid'
                              : 'source-chip current'
                          }
                        >
                          {row.source
                            === 'Current Project'
                            ? 'Active'
                            : 'Bid'}
                        </span>
                      </td>

                      <td className="job-number-cell">
                        {row.number || '—'}
                      </td>

                      <td className="project-cell">
                        <strong>
                          {displayValue(
                            row.name
                          )}
                        </strong>

                        <span className="project-location-line">
                          {row.location || '—'}
                        </span>
                      </td>

                      <td className="pm-badge-cell">
                        <PMInitialsBadge
                          initials={row.pmInitials}
                          hexColor={row.pmHexColor}
                        />
                      </td>

                      <td className="numeric">
                        {row.projectValue
                          === null
                          || row.projectValue
                            === undefined
                          ? '—'
                          : currency(
                              row.projectValue
                            )}
                      </td>

                      <td className="project-month-cell">
                        {row.projectMonth}
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
                      colSpan="9"
                      className="empty-cell"
                    >
                      {dataLoading
                        ? 'Loading projected billing detail…'
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

      <CurrentProjectBillingDrawer
        project={selectedCurrentProject}
        user={user}
        monthlyRows={
          selectedCurrentProject
            ? (
                currentMonthly.get(
                  selectedCurrentProject.jobListId
                )
                || []
              )
            : []
        }
        onClose={
          () => setSelectedCurrentProject(null)
        }
      />
    </div>
  );
}
