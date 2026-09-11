import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import ProjectAccountability, {
  prefetchCompletedBillings,
} from './ProjectAccountability.jsx';
import BidLogWorkspace, {
  invalidateBidLogWorkspaceCache,
  prefetchBidLogWorkspace,
} from './BidLogWorkspace.jsx';
import ActiveProjectsWorkspace, {
  invalidateProjectsWorkspaceCache,
  prefetchProjectsWorkspace,
} from './ActiveProjectsWorkspace.jsx';
import BidLogEditDrawer from './BidLogEditDrawer.jsx';
import ActiveProjectEditDrawer from './ActiveProjectEditDrawer.jsx';
import CurrentProjectBillingDrawer from './CurrentProjectBillingDrawer.jsx';
import ActiveBidBillingDrawer from './ActiveBidBillingDrawer.jsx';
import ProjectBillingPivot from './ProjectBillingPivot.jsx';
import useStickyTableHeader from './useStickyTableHeader.js';
import {
  ProjectTeamCell,
  retentionLabel,
} from './BillingDisplay.jsx';
import {
  GeneralContractorDisplay,
  MULTIPLE_GCS,
  generalContractorDisplayText,
  generalContractorFilterMatch,
  generalContractorNames,
} from './GeneralContractors.jsx';


const ALL = '__ALL__';
const UNASSIGNED = '__UNASSIGNED__';
const DEFAULT_POTENTIAL_PROBABILITY_PERCENT = 85;

const USAGE_SESSION_STORAGE_KEY =
  'riggs-bid-log-usage-session-id';

const INACTIVITY_TIMEOUT_MS =
  20 * 60 * 1000;

const USAGE_HEARTBEAT_INTERVAL_MS =
  60 * 1000;

const INACTIVITY_CHECK_INTERVAL_MS =
  15 * 1000;


function createUsageSessionId() {
  try {
    if (
      window.crypto
      && typeof window.crypto.randomUUID
        === 'function'
    ) {
      return window.crypto.randomUUID();
    }
  } catch {
    // Fall through to local UUID generation.
  }


  const bytes =
    new Uint8Array(16);


  try {
    if (
      window.crypto
      && typeof window.crypto.getRandomValues
        === 'function'
    ) {
      window.crypto.getRandomValues(
        bytes,
      );

    } else {
      for (
        let index = 0;
        index < bytes.length;
        index += 1
      ) {
        bytes[index] =
          Math.floor(
            Math.random() * 256
          );
      }
    }

  } catch {
    for (
      let index = 0;
      index < bytes.length;
      index += 1
    ) {
      bytes[index] =
        Math.floor(
          Math.random() * 256
        );
    }
  }


  bytes[6] =
    (bytes[6] & 0x0f) | 0x40;

  bytes[8] =
    (bytes[8] & 0x3f) | 0x80;


  const hex =
    Array.from(
      bytes,
      value =>
        value
          .toString(16)
          .padStart(2, '0'),
    );


  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}


function getUsageSessionId() {
  try {
    const existing =
      window.sessionStorage.getItem(
        USAGE_SESSION_STORAGE_KEY,
      );

    if (existing) {
      return existing;
    }
  } catch {
    // Tracking stays fail-open.
  }


  const created =
    createUsageSessionId();


  try {
    window.sessionStorage.setItem(
      USAGE_SESSION_STORAGE_KEY,
      created,
    );
  } catch {
    // The in-memory ref is still enough
    // for this page lifecycle.
  }


  return created;
}


function clearUsageSessionId() {
  try {
    window.sessionStorage.removeItem(
      USAGE_SESSION_STORAGE_KEY,
    );
  } catch {
    // Never let tracking break auth/UI.
  }
}


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
      'Your session ended after 20 minutes of inactivity. Sign in again to continue.',

    invalid_session:
      'Your previous Bid Log session is no longer valid. Sign in again to continue.',

    application_updated:
      'Bid Log was updated since you signed in. Sign in again to start a fresh session on the current version.',

    microsoft_sign_in_failed:
      'Microsoft sign-in could not be completed. Try again, or contact Riggs IT if the problem continues.',

    microsoft_identity_missing:
      'Microsoft did not return the identity information Bid Log needs. Try signing in again.',

    microsoft_data_api_token_missing:
      'Microsoft sign-in completed, but Bid Log could not establish delegated access. Sign out and try again.',

    delegated_identity_rejected:
      'Microsoft delegated access could not be verified. Sign out and try again, or contact Riggs IT if the problem continues.',

    bid_log_delegated_identity_mismatch:
      'Your Microsoft account did not match the Riggs employee identity for this Bid Log session. Contact Riggs IT.',

    delegated_auth_unavailable:
      'Microsoft delegated access is temporarily unavailable. Try signing in again in a moment.',

    delegated_auth_configuration_unavailable:
      'Microsoft delegated access is temporarily unavailable for Bid Log. Contact Riggs IT if the problem continues.',

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
  let missingMarginRows = 0;
  let marginDataComplete = true;

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

    const rowMissingMarginRows =
      toNumber(
        row.missingMarginRows
      );

    missingMarginRows +=
      rowMissingMarginRows;

    if (
      row.marginDataComplete === false
      || rowMissingMarginRows > 0
    ) {
      marginDataComplete = false;
      continue;
    }

    marginCollected +=
      toNumber(
        row.marginCollected
      );
  }

  return {
    projected,
    actual,
    marginCollected:
      marginDataComplete
        ? marginCollected
        : null,
    weightedHistoricalMarginPercent:
      marginDataComplete
      && Math.abs(actual) > 0.000001
        ? (
            marginCollected
            / actual
          ) * 100
        : null,
    missingMarginRows,
    marginDataComplete,
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


function ProbabilityInput({
  value,
  onChange,
  onBlur,
  compact = false,
}) {
  return (
    <label
      className={
        compact
          ? 'probability-input compact'
          : 'probability-input'
      }
    >
      <span>Potential Threshold</span>

      <div className="probability-input-control">
        <input
          type="number"
          min="0"
          max="100"
          step="1"
          inputMode="numeric"
          value={value}
          onChange={
            event =>
              onChange(
                event.target.value
              )
          }
          onBlur={onBlur}
          aria-label="Minimum potential project probability"
        />

        <span aria-hidden="true">%</span>
      </div>
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

  const isApplicationUpdated =
    authError === 'application_updated';

  const hasError =
    Boolean(authError)
    && !isTimeout
    && !isApplicationUpdated;

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
  } else if (isApplicationUpdated) {
    statusLabel = 'APP UPDATED';
    heading = 'Bid Log was updated';
    message =
      friendlyError(
        'application_updated'
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

  const usageSessionIdRef =
    useRef(null);

  const activePageRef =
    useRef(activePage);

  const backgroundPrefetchStartedRef =
    useRef(false);

  const lastHumanActivityAtRef =
    useRef(Date.now());

  const logoutInProgressRef =
    useRef(false);

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
    projectedInitialLoadComplete,
    setProjectedInitialLoadComplete,
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
    selectedActiveBid,
    setSelectedActiveBid,
  ] = useState(null);

  const [
    editProjectedProjectId,
    setEditProjectedProjectId,
  ] = useState(null);

  const [
    editProjectedBidId,
    setEditProjectedBidId,
  ] = useState(null);

  const [
    forecastAttention,
    setForecastAttention,
  ] = useState([]);

  const [
    attentionOpen,
    setAttentionOpen,
  ] = useState(false);

  const [
    attentionLoading,
    setAttentionLoading,
  ] = useState(false);

  const [
    attentionError,
    setAttentionError,
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
    potentialProbabilityInput,
    setPotentialProbabilityInput,
  ] = useState(
    String(
      DEFAULT_POTENTIAL_PROBABILITY_PERCENT
    )
  );

  const [
    detailSort,
    setDetailSort,
  ] = useState(
    'job-desc'
  );

  const [
    monthlySort,
    setMonthlySort,
  ] = useState(
    'month-asc'
  );

  const [
    monthDetailSort,
    setMonthDetailSort,
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
  ] = useState(ALL);

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
    filterDrawerOpen,
    setFilterDrawerOpen,
  ] = useState(false);

  const [
    mainFiltersVisible,
    setMainFiltersVisible,
  ] = useState(true);

  const mainFiltersRef =
    useRef(null);

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


  useEffect(
    () => {
      if (
        activePage !== 'projected'
        || !user
      ) {
        setMainFiltersVisible(true);
        return undefined;
      }

      const element =
        mainFiltersRef.current;

      if (!element) {
        return undefined;
      }

      if (
        typeof IntersectionObserver
        === 'undefined'
      ) {
        setMainFiltersVisible(true);
        return undefined;
      }

      const observer =
        new IntersectionObserver(
          entries => {
            const entry =
              entries[0];

            setMainFiltersVisible(
              Boolean(
                entry?.isIntersecting
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
    [
      activePage,
      user,
    ],
  );


  useEffect(
    () => {
      if (!filterDrawerOpen) {
        return undefined;
      }

      const onKeyDown =
        event => {
          if (
            event.key === 'Escape'
          ) {
            setFilterDrawerOpen(false);
          }
        };

      window.addEventListener(
        'keydown',
        onKeyDown,
      );

      return () => {
        window.removeEventListener(
          'keydown',
          onKeyDown,
        );
      };
    },
    [filterDrawerOpen],
  );


  useEffect(() => {
    document.documentElement.dataset.theme =
      theme;

    window.localStorage.setItem(
      'riggs-theme',
      theme,
    );
  }, [theme]);


  useEffect(() => {
    activePageRef.current =
      activePage;
  }, [activePage]);


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

        if (
          response.status === 401
        ) {
          clearUsageSessionId();
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


  async function loadForecastAttention() {
    if (!user) {
      setForecastAttention([]);
      return [];
    }

    setAttentionLoading(true);
    setAttentionError(null);

    try {
      const response =
        await window.fetch(
          '/api/pm-forecast/attention',
          {
            credentials:
              'same-origin',
          },
        );

      let payload = null;

      try {
        payload =
          await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(
          friendlyError(
            payload?.detail
          )
        );
      }

      const rows =
        Array.isArray(payload)
          ? payload
          : [];

      setForecastAttention(
        rows
      );

      return rows;

    } catch (err) {
      setAttentionError(
        err.message
        || 'Unable to load notifications.'
      );

      return [];

    } finally {
      setAttentionLoading(false);
    }
  }


  useEffect(() => {
    if (!user) {
      setForecastAttention([]);
      setAttentionOpen(false);
      return undefined;
    }

    loadForecastAttention();

    const intervalId =
      window.setInterval(
        () => {
          loadForecastAttention();
        },
        60 * 1000,
      );

    const handleFocus = () => {
      loadForecastAttention();
    };

    window.addEventListener(
      'focus',
      handleFocus,
    );

    return () => {
      window.clearInterval(
        intervalId
      );

      window.removeEventListener(
        'focus',
        handleFocus,
      );
    };

  }, [
    user?.eid,
  ]);


  function openCurrentProjectDrawer(
    project,
  ) {
    setSelectedActiveBid(null);
    setSelectedCurrentProject(project);
  }


  function openActiveBidDrawer(
    bid,
  ) {
    setSelectedCurrentProject(null);
    setSelectedActiveBid(bid);
  }


  function handleActiveBidUpdated(
    project,
    monthlyRows,
  ) {
    if (!project?.sharePointItemId) {
      return;
    }

    setActiveBids(
      current =>
        current.map(
          item =>
            Number(item.sharePointItemId)
            === Number(project.sharePointItemId)
              ? project
              : item
        )
    );

    setBidMonthly(
      current => {
        const next =
          new Map(current);

        next.set(
          project.sharePointItemId,
          monthlyRows || [],
        );

        return next;
      }
    );

    setSelectedActiveBid(project);
  }


  async function refreshProjectedCurrentProjectData() {
    try {
      const [
        currentPayload,
        currentMonthlyPayload,
      ] = await Promise.all([
        fetchJson('/api/projected-billings/current-projects'),
        fetchJson('/api/projected-billings/current-projects/monthly'),
      ]);

      setCurrentProjects(currentPayload);
      setCurrentMonthly(
        new Map(
          (currentMonthlyPayload?.items || []).map(
            row => [row.jobListId, row.items || []],
          ),
        ),
      );
      invalidateProjectsWorkspaceCache();
    } catch (error) {
      setDataError(
        error?.message
        || 'Unable to refresh projected projects after the edit.',
      );
    }
  }


  async function refreshProjectedBidData() {
    try {
      const dashboard = await fetchJson(
        '/api/projected-billings/active-bids/dashboard',
      );
      const projectPayload = dashboard?.projects || {};

      setActiveBids(
        Array.isArray(projectPayload?.items)
          ? projectPayload.items
          : [],
      );
      setBidMonthly(
        new Map(
          (dashboard?.monthly || []).map(
            row => [row.sharePointItemId, row.items || []],
          ),
        ),
      );
      invalidateBidLogWorkspaceCache();
    } catch (error) {
      setDataError(
        error?.message
        || 'Unable to refresh projected bids after the edit.',
      );
    }
  }


  function openAttentionProject(
    attention,
  ) {
    const target =
      currentProjects.find(
        project =>
          Number(
            project.jobListId
          )
          ===
          Number(
            attention.jobListId
          )
      );

    if (!target) {
      setAttentionError(
        'This project is no longer available in the active project list.'
      );
      return;
    }

    setActivePage(
      'projected'
    );

    openCurrentProjectDrawer(
      target
    );

    setAttentionOpen(
      false
    );
  }


  useEffect(() => {
    if (!user) {
      usageSessionIdRef.current =
        null;

      return undefined;
    }


    let stopped = false;


    let usageSessionId = null;


    try {
      usageSessionId =
        getUsageSessionId();

    } catch {
      /*
        Usage tracking is additive.
        If initialization ever fails,
        leave the Bid Log functioning.
      */
      return undefined;
    }


    if (!usageSessionId) {
      return undefined;
    }


    usageSessionIdRef.current =
      usageSessionId;

    lastHumanActivityAtRef.current =
      Date.now();

    logoutInProgressRef.current =
      false;


    function currentPageLabel() {
      if (
        activePageRef.current
        === 'accountability'
      ) {
        return 'Completed Billings';
      }

      if (
        activePageRef.current
        === 'bid-log'
      ) {
        return 'Bid Log';
      }

      if (
        activePageRef.current
        === 'active-projects'
      ) {
        return 'Projects';
      }

      return 'Projected Billings';
    }


    function markHumanActivity() {
      if (stopped) {
        return;
      }

      lastHumanActivityAtRef.current =
        Date.now();
    }


    async function endUsage(
      reason,
    ) {
      const currentUsageSessionId =
        usageSessionIdRef.current;

      if (!currentUsageSessionId) {
        return;
      }

      try {
        await window.fetch(
          '/api/usage/end',
          {
            method: 'POST',

            credentials:
              'same-origin',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                usageSessionId:
                  currentUsageSessionId,

                endReason:
                  reason,
              }),
          },
        );

      } catch {
        // Usage tracking must never
        // block sign-out.
      }
    }


    async function finishTimeout() {
      if (
        logoutInProgressRef.current
      ) {
        return;
      }

      logoutInProgressRef.current =
        true;

      stopped = true;


      await endUsage(
        'inactivity_timeout',
      );


      try {
        await window.fetch(
          '/api/auth/logout',
          {
            method: 'POST',

            credentials:
              'same-origin',
          },
        );

      } catch {
        // Redirect regardless. The
        // server-side idle timeout is
        // still a fallback.
      }


      clearUsageSessionId();

      usageSessionIdRef.current =
        null;


      window.location.replace(
        '/?signed_out=timeout',
      );
    }


    function idleMilliseconds() {
      return (
        Date.now()
        - lastHumanActivityAtRef.current
      );
    }


    async function heartbeat() {
      if (
        stopped
        || document.visibilityState
           !== 'visible'
      ) {
        return;
      }


      if (
        idleMilliseconds()
        >= INACTIVITY_TIMEOUT_MS
      ) {
        await finishTimeout();
        return;
      }


      try {
        const response =
          await window.fetch(
            '/api/usage/heartbeat',
            {
              method: 'POST',

              credentials:
                'same-origin',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  usageSessionId:
                    usageSessionIdRef
                      .current,

                  currentPage:
                    currentPageLabel(),

                  clientActive:
                    true,
                }),
            },
          );


        if (
          response.status === 401
        ) {
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

          stopped = true;

          clearUsageSessionId();

          usageSessionIdRef.current =
            null;


          if (
            detail === 'application_updated'
          ) {
            window.location.replace(
              '/?auth_error=application_updated',
            );
          } else {
            window.location.replace(
              '/?signed_out=timeout',
            );
          }
        }

      } catch {
        /*
          Usage tracking is additive.
          A temporary tracking/API issue
          must not interrupt the Bid Log.
        */
      }
    }


    function checkInactivity() {
      if (
        idleMilliseconds()
        >= INACTIVITY_TIMEOUT_MS
      ) {
        void finishTimeout();
      }
    }


    function handleVisibilityChange() {
      if (
        document.visibilityState
        !== 'visible'
      ) {
        return;
      }


      if (
        idleMilliseconds()
        >= INACTIVITY_TIMEOUT_MS
      ) {
        void finishTimeout();
        return;
      }


      /*
        Returning to the tab before the
        timeout counts as user activity.
      */
      markHumanActivity();

      void heartbeat();
    }


    const activityEvents = [
      'pointerdown',
      'keydown',
      'scroll',
      'touchstart',
    ];


    for (
      const eventName
      of activityEvents
    ) {
      window.addEventListener(
        eventName,
        markHumanActivity,
        {
          passive: true,
        },
      );
    }


    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    );


    void heartbeat();


    const heartbeatTimer =
      window.setInterval(
        () => {
          void heartbeat();
        },
        USAGE_HEARTBEAT_INTERVAL_MS,
      );


    const inactivityTimer =
      window.setInterval(
        checkInactivity,
        INACTIVITY_CHECK_INTERVAL_MS,
      );


    return () => {
      stopped = true;

      window.clearInterval(
        heartbeatTimer,
      );

      window.clearInterval(
        inactivityTimer,
      );


      for (
        const eventName
        of activityEvents
      ) {
        window.removeEventListener(
          eventName,
          markHumanActivity,
        );
      }


      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
    };

  }, [user]);


  useEffect(() => {
    if (!user) {
      return undefined;
    }

    let cancelled = false;

    async function loadProjectedBillings() {
      backgroundPrefetchStartedRef.current = false;
      setProjectedInitialLoadComplete(false);
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

        setProjectedInitialLoadComplete(
          true
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
    if (
      logoutInProgressRef.current
    ) {
      return;
    }

    logoutInProgressRef.current =
      true;


    const usageSessionId =
      usageSessionIdRef.current;


    if (usageSessionId) {
      try {
        await window.fetch(
          '/api/usage/end',
          {
            method: 'POST',

            credentials:
              'same-origin',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                usageSessionId,

                endReason:
                  'manual_logout',
              }),
          },
        );

      } catch {
        // Usage tracking must never
        // block manual sign-out.
      }
    }


    try {
      await window.fetch(
        '/api/auth/logout',
        {
          method: 'POST',
          credentials:
            'same-origin',
        },
      );

    } finally {
      clearUsageSessionId();

      usageSessionIdRef.current =
        null;


      window.location.assign(
        '/?signed_out=1',
      );
    }
  }


  const isAdmin =
    String(
      user?.appRole
      || ''
    ).toUpperCase()
    === 'ADMIN';


  /*
    Temporary controlled rollout.

    Bid Log and Projects remain ADMIN-only while management
    validates the new master-record workflows.

    Keep this capability separate from the underlying Data API
    authorization so reopening to Operations is a small,
    deliberate application rollout change later.
  */
  const canViewManagementWorkspaces =
    isAdmin;


  // Completed Billings remains ADMIN-only for now.
  const canViewCompletedProjects =
    isAdmin;


  useEffect(
    () => {
      if (
        (
          !canViewManagementWorkspaces
          && (
            activePage === 'bid-log'
            || activePage === 'active-projects'
          )
        )
        || (
          !canViewCompletedProjects
          && activePage === 'accountability'
        )
      ) {
        setActivePage('projected');
      }
    },
    [
      activePage,
      canViewCompletedProjects,
      canViewManagementWorkspaces,
    ],
  );


  useEffect(
    () => {
      if (
        !user
        || !projectedInitialLoadComplete
        || !canViewManagementWorkspaces
        || backgroundPrefetchStartedRef.current
      ) {
        return undefined;
      }

      backgroundPrefetchStartedRef.current =
        true;

      let cancelled = false;

      const runPrefetch = async () => {
        const runStage = async task => {
          if (cancelled) {
            return;
          }

          await task();
        };


        // Highest-value workspaces first.
        await runStage(
          () =>
            prefetchBidLogWorkspace(
              ['active']
            ),
        );


        await runStage(
          () =>
            prefetchProjectsWorkspace({
              includeActive: true,
              includeCompleted: false,
            }),
        );


        // Smaller historical outcome lists next.
        await runStage(
          () =>
            prefetchBidLogWorkspace(
              [
                'awarded',
                'lost',
              ]
            ),
        );


        // Completed Billings is currently ADMIN-only.
        if (canViewCompletedProjects) {
          await runStage(
            prefetchCompletedBillings,
          );
        }


        // Warm the Projects -> Completed toggle.
        await runStage(
          () =>
            prefetchProjectsWorkspace({
              includeActive: false,
              includeCompleted: true,
            }),
        );


        // Largest lifecycle list goes last.
        await runStage(
          () =>
            prefetchBidLogWorkspace(
              ['unpursued']
            ),
        );
      };


      const startPrefetch = () => {
        void runPrefetch();
      };


      let idleId = null;
      let timeoutId = null;


      if (
        typeof window.requestIdleCallback
        === 'function'
      ) {
        idleId =
          window.requestIdleCallback(
            startPrefetch,
            {
              timeout: 1500,
            },
          );

      } else {
        timeoutId =
          window.setTimeout(
            startPrefetch,
            400,
          );
      }


      return () => {
        cancelled = true;

        if (
          idleId !== null
          && typeof window.cancelIdleCallback
            === 'function'
        ) {
          window.cancelIdleCallback(
            idleId
          );
        }

        if (timeoutId !== null) {
          window.clearTimeout(
            timeoutId
          );
        }
      };
    },
    [
      canViewCompletedProjects,
      canViewManagementWorkspaces,
      projectedInitialLoadComplete,
      user?.eid,
    ],
  );


  const potentialProbabilityPercent =
    useMemo(
      () => {
        if (
          String(
            potentialProbabilityInput
          ).trim() === ''
        ) {
          return DEFAULT_POTENTIAL_PROBABILITY_PERCENT;
        }

        const number =
          Number(
            potentialProbabilityInput
          );

        if (!Number.isFinite(number)) {
          return DEFAULT_POTENTIAL_PROBABILITY_PERCENT;
        }

        return Math.min(
          100,
          Math.max(
            0,
            number,
          ),
        );
      },
      [potentialProbabilityInput],
    );


  const potentialProbabilityThreshold =
    potentialProbabilityPercent / 100;


  function normalizePotentialProbabilityInput() {
    setPotentialProbabilityInput(
      String(
        Math.round(
          potentialProbabilityPercent
        )
      )
    );
  }


  function isPotentialBid(row) {
    if (
      row?.probability === null
      || row?.probability === undefined
      || row?.probability === ''
    ) {
      return false;
    }

    const probability =
      Number(row.probability);

    return (
      Number.isFinite(probability)
      && probability
        >= potentialProbabilityThreshold
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
            isPotentialBid
          );
        }

        return activeBids;
      },
      [
        activeBids,
        bidScope,
        includeBids,
        potentialProbabilityThreshold,
      ],
    );

  const potentialBidCount =
    useMemo(
      () =>
        activeBids.filter(
          isPotentialBid
        ).length,
      [
        activeBids,
        potentialProbabilityThreshold,
      ],
    );

  const sourceSelectionKey =
    `${bidScope}-${includeActiveProjects ? 'projects' : 'no-projects'}`;

  const showCombinedSources =
    includeActiveProjects
    && includeBids;

  const showPotentialOnly =
    includeBids
    && !includeActiveProjects;

  const showActiveOnly =
    includeActiveProjects
    && !includeBids;

  const monthlySummaryColumnCount =
    1
    + (includeActiveProjects ? 1 : 0)
    + (includeBids ? 1 : 0)
    + (showCombinedSources ? 1 : 0)
    + (includeActiveProjects ? 1 : 0)
    + (includeActiveProjects && isAdmin ? 1 : 0)
    + (includeActiveProjects ? 1 : 0);

  const monthDetailColumnCount =
    (showCombinedSources ? 1 : 0)
    + (includeActiveProjects ? 1 : 0)
    + 1
    + 1
    + 1
    + (includeActiveProjects ? 1 : 0)
    + (showPotentialOnly ? 1 : 0)
    + 1
    + (includeActiveProjects ? 1 : 0)
    + (includeActiveProjects && isAdmin ? 1 : 0)
    + (includeActiveProjects ? 1 : 0);

  const detailColumnCount =
    (showCombinedSources ? 1 : 0)
    + (includeActiveProjects ? 1 : 0)
    + 1
    + 1
    + 1
    + (includeActiveProjects ? 1 : 0)
    + 1
    + (showPotentialOnly ? 1 : 0)
    + (includeActiveProjects ? 1 : 0)
    + 1
    + (includeActiveProjects ? 1 : 0)
    + (includeActiveProjects ? 1 : 0);


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


  function toggleMonthlySort(
    key,
    firstDirection = 'asc',
  ) {
    setMonthlySort(
      current => {
        const ascending =
          `${key}-asc`;

        const descending =
          `${key}-desc`;

        if (current === ascending) {
          return descending;
        }

        if (current === descending) {
          return ascending;
        }

        return `${key}-${firstDirection}`;
      }
    );
  }


  function toggleMonthDetailSort(
    key,
    firstDirection = 'asc',
  ) {
    setMonthDetailSort(
      current => {
        const ascending =
          `${key}-asc`;

        const descending =
          `${key}-desc`;

        if (current === ascending) {
          return descending;
        }

        if (current === descending) {
          return ascending;
        }

        return `${key}-${firstDirection}`;
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


  const gcOptions =
    useMemo(
      () => {
        const values = [];

        if (includeActiveProjects) {
          values.push(
            ...currentProjects.flatMap(
              row =>
                generalContractorNames(
                  row.generalContractors
                  || row.gc
                )
            )
          );
        }

        if (includeBids) {
          values.push(
            ...selectedBidSourceRows.flatMap(
              row =>
                generalContractorNames(
                  row.generalContractors
                  || row.gc
                )
            )
          );
        }

        return sortedUnique(values);
      },
      [
        includeActiveProjects,
        includeBids,
        currentProjects,
        selectedBidSourceRows,
      ],
    );


  const normalizedSearch =
    search
      .trim()
      .toLowerCase();


  const multipleGcOptionAvailable =
    useMemo(
      () => {
        if (!includeBids) {
          return false;
        }

        return selectedBidSourceRows.some(
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
              projectTypeFilter !== ALL
              && normalizeProjectType(
                row.projectType
              ) !== projectTypeFilter
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
              forecastStateFilter !== ALL
              && row.forecastState
                !== forecastStateFilter
            ) {
              return false;
            }

            if (
              bidStatusFilter !== ALL
              && row.status
                !== bidStatusFilter
            ) {
              return false;
            }

            if (
              probabilityStateFilter !== ALL
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

            return (
              generalContractorNames(
                row.generalContractors
                || row.gc
              ).length > 1
            );
          }
        );
      },
      [
        includeBids,
        selectedBidSourceRows,
        normalizedSearch,
        pmFilter,
        projectTypeFilter,
        purposeFilter,
        forecastStateFilter,
        bidStatusFilter,
        probabilityStateFilter,
        stateFilter,
        isNewBidFilter,
        snoozedFilter,
      ],
    );


  useEffect(
    () => {
      if (
        gcFilter === MULTIPLE_GCS
        && !multipleGcOptionAvailable
      ) {
        setGcFilter(ALL);
      }
    },
    [
      gcFilter,
      multipleGcOptionAvailable,
    ],
  );


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
                gcFilter === MULTIPLE_GCS
                || !generalContractorFilterMatch(
                  row.generalContractors
                  || row.gc,
                  gcFilter,
                  ALL,
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
        gcFilter,
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
                !generalContractorFilterMatch(
                  row.generalContractors
                  || row.gc,
                  gcFilter,
                  ALL,
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
        gcFilter,
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

  const currentVarianceTotal =
    currentActualTotal
    - currentProjectedTotal;


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
            let currentMissingMarginRows = 0;
            let currentMarginDataComplete = true;
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

                const monthlyMissingMarginRows =
                  toNumber(
                    monthly.missingMarginRows
                  );

                currentMissingMarginRows +=
                  monthlyMissingMarginRows;

                if (
                  monthly.marginDataComplete === false
                  || monthlyMissingMarginRows > 0
                ) {
                  currentMarginDataComplete = false;

                } else {
                  currentMarginCollected +=
                    toNumber(
                      monthly.marginCollected
                    );
                }
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
              currentMarginCollected:
                currentMarginDataComplete
                  ? currentMarginCollected
                  : null,
              currentWeightedHistoricalMarginPercent:
                currentMarginDataComplete
                && Math.abs(currentActual) > 0.000001
                  ? (
                      currentMarginCollected
                      / currentActual
                    ) * 100
                  : null,
              currentMissingMarginRows,
              currentMarginDataComplete,
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


  const sortedMonthlyComparison =
    useMemo(
      () => {
        const [
          key,
          direction,
        ] = monthlySort.split(
          '-'
        );

        const multiplier =
          direction === 'desc'
            ? -1
            : 1;

        return [
          ...monthlyComparison
        ].sort(
          (
            a,
            b,
          ) => {
            if (key === 'month') {
              return (
                String(a.month)
                  .localeCompare(
                    String(b.month)
                  )
                * multiplier
              );
            }

            const fieldMap = {
              active:
                'currentProjected',

              potential:
                'weightedBids',

              projected:
                'combinedExpected',

              actual:
                'currentActual',

              margin:
                'currentMarginCollected',

              variance:
                'variance',
            };

            const field =
              fieldMap[key];

            const aValue =
              a[field];

            const bValue =
              b[field];

            if (
              aValue === null
              || aValue === undefined
            ) {
              return (
                bValue === null
                || bValue === undefined
                  ? 0
                  : 1
              );
            }

            if (
              bValue === null
              || bValue === undefined
            ) {
              return -1;
            }

            return (
              (
                Number(aValue)
                - Number(bValue)
              )
              * multiplier
            );
          }
        );
      },
      [
        monthlyComparison,
        monthlySort,
      ],
    );


  const monthlyComparisonTotals =
    useMemo(
      () => {
        const totals =
          monthlyComparison.reduce(
            (
              current,
              row,
            ) => ({
              currentProjected:
                current.currentProjected
                + row.currentProjected,

              weightedBids:
                current.weightedBids
                + row.weightedBids,

              combinedExpected:
                current.combinedExpected
                + row.combinedExpected,

              currentActual:
                current.currentActual
                + row.currentActual,

              currentMarginCollected:
                current.currentMarginCollected
                + toNumber(
                    row.currentMarginCollected
                  ),

              currentMissingMarginRows:
                current.currentMissingMarginRows
                + row.currentMissingMarginRows,

              currentMarginDataComplete:
                current.currentMarginDataComplete
                && row.currentMarginDataComplete,

              variance:
                current.variance
                + row.variance,
            }),
            {
              currentProjected: 0,
              weightedBids: 0,
              combinedExpected: 0,
              currentActual: 0,
              currentMarginCollected: 0,
              currentMissingMarginRows: 0,
              currentMarginDataComplete: true,
              variance: 0,
            },
          );

        return {
          ...totals,
          currentMarginCollected:
            totals.currentMarginDataComplete
              ? totals.currentMarginCollected
              : null,
          currentWeightedHistoricalMarginPercent:
            totals.currentMarginDataComplete
            && Math.abs(
              totals.currentActual
            ) > 0.000001
              ? (
                  totals.currentMarginCollected
                  / totals.currentActual
                ) * 100
              : null,
        };
      },
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


  const sortedSelectedMonthDetailRows =
    useMemo(
      () => {
        const [
          key,
          direction,
        ] = monthDetailSort.split(
          '-'
        );

        const multiplier =
          direction === 'desc'
            ? -1
            : 1;

        return [
          ...selectedMonthDetailRows
        ].sort(
          (
            a,
            b,
          ) => {
            const textCompare =
              (
                aValue,
                bValue,
              ) => (
                String(
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
                )
                * multiplier
              );

            const numberCompare =
              (
                aValue,
                bValue,
              ) => {
                if (
                  aValue === null
                  || aValue === undefined
                ) {
                  return (
                    bValue === null
                    || bValue === undefined
                      ? 0
                      : 1
                  );
                }

                if (
                  bValue === null
                  || bValue === undefined
                ) {
                  return -1;
                }

                return (
                  (
                    Number(aValue)
                    - Number(bValue)
                  )
                  * multiplier
                );
              };

            if (key === 'source') {
              return textCompare(
                a.source,
                b.source,
              );
            }

            if (key === 'job') {
              return numberCompare(
                a.number,
                b.number,
              );
            }

            if (key === 'project') {
              return textCompare(
                a.name,
                b.name,
              );
            }

            if (key === 'gc') {
              return textCompare(
                generalContractorDisplayText(
                  a.raw?.generalContractors
                  || a.raw?.gc,
                  '',
                ),
                generalContractorDisplayText(
                  b.raw?.generalContractors
                  || b.raw?.gc,
                  '',
                ),
              );
            }

            if (key === 'pm') {
              return textCompare(
                a.pm,
                b.pm,
              );
            }

            if (key === 'team') {
              const aTeam =
                a.source === 'Current Project'
                  ? [
                      a.raw?.pe,
                      a.raw?.superintendent,
                      a.raw?.apm,
                    ]
                      .filter(Boolean)
                      .join(' ')
                  : '';

              const bTeam =
                b.source === 'Current Project'
                  ? [
                      b.raw?.pe,
                      b.raw?.superintendent,
                      b.raw?.apm,
                    ]
                      .filter(Boolean)
                      .join(' ')
                  : '';

              return textCompare(
                aTeam,
                bTeam,
              );
            }

            const numericMap = {
              projected:
                'expected',

              actual:
                'actual',

              margin:
                'marginCollected',

              probability:
                'probability',

              variance:
                'variance',
            };

            return numberCompare(
              a[
                numericMap[key]
              ],
              b[
                numericMap[key]
              ],
            );
          }
        );
      },
      [
        selectedMonthDetailRows,
        monthDetailSort,
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
              sortKey === 'gc'
            ) {
              result =
                compareText(
                  generalContractorDisplayText(
                    a.raw?.generalContractors
                    || a.raw?.gc,
                    '',
                  ),
                  generalContractorDisplayText(
                    b.raw?.generalContractors
                    || b.raw?.gc,
                    '',
                  ),
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
              sortKey === 'probability'
            ) {
              result =
                compareNumber(
                  a.probability,
                  b.probability,
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
      'PE',
      'Superintendent',
      'APM',

      'Project Type',
      'Purpose',
      'General Contractor',

      'Street Address',
      'City / State',
      'Location',

      'Due Date',
      'Bid Status',
      'Probability',

      'Square Footage',
      'Number of Buildings',

      'Retention',

      'Projection State',
      'Forecast Ready',

      'Distribution Method',
      'Curve',

      'Amount Source',
      'Start Date Source',
      'End Date Source',

      'Projected From',
      'Projected Through',

      'Projected Billings In Range',
      'Unweighted Bid Projected Billings In Range',
      'Actual In Range',


      'Variance In Range',

      'Project Value',
      'Original Contract Amount',
      'Bid Estimated Price',
      'Projection Amount Override',

      'Effective Start',
      'Estimated Duration Months',
      'Est. Complete Date',

      'Foundation Billing History',
      'Foundation Billing Months',

      'Projected To Date',
      'Actual To Date',


      'Variance To Date',
      'Remaining Amount',
      'Future Projected Amount',
    ];


    if (isAdmin) {
      const afterRetention =
        headers.indexOf('Retention') + 1;

      headers.splice(
        afterRetention,
        0,
        'Estimated Margin %',
        'Bid Margin %',
      );

      const afterActualRange =
        headers.indexOf('Actual In Range') + 1;

      headers.splice(
        afterActualRange,
        0,
        'Margin Collected In Range',
        'Weighted Historical Margin % In Range',
        'Margin Data Complete In Range',
        'Missing Margin Rows In Range',
      );

      const afterActualToDate =
        headers.indexOf('Actual To Date') + 1;

      headers.splice(
        afterActualToDate,
        0,
        'Margin Collected To Date',
        'Weighted Historical Margin % To Date',
        'Margin Data Complete To Date',
        'Missing Margin Rows To Date',
      );
    }


    const rows =
      detailRows.map(
        row => {
          const raw =
            row.raw || {};


          const isBid =
            row.source
            === 'Active Bid';


          const rangeMargin =
            isBid
              ? null
              : aggregateCurrentMonthly(
                  currentMonthly.get(
                    row.nativeId
                  ),
                  fromMonth,
                  throughMonth,
                );


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


          const retentionValue =
            raw.retention !== null
            && raw.retention !== undefined
            && raw.retention !== ''
              ? retentionLabel(
                  raw.retention
                )
              : '';


          const estimatedMarginValue =
            !isBid
            && raw.estimatedMarginPercent !== null
            && raw.estimatedMarginPercent !== undefined
              ? retentionLabel(
                  raw.estimatedMarginPercent
                )
              : '';


          const bidMarginValue =
            isBid
            && raw.margin !== null
            && raw.margin !== undefined
              ? retentionLabel(
                  raw.margin
                )
              : '';


          const weightedRangeMargin =
            rangeMargin
            && rangeMargin.weightedHistoricalMarginPercent !== null
            && rangeMargin.weightedHistoricalMarginPercent !== undefined
              ? retentionLabel(
                  rangeMargin.weightedHistoricalMarginPercent
                )
              : '';


          const weightedToDateMargin =
            !isBid
            && raw.weightedHistoricalMarginPercentToDate !== null
            && raw.weightedHistoricalMarginPercentToDate !== undefined
              ? retentionLabel(
                  raw.weightedHistoricalMarginPercentToDate
                )
              : '';


          const cityState =
            isBid
              ? [
                  raw.city,
                  raw.state,
                ]
                  .filter(Boolean)
                  .join(', ')
              : (
                  raw.cityStateZip
                  || ''
                );


          const rowData = {
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
              raw.pm
              || row.pm
              || '',


            'PE':
              isBid
                ? ''
                : (
                    raw.pe
                    || ''
                  ),


            'Superintendent':
              isBid
                ? ''
                : (
                    raw.superintendent
                    || ''
                  ),


            'APM':
              isBid
                ? ''
                : (
                    raw.apm
                    || ''
                  ),


            'Project Type':
              raw.projectType
              || '',


            'Purpose':
              raw.purpose
              || '',


            'General Contractor':
              generalContractorDisplayText(
                raw.generalContractors
                || raw.gc,
                '',
              ),


            'Street Address':
              raw.streetAddress
              || '',


            'City / State':
              cityState,


            'Location':
              row.location
              || '',


            'Due Date':
              isBid
                ? (
                    raw.dueDate
                    || ''
                  )
                : '',


            'Bid Status':
              isBid
                ? (
                    raw.status
                    || ''
                  )
                : '',


            'Probability':
              probabilityValue,


            'Square Footage':
              isBid
                ? (
                    raw.squareFootage
                    ?? ''
                  )
                : '',


            'Number of Buildings':
              isBid
                ? (
                    raw.numberOfBuildings
                    ?? ''
                  )
                : '',


            'Retention':
              retentionValue,


            'Estimated Margin %':
              estimatedMarginValue,


            'Bid Margin %':
              bidMarginValue,


            'Projection State':
              raw.forecastState
              || row.state
              || '',


            'Forecast Ready':
              typeof raw.forecastReady
                === 'boolean'
                ? (
                    raw.forecastReady
                      ? 'Yes'
                      : 'No'
                  )
                : '',


            'Distribution Method':
              raw.distributionMethod
              || '',


            'Curve':
              raw.curveDisplayName
              || '',


            'Amount Source':
              raw.amountSource
              || '',


            'Start Date Source':
              raw.startDateSource
              || '',


            'End Date Source':
              raw.endDateSource
              || '',


            'Projected From':
              fromMonth,


            'Projected Through':
              throughMonth,


            'Projected Billings In Range':
              row.expected,


            'Unweighted Bid Projected Billings In Range':
              isBid
                ? (
                    raw.selectedBidForecast
                    ?? ''
                  )
                : '',


            'Actual In Range':
              row.actual === null
              || row.actual === undefined
                ? ''
                : row.actual,


            'Margin Collected In Range':
              isBid
              || !rangeMargin
              || rangeMargin.marginCollected === null
              || rangeMargin.marginCollected === undefined
                ? ''
                : rangeMargin.marginCollected,


            'Weighted Historical Margin % In Range':
              weightedRangeMargin,


            'Margin Data Complete In Range':
              isBid
              || !rangeMargin
                ? ''
                : (
                    rangeMargin.marginDataComplete
                      ? 'Yes'
                      : 'No'
                  ),


            'Missing Margin Rows In Range':
              isBid
              || !rangeMargin
                ? ''
                : rangeMargin.missingMarginRows,


            'Variance In Range':
              row.variance === null
              || row.variance === undefined
                ? ''
                : row.variance,


            'Project Value':
              raw.effectiveAmount
              ?? row.projectValue
              ?? raw.estimatedPrice
              ?? '',


            'Original Contract Amount':
              isBid
                ? ''
                : (
                    raw.originalContractAmount
                    ?? ''
                  ),


            'Bid Estimated Price':
              raw.bidEstimatedPrice
              ?? raw.estimatedPrice
              ?? '',


            'Projection Amount Override':
              isBid
                ? (
                    raw.amountOverride
                    ?? ''
                  )
                : (
                    raw.projectionAmount
                    ?? ''
                  ),


            'Effective Start':
              raw.effectiveStartDate
              ?? raw.anticipatedStartDate
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


            'Foundation Billing Months':
              isBid
                ? ''
                : (
                    raw.foundationBillingMonthCount
                    ?? ''
                  ),


            'Projected To Date':
              isBid
                ? ''
                : (
                    raw.projectedToDate
                    ?? ''
                  ),


            'Actual To Date':
              isBid
                ? ''
                : (
                    raw.actualToDate
                    ?? ''
                  ),


            'Margin Collected To Date':
              isBid
                ? ''
                : (
                    raw.marginCollectedToDate
                    ?? ''
                  ),


            'Weighted Historical Margin % To Date':
              weightedToDateMargin,


            'Margin Data Complete To Date':
              isBid
              || typeof raw.marginDataComplete
                !== 'boolean'
                ? ''
                : (
                    raw.marginDataComplete
                      ? 'Yes'
                      : 'No'
                  ),


            'Missing Margin Rows To Date':
              isBid
                ? ''
                : (
                    raw.missingMarginRows
                    ?? ''
                  ),


            'Variance To Date':
              isBid
                ? ''
                : (
                    raw.varianceToDate
                    ?? ''
                  ),


            'Remaining Amount':
              isBid
                ? ''
                : (
                    raw.remainingAmount
                    ?? ''
                  ),


            'Future Projected Amount':
              isBid
                ? ''
                : (
                    raw.futureProjectedAmount
                    ?? ''
                  ),
          };


          if (!isAdmin) {
            for (const key of Object.keys(rowData)) {
              if (
                key.toLowerCase()
                  .includes('margin')
              ) {
                delete rowData[key];
              }
            }
          }


          return rowData;
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
    setGcFilter(ALL);
    setPotentialProbabilityInput(
      String(
        DEFAULT_POTENTIAL_PROBABILITY_PERCENT
      )
    );
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

            {canViewManagementWorkspaces && (
              <button
                type="button"
                className={
                  activePage === 'bid-log'
                    ? 'active'
                    : ''
                }
                onClick={() => setActivePage('bid-log')}
              >
                Bid Log
              </button>
            )}

            {canViewManagementWorkspaces && (
              <button
                type="button"
                className={
                  activePage === 'active-projects'
                    ? 'active'
                    : ''
                }
                onClick={() => setActivePage('active-projects')}
              >
                Projects
              </button>
            )}

            {canViewCompletedProjects && (
              <button
                type="button"
                className={
                  activePage === 'accountability'
                    ? 'active'
                    : ''
                }
                onClick={() => setActivePage('accountability')}
              >
                Completed Billings
              </button>
            )}
          </nav>
        </div>

        <div className="topbar-actions">
          <div className="notification-center">
            <button
              type="button"
              className={
                (
                  'notification-button '
                  + (
                      forecastAttention.length
                        ? 'has-attention'
                        : ''
                    )
                )
              }
              aria-expanded={
                attentionOpen
              }
              aria-label={
                forecastAttention.length
                  ? `${forecastAttention.length} notifications`
                  : 'Notifications'
              }
              title="Notifications"
              onClick={
                () => {
                  setAttentionOpen(
                    current =>
                      !current
                  );

                  loadForecastAttention();
                }
              }
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
              >
                <path
                  d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"
                />
              </svg>

              {forecastAttention.length > 0 && (
                <span className="notification-count">
                  {
                    forecastAttention.length > 99
                      ? '99+'
                      : forecastAttention.length
                  }
                </span>
              )}
            </button>

            {attentionOpen && (
              <div className="notification-panel">
                <div className="notification-panel-header">
                  <div>
                    <span>
                      NOTIFICATIONS
                    </span>

                    {forecastAttention.length > 0 && (
                      <strong>
                        {`${forecastAttention.length} active`}
                      </strong>
                    )}
                  </div>

                  <button
                    type="button"
                    className="text-button"
                    onClick={
                      () =>
                        loadForecastAttention()
                    }
                    disabled={
                      attentionLoading
                    }
                  >
                    {attentionLoading
                      ? 'Refreshing…'
                      : 'Refresh'}
                  </button>
                </div>

                {attentionError && (
                  <div className="notification-message error">
                    {attentionError}
                  </div>
                )}

                {!attentionLoading
                  && !forecastAttention.length
                  && !attentionError
                  && (
                    <div className="notification-empty">
                      No notifications.
                    </div>
                  )}

                {forecastAttention.length > 0 && (
                  <div className="notification-list">
                    {forecastAttention.map(
                      item => (
                        <article
                          key={
                            (
                              `${item.jobListId}-`
                              + `${item.forecastVersionId}`
                            )
                          }
                          className="notification-item"
                        >
                          <div className="notification-item-heading">
                            <div>
                              <span>
                                {item.jobNumber}
                              </span>

                              <strong>
                                {item.jobName
                                  || 'Current Project'}
                              </strong>
                            </div>

                            <span
                              className={
                                (
                                  'notification-variance '
                                  + (
                                      Number(
                                        item.rebalanceVarianceAmount
                                      ) < 0
                                        ? 'variance-negative'
                                        : ''
                                    )
                                )
                              }
                            >
                              {
                                currency(
                                  item.rebalanceVarianceAmount
                                )
                              }
                            </span>
                          </div>

                          <p>
                            {item.attentionSource
                              === 'ADMIN_CORRECTION'
                              ? (
                                  <>
                                    <strong>
                                      {
                                        item.submittedByName
                                        || 'An administrator'
                                      }
                                    </strong>
                                    {' changed the projection total. Operations needs to rebalance it to the System Baseline.'}
                                  </>
                                )
                              : (
                                  'This projection no longer matches the editable System Baseline and needs to be rebalanced.'
                                )}
                          </p>

                          {item.correctionReason && (
                            <p className="notification-reason">
                              {
                                item.correctionReason
                              }
                            </p>
                          )}

                          <button
                            type="button"
                            className="text-button notification-view-project"
                            onClick={
                              () =>
                                openAttentionProject(
                                  item
                                )
                            }
                          >
                            View Project
                          </button>
                        </article>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

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
              Controls the entire page — totals, By Month, By Project,
              and the breakdown below.
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
                <small>
                  {Math.round(potentialProbabilityPercent)}%+ · {potentialBidCount} projects
                </small>
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


        <section
          className="filter-panel"
          ref={mainFiltersRef}
        >
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

                <SelectField
                  label="General Contractor"
                  value={gcFilter}
                  onChange={setGcFilter}
                >
                  <option value={ALL}>
                    All General Contractors
                  </option>

                  {multipleGcOptionAvailable && (
                    <option value={MULTIPLE_GCS}>
                      Multiple GCs
                    </option>
                  )}

                  {gcOptions.map(
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
                    Bid Filters
                  </div>

                  <div className="filter-grid">
                    {bidScope === 'potential' && (
                      <ProbabilityInput
                        value={potentialProbabilityInput}
                        onChange={setPotentialProbabilityInput}
                        onBlur={normalizePotentialProbabilityInput}
                        compact
                      />
                    )}
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


        {!mainFiltersVisible
          && !filterDrawerOpen && (
            <button
              type="button"
              className="floating-filter-tab"
              onClick={
                () =>
                  setFilterDrawerOpen(true)
              }
              aria-label="Open filters"
            >
              <span>
                Filters
              </span>
            </button>
          )}


        {filterDrawerOpen && (
          <div
            className="side-filter-backdrop"
            role="presentation"
            onMouseDown={
              event => {
                if (
                  event.target
                  === event.currentTarget
                ) {
                  setFilterDrawerOpen(false);
                }
              }
            }
          >
            <aside
              className="side-filter-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="side-filter-title"
            >
              <header className="side-filter-header">
                <div>
                  <span className="section-kicker">
                    PROJECTED BILLINGS
                  </span>

                  <h2 id="side-filter-title">
                    Filters
                  </h2>

                  <p>
                    These control the entire page.
                  </p>
                </div>

                <button
                  type="button"
                  className="side-filter-close"
                  onClick={
                    () =>
                      setFilterDrawerOpen(false)
                  }
                  aria-label="Close filters"
                >
                  ×
                </button>
              </header>


              <div className="side-filter-body">
                <section className="side-filter-section">
                  <div className="side-filter-section-title">
                    Sources
                  </div>

                  <div className="side-filter-source-toggles">
                    <button
                      type="button"
                      aria-pressed={
                        bidScope === 'potential'
                      }
                      className={
                        bidScope === 'potential'
                          ? 'active'
                          : ''
                      }
                      onClick={
                        () =>
                          toggleBidScope(
                            'potential'
                          )
                      }
                    >
                      <strong>
                        Potential Projects
                      </strong>

                      <small>
                        {Math.round(potentialProbabilityPercent)}%+ · {potentialBidCount}
                      </small>
                    </button>

                    <button
                      type="button"
                      aria-pressed={
                        includeActiveProjects
                      }
                      className={
                        includeActiveProjects
                          ? 'active'
                          : ''
                      }
                      onClick={
                        toggleActiveProjects
                      }
                    >
                      <strong>
                        Active Projects
                      </strong>

                      <small>
                        {currentProjects.length} projects
                      </small>
                    </button>
                  </div>
                </section>


                <section className="side-filter-section">
                  <div className="side-filter-section-title">
                    Primary
                  </div>

                  <div className="side-filter-fields">
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

                    <SelectField
                      label="General Contractor"
                      value={gcFilter}
                      onChange={setGcFilter}
                    >
                      <option value={ALL}>
                        All General Contractors
                      </option>

                      {multipleGcOptionAvailable && (
                        <option value={MULTIPLE_GCS}>
                          Multiple GCs
                        </option>
                      )}

                      {gcOptions.map(
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
                  </div>
                </section>


                {includeActiveProjects && (
                  <section className="side-filter-section">
                    <div className="side-filter-section-title">
                      Current Projects
                    </div>

                    <div className="side-filter-fields">
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
                  </section>
                )}


                {includeBids && (
                  <section className="side-filter-section">
                    <div className="side-filter-section-title">
                      Bid Filters
                    </div>

                    <div className="side-filter-fields">
                      {bidScope === 'potential' && (
                        <ProbabilityInput
                          value={potentialProbabilityInput}
                          onChange={setPotentialProbabilityInput}
                          onBlur={normalizePotentialProbabilityInput}
                        />
                      )}
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
                  </section>
                )}
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
                      setFilterDrawerOpen(false)
                  }
                >
                  Done
                </button>
              </footer>
            </aside>
          </div>
        )}


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


        <section
          className={
            showPotentialOnly
              ? 'stats-grid stats-grid-potential-only'
              : 'stats-grid'
          }
        >
          {showPotentialOnly && (
            <>
              <StatCard
                label="Potential Projects"
                value={
                  dataLoading
                    ? 'Loading…'
                    : String(bidDetails.length)
                }
                detail={`${potentialProbabilityThreshold}%+ minimum probability`}
              />

              <StatCard
                label="Potential Project Value"
                value={
                  dataLoading
                    ? 'Loading…'
                    : currency(rawBidTotal)
                }
                detail="Estimated bid value before probability weighting"
              />

              <StatCard
                label="Probability-Weighted Projection"
                value={
                  dataLoading
                    ? 'Loading…'
                    : currency(weightedBidTotal)
                }
                detail={
                  rangeValid
                    ? `${monthLabel(fromMonth)} through ${monthLabel(throughMonth)}`
                    : 'Select a valid projected billing month range'
                }
                emphasis
              />
            </>
          )}

          {showActiveOnly && (
            <>
              <StatCard
                label="Active Projects"
                value={
                  dataLoading
                    ? 'Loading…'
                    : String(currentDetails.length)
                }
                detail="Projects in the current filtered view"
              />

              <StatCard
                label="Projected Billings"
                value={
                  dataLoading
                    ? 'Loading…'
                    : currency(currentProjectedTotal)
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
                    : currency(currentActualTotal)
                }
                detail="Foundation actual billings"
              />

              <StatCard
                label="Actual vs Projected"
                value={
                  dataLoading
                    ? 'Loading…'
                    : currency(Math.abs(currentVarianceTotal))
                }
                detail={
                  dataLoading
                    ? 'Comparing actual and projected billings'
                    : currentVarianceTotal > 0
                      ? 'Above projected billings'
                      : currentVarianceTotal < 0
                        ? 'Below projected billings'
                        : 'Actual billings match projection'
                }
              />
            </>
          )}

          {showCombinedSources && (
            <>
              <StatCard
                label="Projected Billings · Active Projects"
                value={
                  dataLoading
                    ? 'Loading…'
                    : currency(currentProjectedTotal)
                }
                detail={`${currentDetails.length} selected projects`}
              />

              <StatCard
                label="Projected Billings · Potential Projects"
                value={
                  dataLoading
                    ? 'Loading…'
                    : currency(weightedBidTotal)
                }
                detail={`${bidDetails.length} potential projects · ${currency(rawBidTotal)} project value`}
              />

              <StatCard
                label="Total Projected Billings"
                value={
                  dataLoading
                    ? 'Loading…'
                    : currency(combinedExpected)
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
                    : currency(currentActualTotal)
                }
                detail="Foundation actual billings"
              />
            </>
          )}
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

              <p className="billing-section-explainer">
                Switch between By Month and By Project.
                Collapse hides this section.
              </p>
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
                  openCurrentProjectDrawer
                }
                onSelectBidProject={
                  openActiveBidDrawer
                }
                canViewMargin={isAdmin}
                includeActiveProjects={includeActiveProjects}
                includeBids={includeBids}
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
                  <SortHeader
                    label="Month"
                    sortKey="month"
                    currentSort={monthlySort}
                    onSort={toggleMonthlySort}
                  />

                  {includeActiveProjects && (
                    <SortHeader
                      label="Active Project"
                      sortKey="active"
                      currentSort={monthlySort}
                      onSort={toggleMonthlySort}
                      numeric
                    />
                  )}

                  {includeBids && (
                    <SortHeader
                      label="Potential Projects"
                      sortKey="potential"
                      currentSort={monthlySort}
                      onSort={toggleMonthlySort}
                      numeric
                    />
                  )}

                  {showCombinedSources && (
                    <SortHeader
                      label="Total Projected Billing"
                      sortKey="projected"
                      currentSort={monthlySort}
                      onSort={toggleMonthlySort}
                      numeric
                    />
                  )}

                  {includeActiveProjects && (
                    <SortHeader
                      label="Actual Billings"
                      sortKey="actual"
                      currentSort={monthlySort}
                      onSort={toggleMonthlySort}
                      numeric
                    />
                  )}

                  {includeActiveProjects && isAdmin && (
                    <SortHeader
                      label="Margin Collected"
                      sortKey="margin"
                      currentSort={monthlySort}
                      onSort={toggleMonthlySort}
                      numeric
                    />
                  )}

                  {includeActiveProjects && (
                    <SortHeader
                      label="Variance"
                      sortKey="variance"
                      currentSort={monthlySort}
                      onSort={toggleMonthlySort}
                      numeric
                    />
                  )}
                </tr>
              </thead>


              <tbody>
                {sortedMonthlyComparison.map(
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

                        {includeActiveProjects && (
                          <td className="numeric">
                            {currency(
                              row.currentProjected
                            )}
                          </td>
                        )}

                        {includeBids && (
                          <td className="numeric">
                            {currency(
                              row.weightedBids
                            )}
                          </td>
                        )}

                        {showCombinedSources && (
                          <td className="numeric strong-cell">
                            {currency(
                              row.combinedExpected
                            )}
                          </td>
                        )}

                        {includeActiveProjects && (
                          <td className="numeric">
                            {currency(
                              row.currentActual
                            )}
                          </td>
                        )}

                        {includeActiveProjects && isAdmin && (
                          <td className="numeric monthly-margin-cell">
                            {row.currentMarginDataComplete ? (
                              <strong
                                className="monthly-margin-value"
                                title={
                                  `Weighted historical margin: ${
                                    retentionLabel(
                                      row.currentWeightedHistoricalMarginPercent
                                    )
                                  }`
                                }
                              >
                                {currency(
                                  row.currentMarginCollected
                                )}
                              </strong>
                            ) : (
                              <span className="monthly-margin-warning">
                                Margin incomplete
                              </span>
                            )}
                          </td>
                        )}

                        {includeActiveProjects && (
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
                        )}
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
                            <td colSpan={monthlySummaryColumnCount}>
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
                                        {showCombinedSources && (
                                          <SortHeader
                                            label="Source"
                                            sortKey="source"
                                            currentSort={monthDetailSort}
                                            onSort={toggleMonthDetailSort}
                                          />
                                        )}

                                        {includeActiveProjects && (
                                          <SortHeader
                                            label="Job #"
                                            sortKey="job"
                                            currentSort={monthDetailSort}
                                            onSort={toggleMonthDetailSort}
                                            firstDirection="desc"
                                          />
                                        )}

                                        <SortHeader
                                          label={
                                            showPotentialOnly
                                              ? 'Potential Project'
                                              : (
                                                  showActiveOnly
                                                    ? 'Project'
                                                    : 'Project / Bid'
                                                )
                                          }
                                          sortKey="project"
                                          currentSort={monthDetailSort}
                                          onSort={toggleMonthDetailSort}
                                        />

                                        <SortHeader
                                          label="GC"
                                          sortKey="gc"
                                          currentSort={monthDetailSort}
                                          onSort={toggleMonthDetailSort}
                                        />

                                        <SortHeader
                                          label="PM"
                                          sortKey="pm"
                                          currentSort={monthDetailSort}
                                          onSort={toggleMonthDetailSort}
                                        />

                                        {includeActiveProjects && (
                                          <SortHeader
                                            label="Team"
                                            sortKey="team"
                                            currentSort={monthDetailSort}
                                            onSort={toggleMonthDetailSort}
                                          />
                                        )}

                                        {showPotentialOnly && (
                                          <SortHeader
                                            label="Probability"
                                            sortKey="probability"
                                            currentSort={monthDetailSort}
                                            onSort={toggleMonthDetailSort}
                                            firstDirection="desc"
                                            numeric
                                          />
                                        )}

                                        <SortHeader
                                          label="Projected"
                                          sortKey="projected"
                                          currentSort={monthDetailSort}
                                          onSort={toggleMonthDetailSort}
                                          numeric
                                        />

                                        {includeActiveProjects && (
                                          <SortHeader
                                            label="Actual Billings"
                                            sortKey="actual"
                                            currentSort={monthDetailSort}
                                            onSort={toggleMonthDetailSort}
                                            numeric
                                          />
                                        )}

                                        {includeActiveProjects && isAdmin && (
                                          <SortHeader
                                            label="Margin Collected"
                                            sortKey="margin"
                                            currentSort={monthDetailSort}
                                            onSort={toggleMonthDetailSort}
                                            numeric
                                          />
                                        )}

                                        {includeActiveProjects && (
                                          <SortHeader
                                            label="Variance"
                                            sortKey="variance"
                                            currentSort={monthDetailSort}
                                            onSort={toggleMonthDetailSort}
                                            numeric
                                          />
                                        )}
                                      </tr>
                                    </thead>


                                    <tbody>
                                      {
                                        sortedSelectedMonthDetailRows.map(
                                          detail => (
                                            <tr
                                              key={
                                                detail.key
                                              }
                                              className="month-current-project-row clickable-project-row"
                                              onClick={
                                                event => {
                                                  event.stopPropagation();

                                                  if (
                                                    detail.source
                                                    === 'Current Project'
                                                  ) {
                                                    openCurrentProjectDrawer(
                                                      detail.raw
                                                    );
                                                  } else {
                                                    openActiveBidDrawer(
                                                      detail.raw
                                                    );
                                                  }
                                                }
                                              }
                                            >
                                              {showCombinedSources && (
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
                                              )}

                                              {includeActiveProjects && (
                                                <td>
                                                  {detail.number
                                                    || '—'}
                                                </td>
                                              )}

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

                                          <td className="gc-table-cell">
                                            <GeneralContractorDisplay
                                              value={
                                                detail.raw?.generalContractors
                                                || detail.raw?.gc
                                              }
                                              compact
                                            />
                                          </td>

                                              <td>
                                                <PMInitialsBadge
                                                  initials={detail.pmInitials}
                                                  hexColor={detail.pmHexColor}
                                                />
                                              </td>

                                              {includeActiveProjects && (
                                                <td className="project-team-column">
                                                  <ProjectTeamCell
                                                    pe={
                                                      detail.source === 'Current Project'
                                                        ? detail.raw?.pe
                                                        : null
                                                    }
                                                    superintendent={
                                                      detail.source === 'Current Project'
                                                        ? detail.raw?.superintendent
                                                        : null
                                                    }
                                                    apm={
                                                      detail.source === 'Current Project'
                                                        ? detail.raw?.apm
                                                        : null
                                                    }
                                                  />
                                                </td>
                                              )}

                                              {showPotentialOnly && (
                                                <td className="numeric">
                                                  {detail.probability === null
                                                    || detail.probability === undefined
                                                      ? '—'
                                                      : `${Math.round(Number(detail.probability) * 100)}%`}
                                                </td>
                                              )}

                                              <td className="numeric strong-cell">
                                                {currency(
                                                  detail.expected
                                                )}
                                              </td>

                                              {includeActiveProjects && (
                                                <td className="numeric">
                                                  {detail.actual
                                                    === null
                                                    ? '—'
                                                    : currency(
                                                        detail.actual
                                                      )}
                                                </td>
                                              )}

                                          {includeActiveProjects && isAdmin && (
                                            <td className="numeric">
                                              {detail.marginCollected
                                                === null
                                                ? '—'
                                                : currency(
                                                    detail.marginCollected
                                                  )}
                                            </td>
                                          )}

                                              {includeActiveProjects && (
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
                                              )}
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
                      colSpan={monthlySummaryColumnCount}
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

                    {includeActiveProjects && (
                      <td className="numeric">
                        {currency(
                          monthlyComparisonTotals.currentProjected
                        )}
                      </td>
                    )}

                    {includeBids && (
                      <td className="numeric">
                        {currency(
                          monthlyComparisonTotals.weightedBids
                        )}
                      </td>
                    )}

                    {showCombinedSources && (
                      <td className="numeric strong-cell">
                        {currency(
                          monthlyComparisonTotals.combinedExpected
                        )}
                      </td>
                    )}

                    {includeActiveProjects && (
                      <td className="numeric">
                        {currency(
                          monthlyComparisonTotals.currentActual
                        )}
                      </td>
                    )}

                  {includeActiveProjects && isAdmin && (
                    <td className="numeric monthly-margin-cell">
                      {monthlyComparisonTotals.currentMarginDataComplete ? (
                        <>
                          <strong className="monthly-margin-value">
                            {currency(
                              monthlyComparisonTotals.currentMarginCollected
                            )}
                          </strong>

                          <small className="monthly-margin-percent">
                            {retentionLabel(
                              monthlyComparisonTotals.currentWeightedHistoricalMarginPercent
                            )} weighted
                          </small>
                        </>
                      ) : (
                        <span className="monthly-margin-warning">
                          Margin incomplete
                        </span>
                      )}
                    </td>
                  )}

                    {includeActiveProjects && (
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
                    )}
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
                  {showCombinedSources && (
                    <SortHeader
                      label="Source"
                      sortKey="source"
                      currentSort={detailSort}
                      onSort={toggleDetailSort}
                    />
                  )}

                  {includeActiveProjects && (
                    <SortHeader
                      label="Job #"
                      sortKey="job"
                      currentSort={detailSort}
                      onSort={toggleDetailSort}
                      firstDirection="desc"
                    />
                  )}

                  <SortHeader
                    label={
                      showPotentialOnly
                        ? 'Potential Project'
                        : (
                            showActiveOnly
                              ? 'Project'
                              : 'Project / Bid'
                          )
                    }
                    sortKey="project"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                  />

                  <SortHeader
                    label="GC"
                    sortKey="gc"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                  />

                  <SortHeader
                    label="PM"
                    sortKey="pm"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                  />

                  {includeActiveProjects && (
                    <th className="project-team-column">
                      Team
                    </th>
                  )}

                  <SortHeader
                    label="Project Value"
                    sortKey="value"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                    firstDirection="desc"
                    numeric
                  />

                  {showPotentialOnly && (
                    <SortHeader
                      label="Probability"
                      sortKey="probability"
                      currentSort={detailSort}
                      onSort={toggleDetailSort}
                      firstDirection="desc"
                      numeric
                    />
                  )}

                  {includeActiveProjects && (
                    <SortHeader
                      label="Project Month"
                      sortKey="month"
                      currentSort={detailSort}
                      onSort={toggleDetailSort}
                      firstDirection="desc"
                    />
                  )}

                  <SortHeader
                    label="Projected Billings"
                    sortKey="projected"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                    firstDirection="desc"
                    numeric
                  />

                  {includeActiveProjects && (
                    <SortHeader
                      label="Actual Billings"
                      sortKey="actual"
                      currentSort={detailSort}
                      onSort={toggleDetailSort}
                      firstDirection="desc"
                      numeric
                    />
                  )}

                  {includeActiveProjects && (
                    <SortHeader
                      label="Variance"
                      sortKey="variance"
                      currentSort={detailSort}
                      onSort={toggleDetailSort}
                      firstDirection="desc"
                      numeric
                    />
                  )}
                </tr>
              </thead>


              <tbody>
                {detailRows.map(
                  row => (
                    <tr
                      key={row.key}
                      className="clickable-project-row"
                      onClick={
                        () => {
                          if (
                            row.source
                            === 'Current Project'
                          ) {
                            openCurrentProjectDrawer(
                              row.raw
                            );
                          } else {
                            openActiveBidDrawer(
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
                              row.source
                              === 'Current Project'
                            ) {
                              openCurrentProjectDrawer(
                                row.raw
                              );
                            } else {
                              openActiveBidDrawer(
                                row.raw
                              );
                            }
                          }
                        }
                      }
                      tabIndex={0}
                    >
                      {showCombinedSources && (
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
                      )}

                      {includeActiveProjects && (
                        <td className="job-number-cell">
                          {row.number || '—'}
                        </td>
                      )}

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

                      <td className="gc-table-cell">
                        <GeneralContractorDisplay
                          value={
                            row.raw?.generalContractors
                            || row.raw?.gc
                          }
                          compact
                        />
                      </td>

                      <td className="pm-badge-cell">
                        <PMInitialsBadge
                          initials={row.pmInitials}
                          hexColor={row.pmHexColor}
                        />
                      </td>

                      {includeActiveProjects && (
                        <td className="project-team-column">
                          <ProjectTeamCell
                            pe={
                              row.source === 'Current Project'
                                ? row.raw?.pe
                                : null
                            }
                            superintendent={
                              row.source === 'Current Project'
                                ? row.raw?.superintendent
                                : null
                            }
                            apm={
                              row.source === 'Current Project'
                                ? row.raw?.apm
                                : null
                            }
                          />
                        </td>
                      )}

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

                      {showPotentialOnly && (
                        <td className="numeric">
                          {row.probability === null
                            || row.probability === undefined
                              ? '—'
                              : `${Math.round(Number(row.probability) * 100)}%`}
                        </td>
                      )}

                      {includeActiveProjects && (
                        <td className="project-month-cell">
                          {row.projectMonth}
                        </td>
                      )}

                      <td className="numeric strong-cell">
                        {currency(
                          row.expected
                        )}
                      </td>

                      {includeActiveProjects && (
                        <td className="numeric">
                          {row.actual === null
                            ? '—'
                            : currency(
                                row.actual
                              )}
                        </td>
                      )}

                      {includeActiveProjects && (
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
                      )}
                    </tr>
                  )
                )}


                {!detailRows.length && (
                  <tr>
                    <td
                      colSpan={detailColumnCount}
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
      ) : activePage === 'bid-log' ? (
        <BidLogWorkspace
          user={user}
          pmDirectory={[
            ...currentProjects,
            ...activeBids,
          ]}
        />
      ) : activePage === 'active-projects' ? (
        <ActiveProjectsWorkspace
          user={user}
        />
      ) : (
        <ProjectAccountability
          user={user}
          pmDirectory={[
            ...currentProjects,
            ...activeBids,
          ]}
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
        onEditProject={() => {
          if (!selectedCurrentProject?.jobListId) {
            return;
          }

          setEditProjectedProjectId(
            selectedCurrentProject.jobListId,
          );
          setSelectedCurrentProject(null);
        }}
        onAttentionChanged={
          loadForecastAttention
        }
      />

      <ActiveBidBillingDrawer
        bid={selectedActiveBid}
        user={user}
        onClose={
          () => setSelectedActiveBid(null)
        }
        onEditBid={() => {
          if (!selectedActiveBid?.sharePointItemId) {
            return;
          }

          setEditProjectedBidId(
            selectedActiveBid.sharePointItemId,
          );
          setSelectedActiveBid(null);
        }}
        onBidUpdated={
          handleActiveBidUpdated
        }
      />

      <ActiveProjectEditDrawer
        jobListId={editProjectedProjectId}
        projectSummary={
          currentProjects.find(
            project => Number(project.jobListId)
              === Number(editProjectedProjectId),
          ) || null
        }
        user={user}
        onClose={() => setEditProjectedProjectId(null)}
        onSaved={() => {
          void refreshProjectedCurrentProjectData();
        }}
      />

      <BidLogEditDrawer
        sharePointItemId={editProjectedBidId}
        user={user}
        pmOptions={[
          ...new Set(
            activeBids
              .map(row => row.pm)
              .filter(Boolean),
          ),
        ]}
        onClose={() => setEditProjectedBidId(null)}
        onSaved={() => {
          invalidateBidLogWorkspaceCache();
          void refreshProjectedBidData();
        }}
      />
    </div>
  );
}
