import {DATA_UPDATED_MESSAGE, DATA_UPDATING_MESSAGE, DATA_REFRESH_FAILED_MESSAGE, hasCacheReadProblem} from './refreshFeedback.js';
import {PASSIVE_IDLE_WINDOW_MS} from './browserFreshness.js';
import {FilterToggleGroup, RefreshButton} from './ViewControls.jsx';
import { resolveSessionIdleTimeoutMs } from './sessionPolicy.js';
import { isTerminalUsageHeartbeat } from './usageSessionFeedback.js';
import {facetRows, hasMonthlyValues, isCompleted} from './viewFilters.js';
import {resolveSignedInPmOption} from './pmScope.js';
import {resolveVisiblePortfolioReviews, VISIBLE_REVIEW_SOURCE} from './acceptedReviewPair.js';
import ForecastBalanceFlag from './ForecastBalanceFlag.jsx';
import MonthInput from './MonthInput.jsx';
import {BalanceReviewAmount} from './BalanceReviewSummary.jsx';
import {balanceReviewFacetValues, isBalanceReviewFilter, matchesBalanceReviewFacet,
  toggleExclusiveBalanceReview} from './balanceReviewQuickFilter.js';
import AdministrationDashboard from './AdministrationDashboard.jsx';
import {indexScheduleReview} from './scheduleReview.js';
import useFacetSelectionCleanup from './useFacetSelectionCleanup.js';
import {contractorTokens, canonicalFilterKey} from './gcReference.js';
import { aggregateCurrentMonthly, summarizePortfolioMonths, summarizeMonthlyTotals, nullableAmount, amountDifference, pmProjectionForVariance, projectionSourceLabel, buildMonthlyProjectionExport, arizonaCalendarDay, varianceTooltipText } from './primaryProjection.js';
import { ProjectionEstimateMarker, ProjectionAmount } from './ProjectionDisplay.jsx';
import useGcReference, { canReadGcReference } from './useGcReference.js';
import useProjectedBillingsFreshness from './useProjectedBillingsFreshness.js';
import useOriginatingBidAttention from './useOriginatingBidAttention.js';
import useScheduleReviewAttention from './useScheduleReviewAttention.js';
import ScheduleReviewFlag from './ScheduleReviewFlag.jsx';
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
import ProjectSetupAwaitingPanel from './ProjectSetupAwaitingPanel.jsx';
import BidLogEditDrawer from './BidLogEditDrawer.jsx';
import ActiveProjectEditDrawer from './ActiveProjectEditDrawer.jsx';
import CurrentProjectBillingDrawer from './CurrentProjectBillingDrawer.jsx';
import NotificationProjectCards from './NotificationProjectCards.jsx';
import ScheduleReviewInfoDrawer from './ScheduleReviewInfoDrawer.jsx';
import ActiveBidBillingDrawer from './ActiveBidBillingDrawer.jsx';
import OriginatingBidAttentionDrawer from './OriginatingBidAttentionDrawer.jsx';
import ProjectBillingPivot from './ProjectBillingPivot.jsx';
import CsvExportDialog from './CsvExportDialog.jsx';
import useStickyTableHeader from './useStickyTableHeader.js';
import useTeamBadgeDirectory from './useTeamBadgeDirectory.js';
import {teamIdentityMap, teamBadgeTextColor} from './teamBadgeIdentity.js';
import {
  ProjectTeamBadges,
  retentionLabel,
} from './BillingDisplay.jsx';
import {
  GeneralContractorDisplay,
  MULTIPLE_GCS,
  generalContractorDisplayText,
  contractorFilterOptions,
  generalContractorFilterMatch,
  generalContractorNames,
} from './GeneralContractors.jsx';


const ALL = '__ALL__';
const UNASSIGNED = '__UNASSIGNED__';
const DEFAULT_POTENTIAL_PROBABILITY_PERCENT = 85;

const USAGE_SESSION_STORAGE_KEY =
  'riggs-bid-log-usage-session-id';

// The browser uses the effective idle policy returned by /api/auth/me.

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
      'Your session ended after a period of inactivity. Sign in again to continue.',

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

    shared_dashboard_refresh_rate_limited:
      'Data is updated.',

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


function originatingBidAttentionStatus(item) {
  if (item.relationshipState === 'LINK_CONFLICT') {
    return 'Link conflict';
  }

  if (item.relationshipState === 'PENDING_RECONCILIATION') {
    return 'Pending reconciliation';
  }

  if (item.pmIdentityState === 'NO_PM_ASSIGNED') {
    return 'No PM assigned';
  }

  if (item.pmIdentityState === 'PM_IDENTITY_UNRESOLVED') {
    return 'PM identity issue';
  }

  return item.pmDisplayName || 'Assigned PM';
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
          teamBadgeTextColor(
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


function exactJobNumberSearch(
  search,
) {
  const text =
    String(
      search || '',
    ).trim();

  if (!text) {
    return null;
  }

  const tokens =
    text
      .split(/[\s,;]+/)
      .map(token => token.trim())
      .filter(Boolean);

  if (
    tokens.length < 2
    || !tokens.every(
      token => /^\d+$/.test(token)
    )
  ) {
    return null;
  }

  return new Set(tokens);
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

  const exactJobNumbers =
    exactJobNumberSearch(search);

  if (exactJobNumbers) {
    return exactJobNumbers.has(
      String(
        row.jobNumber ?? '',
      ).trim()
    );
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

  if (exactJobNumberSearch(search)) {
    return false;
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
  options = {},
) {
  const response =
    await window.fetch(
      path,
      {
        credentials:
          'same-origin',
        ...options,
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


function historicalLastOptions(
  options,
  historicalValues,
) {
  return [
    ...options.filter(
      value =>
        !historicalValues.has(value)
    ),
    ...options.filter(
      value =>
        historicalValues.has(value)
    ),
  ];
}


function historicalProjectStaffOptions(
  rows,
  field,
  separatedField,
) {
  const currentValues =
    new Set();

  const historicalValues =
    new Set();

  const separatedValues =
    new Set();

  for (const row of rows) {
    const value = row[field];

    if (!value) {
      continue;
    }

    if (row[separatedField] === true) {
      separatedValues.add(value);
      historicalValues.add(value);
      continue;
    }

    if (row.projectCompleted) {
      historicalValues.add(value);
    } else {
      currentValues.add(value);
    }
  }

  for (const value of currentValues) {
    if (!separatedValues.has(value)) {
      historicalValues.delete(value);
    }
  }

  return historicalValues;
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
  // Live Arizona calendar day for the month-specific variance cutoff. Keep a
  // tab opened overnight consistent with the 15th without a manual refresh.
  const [varianceAsOfUTC, setVarianceAsOfUTC] = useState(() => new Date().toISOString());
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = new Date().toISOString();
      setVarianceAsOfUTC(previous =>
        arizonaCalendarDay(previous) === arizonaCalendarDay(now) ? previous : now);
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const inactivityTimeoutMs = resolveSessionIdleTimeoutMs(user);
  const gcDirectory = useGcReference(canReadGcReference(user));

  const [
    activePage,
    setActivePage,
  ] = useState('projected');
  const [projectSetupIntent, setProjectSetupIntent] = useState(null);


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

  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState(null);
  const [workspaceRefreshFeedback, setWorkspaceRefreshFeedback] = useState(null);
  const bidLogRefreshRef = useRef(null);
  const projectsRefreshRef = useRef(null);
  const completedRefreshRef = useRef(null);
  const administrationRefreshRef = useRef(null);
  const [administrationBusy, setAdministrationBusy] = useState(false);
  const [refreshingWorkspace, setRefreshingWorkspace] = useState(null);
  const activeRefreshPagesRef = useRef(new Set());

  // Header refresh is page-scoped; switching tabs cannot send a refresh to
  // another page or leave a spinner on the newly selected page.
  async function refreshWorkspacePage(page) {
    if (activeRefreshPagesRef.current.has(page)) return;
    const ref = page === 'bid-log' ? bidLogRefreshRef
      : page === 'active-projects' ? projectsRefreshRef
        : page === 'accountability' ? completedRefreshRef
        : page === 'administration' ? administrationRefreshRef : null;
    if (!ref?.current?.refresh) return;
    activeRefreshPagesRef.current.add(page);
    setRefreshingWorkspace(page);
    setWorkspaceRefreshFeedback({page, message: DATA_UPDATING_MESSAGE, type: 'progress'});
    try {
      const result = await ref.current.refresh();
      // Returning false means the reader deliberately declined the request;
      // never claim success just because no promise was rejected.
      if (activePageRef.current === page) {
        setWorkspaceRefreshFeedback(result === true ? {
          page, message: DATA_UPDATED_MESSAGE, type: 'success',
        } : null);
      }
    } catch {
      if (activePageRef.current === page) {
        setWorkspaceRefreshFeedback({
          page, message: DATA_REFRESH_FAILED_MESSAGE, type: 'error',
        });
      }
    } finally {
      activeRefreshPagesRef.current.delete(page);
      setRefreshingWorkspace(current => current === page ? null : current);
    }
  }

  useEffect(() => {
    setRefreshFeedback(null);
    setWorkspaceRefreshFeedback(null);
  }, [activePage]);

  useEffect(() => {
    if (!refreshFeedback || refreshFeedback === DATA_UPDATING_MESSAGE) return undefined;
    const timeout = window.setTimeout(() => setRefreshFeedback(null),
      refreshFeedback === DATA_REFRESH_FAILED_MESSAGE ? 6500 : 3500);
    return () => window.clearTimeout(timeout);
  }, [refreshFeedback]);

  useEffect(() => {
    if (!workspaceRefreshFeedback || workspaceRefreshFeedback.type === 'progress') return undefined;
    const timeout = window.setTimeout(() => setWorkspaceRefreshFeedback(null),
      workspaceRefreshFeedback.type === 'error' ? 6500 : 3500);
    return () => window.clearTimeout(timeout);
  }, [workspaceRefreshFeedback]);

  const [
    currentProjects,
    setCurrentProjects,
  ] = useState([]);

  const [
    selectedCurrentProject,
    setSelectedCurrentProject,
  ] = useState(null);

  const [
    selectedCurrentProjectControl,
    setSelectedCurrentProjectControl,
  ] = useState(null);

  const [
    selectedActiveBid,
    setSelectedActiveBid,
  ] = useState(null);

  const [
    originatingBidReviewProject,
    setOriginatingBidReviewProject,
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

  // NULL means no successful portfolio-wide balance read yet. A failed read
  // must never be displayed as "0 Need Rebalance".
  const [portfolioBalance, setPortfolioBalance] = useState(null);
  // Exactly the primary-projection response used for the CURRENT displayed
  // project/month rows. A refresh of the balance alone cannot change it.
  const [primarySnapshotId, setPrimarySnapshotId] = useState(null);
  // A verified financial response pair. The review gate checks exact displayed
  // object identity and current Arizona lock month before using its labels.
  const [acceptedReviewPair, setAcceptedReviewPair] = useState(null);
  const [scheduleReview, setScheduleReview] = useState(null);
  const [selectedScheduleInfo, setSelectedScheduleInfo] = useState(null);

  const [
    attentionOpen,
    setAttentionOpen,
  ] = useState(false);

  const notificationCenterRef =
    useRef(null);

  useEffect(() => {
    if (!attentionOpen) {
      return undefined;
    }

    const closeOnOutsidePointer = event => {
      const center = notificationCenterRef.current;

      if (
        center
        && !center.contains(event.target)
      ) {
        setAttentionOpen(false);
      }
    };

    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setAttentionOpen(false);
      }
    };

    document.addEventListener(
      'pointerdown',
      closeOnOutsidePointer,
    );

    window.addEventListener(
      'keydown',
      closeOnEscape,
    );

    return () => {
      document.removeEventListener(
        'pointerdown',
        closeOnOutsidePointer,
      );

      window.removeEventListener(
        'keydown',
        closeOnEscape,
      );
    };
  }, [attentionOpen]);

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
  ] = useState(false);

  const [
    monthlyComparisonView,
    setMonthlyComparisonView,
  ] = useState('project');


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
    projectionSourceFilter,
    setProjectionSourceFilter,
  ] = useState(ALL);

  const [
    search,
    setSearch,
  ] = useState('');

  const [
    pmFilter,
    setPmFilter,
  ] = useState(ALL);

  // Default the existing PM dropdown once per authenticated PM, after options load.
  const pmFilterDefaultRef = useRef(null);

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
    addMonths(
      todayMonth,
      -1,
    )
  );

  const [
    throughMonth,
    setThroughMonth,
  ] = useState(
    addMonths(
      todayMonth,
      10,
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


  const isAdmin =
    String(
      user?.appRole
      || ''
    )
      .trim()
      .toUpperCase()
    === 'ADMIN'
    || String(user?.appRole || '').trim().toUpperCase() === 'MANAGEMENT_ADMIN';


  // Microsoft authentication resolves after the first render. Set the initial
  // billing comparison disclosure by role, then allow manual toggling.
  useEffect(() => {
    if (!user?.eid) return;
    setMonthlyComparisonOpen(isAdmin);
  }, [user?.eid, isAdmin]);


  const workspaceProfile =
    String(
      user?.workspaceProfile
      || ''
    )
      .trim()
      .toUpperCase();


  const capabilities =
    user?.capabilities
    || {};


  const canViewProjectedBillings =
    capabilities
      .canViewProjectedBillings
    === true;


  const canViewBidLog =
    capabilities
      .canViewBidLog
    === true;


  const canViewProjects =
    capabilities
      .canViewProjects
    === true;

  const canViewSetupSummary = canViewBidLog
    && ['ADMIN', 'OPERATIONS'].includes(String(user?.appRole || '').toUpperCase());


  const canViewCompletedBillings =
    capabilities
      .canViewCompletedBillings
    === true;

  // The existing Bid Log badge-only endpoint resolves ALL employee identities
  // from Cognito IT Users. One passive read serves every staff badge view.
  const teamBadgeDirectory = useTeamBadgeDirectory(user?.eid, canViewBidLog);
  const teamIdentityByName = useMemo(
    () => teamIdentityMap(teamBadgeDirectory), [teamBadgeDirectory],
  );

  // Server-created, exact-owner capability; never derive this from ADMIN.
  const canViewAdministration = user?.canViewAdministration === true;


  function handleReadSessionError(error) {
    if (error?.status !== 401 || logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;
    clearUsageSessionId();
    usageSessionIdRef.current = null;
    window.location.replace(error.detail === 'application_updated'
      ? '/?auth_error=application_updated' : '/?signed_out=timeout');
  }

  const applyCurrentProjectRead = ({projects, monthly, primarySnapshotId: nextSnapshotId}) => {
    // One merged primary read: never borrow a month/amount from another source.
    setCurrentProjects(projects);
    setCurrentMonthly(new Map(monthly.items.map(row => [row.jobListId, row.items || []])));
    setPrimarySnapshotId(nextSnapshotId);
    // Refresh selected summary data without remounting an active PM editor.
    setSelectedCurrentProject(current => current
      ? projects.find(row => Number(row.jobListId) === Number(current.jobListId)) || current
      : null);
  };

  const portfolioFreshness = useProjectedBillingsFreshness({
    userKey: user ? `${user.eid}:${user.appRole}` : null,
    enabled: Boolean(user && canViewProjectedBillings),
    active: activePage === 'projected',
    lastHumanActivityAt: () => lastHumanActivityAtRef.current,
    fetchJson,
    isEnding: () => logoutInProgressRef.current,
    onSessionError: handleReadSessionError,
    onError: setDataError,
    onRefreshNotice: message => {
      if (activePageRef.current === 'projected') setRefreshFeedback(message);
    },
    onInitialLoading: setDataLoading,
    onAttention: setForecastAttention,
    onPortfolioBalance: setPortfolioBalance,
    onAcceptedReviewPair: setAcceptedReviewPair,
    onScheduleReview: setScheduleReview,
    onAttentionError: setAttentionError,
    onAttentionLoading: setAttentionLoading,
    onReady: () => {
      setProjectedInitialLoadComplete(true);
      setMonthlyProgress({ loaded: 4, total: 4 });
    },
    onReset: () => {
      backgroundPrefetchStartedRef.current = false;
      setProjectedInitialLoadComplete(false);
      setDataLoading(false);
      setDataError(null);
      setCurrentProjects([]);
      setActiveBids([]);
      setCurrentMonthly(new Map());
      setPrimarySnapshotId(null);
      setAcceptedReviewPair(null);
      setBidMonthly(new Map());
      setForecastAttention([]);
      setPortfolioBalance(null);
      setScheduleReview(null);
      setSelectedScheduleInfo(null);
      setAttentionError(null);
      setAttentionLoading(false);
      setAttentionOpen(false);
      setMonthlyProgress({ loaded: 0, total: 4 });
    },
    onCurrent: applyCurrentProjectRead,
    onReviewCohort: ({current, balance, acceptedPair}) => {
      // React batches this synchronous callback: project/month amounts,
      // balance rows and the reviewed certificate advance together.
      // A held verified cohort keeps its ORIGINAL exact financial inputs.
      if (current) applyCurrentProjectRead(current);
      if (balance) setPortfolioBalance(balance);
      setAcceptedReviewPair(acceptedPair);
    },
    onBids: dashboard => {
      setActiveBids(dashboard.projects.items);
      setBidMonthly(new Map(dashboard.monthly.map(row => [row.sharePointItemId, row.items || []])));
    },
  });

  const scheduleReviewAttention = useScheduleReviewAttention({
    userKey: user ? `${user.eid}:${user.appRole}` : null,
    enabled: Boolean(user && (canViewProjectedBillings || canViewBidLog)),
    lastHumanActivityAt: () => lastHumanActivityAtRef.current,
    fetchJson,
    isEnding: () => logoutInProgressRef.current,
    onSessionError: handleReadSessionError,
  });

  const originatingBidAttention = useOriginatingBidAttention({
    userKey: user
      ? `${user.eid}:${user.appRole}:${user.employeeTrade || ''}`
      : null,
    enabled: Boolean(user && canViewBidLog),
    lastHumanActivityAt: () => lastHumanActivityAtRef.current,
    fetchJson,
    isEnding: () => logoutInProgressRef.current,
    onSessionError: handleReadSessionError,
  });

  const originatingBidAttentionData =
    originatingBidAttention.data;

  const originatingBidAttentionItems =
    originatingBidAttentionData.items || [];

  // The server owns the provisional financial review label only
  // when its certified response pair is STILL exactly what this screen shows.
  // During a cache mismatch/refresh/rollover, SQL NeedsRebalance and the
  // original variance amounts remain visible; never infer Pending in React.
  const visibleReview = useMemo(
    () => resolveVisiblePortfolioReviews(acceptedReviewPair, {
      portfolioBalance, currentProjects, currentMonthly, primarySnapshotId,
    }, varianceAsOfUTC, {
      deferUnverified: portfolioFreshness.reviewClassificationPending,
    }),
    [acceptedReviewPair, portfolioBalance, currentProjects, currentMonthly,
      primarySnapshotId, varianceAsOfUTC, portfolioFreshness.reviewClassificationPending],
  );
  const rebalanceByJobId = visibleReview.rows;
  const scheduleReviewByJobId = useMemo(
    () => indexScheduleReview(scheduleReview || []),
    [scheduleReview],
  );

  const notificationCount =
    forecastAttention.length
    + originatingBidAttentionData.attentionCount
    + scheduleReviewAttention.items.length;

  const notificationsLoading =
    attentionLoading
    || originatingBidAttention.loading
    || scheduleReviewAttention.loading;

  const notificationsError =
    [
      attentionError,
      originatingBidAttention.error,
      scheduleReviewAttention.error,
    ]
      .filter(Boolean)
      .join(' ')
    || null;

  function loadNotifications() {
    return Promise.all([
      canViewProjectedBillings
        ? portfolioFreshness.refreshAttention({ passive: false })
        : Promise.resolve(),
      canViewBidLog
        ? originatingBidAttention.refresh({ passive: false })
        : Promise.resolve(),
      (canViewProjectedBillings || canViewBidLog)
        ? scheduleReviewAttention.refresh({ passive: false })
        : Promise.resolve(),
    ]);
  }

  function openCurrentProjectDrawer(
    project,
    initialProjectControl = null,
  ) {
    setSelectedActiveBid(null);
    setSelectedCurrentProjectControl(
      initialProjectControl,
    );
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
    void refreshProjectedBidData();
  }


  async function refreshProjectedCurrentProjectData() {
    invalidateProjectsWorkspaceCache();
    return Promise.all([
      portfolioFreshness.refreshCurrent(),
      portfolioFreshness.refreshAttention(),
      originatingBidAttention.refresh({ passive: false }),
      scheduleReviewAttention.refresh({ passive: false }),
    ]);
  }

  async function refreshProjectedBidData() {
    invalidateBidLogWorkspaceCache();
    return portfolioFreshness.refreshBids();
  }

  function openScheduleReviewProject(item) {
    setAttentionOpen(false);
    if (canViewProjectedBillings) {
      openAttentionProject(item);
    } else {
      // Project Engineers can receive assigned notifications without
      // acquiring Projected Billings read/write permissions.
      setSelectedScheduleInfo(item);
    }
  }

  function openBillingProjectFromDirectory(jobListId) {
    if (!canViewProjectedBillings) return;
    const target = currentProjects.find(
      project => Number(project.jobListId) === Number(jobListId),
    );
    if (target) {
      setActivePage('projected');
      openCurrentProjectDrawer(target, 'pm-forecast');
    } else {
      setActivePage('projected');
      setDataError('Projected billing details are still loading. Refresh and try again.');
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
      target,
      'pm-forecast',
    );

    setAttentionOpen(
      false
    );
  }


  function openOriginatingBidAttentionProject(
    attention,
  ) {
    const target =
      currentProjects.find(
        project =>
          Number(project.jobListId)
          === Number(attention.jobListId)
      );

    if (target && canViewProjectedBillings) {
      setActivePage('projected');
      openCurrentProjectDrawer(
        target,
        'originating-bid',
      );
    } else {
      setOriginatingBidReviewProject({
        jobListId: attention.jobListId,
        jobNumber: attention.jobNumber,
        jobName: attention.jobName,
      });
    }

    setAttentionOpen(false);
  }


  useEffect(() => {
    if (!user) {
      usageSessionIdRef.current =
        null;

      return undefined;
    }


    let stopped = false;
    // Visibility changes and the 60-second timer may overlap; never POST
    // the same tracking heartbeat concurrently from this tab.
    let heartbeatInFlight = false;


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

      if (activePageRef.current === 'project-setups') {
        return 'Awaiting information';
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
        || logoutInProgressRef.current
        || heartbeatInFlight
        || document.visibilityState !== 'visible'
      ) {
        return;
      }

      const idleMs = idleMilliseconds();
      if (idleMs >= inactivityTimeoutMs) {
        await finishTimeout();
        return;
      }
      // A visible-but-unattended tab must not extend the server idle window.
      if (idleMs >= PASSIVE_IDLE_WINDOW_MS) return;

      heartbeatInFlight = true;
      try {
        // The new bridge returns sessionEnded=true when SQL has already
        // finalized this UUID. Renew once, then immediately register the
        // replacement so the usage record does not remain missing.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (
            stopped
            || logoutInProgressRef.current
            || document.visibilityState !== 'visible'
            || idleMilliseconds() >= PASSIVE_IDLE_WINDOW_MS
          ) {
            return;
          }

          const submittedSessionId = usageSessionIdRef.current;
          if (!submittedSessionId) return;

          const response = await window.fetch(
            '/api/usage/heartbeat',
            {
              method: 'POST',
              credentials: 'same-origin',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                usageSessionId: submittedSessionId,
                currentPage: currentPageLabel(),
                clientActive: true,
              }),
            },
          );

          if (stopped || logoutInProgressRef.current) return;

          if (response.status === 401) {
            let detail = 'authentication_required';
            try {
              const payload = await response.json();
              detail = payload?.detail || detail;
            } catch {
              // Keep default.
            }

            stopped = true;
            clearUsageSessionId();
            usageSessionIdRef.current = null;

            if (detail === 'application_updated') {
              window.location.replace('/?auth_error=application_updated');
            } else {
              window.location.replace('/?signed_out=timeout');
            }
            return;
          }

          // A transient API error never creates a new usage session.
          if (!response.ok) return;

          let result;
          try {
            result = await response.json();
          } catch {
            // Rolling response compatibility: tracking is best-effort.
            return;
          }

          // Reject stale/mismatched terminal responses and ordinary older
          // bridge responses that do not include the new terminal marker.
          if (
            !isTerminalUsageHeartbeat(
              result,
              submittedSessionId,
              usageSessionIdRef.current,
            )
          ) {
            return;
          }

          if (stopped || logoutInProgressRef.current) return;

          const nextSessionId = createUsageSessionId();
          usageSessionIdRef.current = nextSessionId;

          try {
            window.sessionStorage.setItem(
              USAGE_SESSION_STORAGE_KEY,
              nextSessionId,
            );
          } catch {
            // The in-memory ID remains valid if storage is unavailable.
          }
          // At most one additional request is issued in this invocation;
          // there is no unbounded retry when the bridge is unavailable.
        }
      } catch {
        // Usage tracking is additive: failure does not interrupt Bid Log.
      } finally {
        heartbeatInFlight = false;
      }
    }

    function checkInactivity() {
      if (
        idleMilliseconds()
        >= inactivityTimeoutMs
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
        >= inactivityTimeoutMs
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

  }, [user, inactivityTimeoutMs]);


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
      const response =
        await window.fetch(
          '/api/auth/logout',
          {
            method: 'POST',
            credentials:
              'same-origin',
          },
        );


      let logoutUrl =
        '/?signed_out=1';


      if (response.ok) {
        const payload =
          await response.json();

        if (
          typeof payload?.logoutUrl ===
            'string'
          && payload.logoutUrl.trim()
        ) {
          logoutUrl =
            payload.logoutUrl;
        }
      }


      clearUsageSessionId();

      usageSessionIdRef.current =
        null;


      window.location.assign(
        logoutUrl,
      );

    } catch {
      clearUsageSessionId();

      usageSessionIdRef.current =
        null;


      window.location.assign(
        '/?signed_out=1',
      );
    }
  }


  useEffect(
    () => {
      if (!user) {
        return;
      }

      const allowedPages = {
        projected:
          canViewProjectedBillings,

        'bid-log':
          canViewBidLog,

        'active-projects':
          canViewProjects,

        'project-setups':
          canViewSetupSummary,

        accountability:
          canViewCompletedBillings,

        administration:
          canViewAdministration,
      };

      if (
        allowedPages[
          activePage
        ]
      ) {
        return;
      }

      const fallbackPage =
        canViewProjectedBillings
          ? 'projected'
          : canViewBidLog
            ? 'bid-log'
            : canViewProjects
              ? 'active-projects'
              : canViewCompletedBillings
                ? 'accountability'
                : null;

      if (
        fallbackPage
        && fallbackPage
          !== activePage
      ) {
        setActivePage(
          fallbackPage
        );
      }
    },
    [
      activePage,
      canViewBidLog,
      canViewCompletedBillings,
      canViewProjectedBillings,
      canViewProjects,
      canViewSetupSummary,
      canViewAdministration,
      user,
    ],
  );


  useEffect(
    () => {
      if (
        !user
        || (
          canViewProjectedBillings
          && !projectedInitialLoadComplete
        )
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


        if (canViewBidLog) {
          await runStage(
            () =>
              prefetchBidLogWorkspace(
                ['active']
              ),
          );
        }


        if (canViewProjects) {
          await runStage(
            () =>
              prefetchProjectsWorkspace({
                includeActive: true,
                includeCompleted: false,
              }),
          );
        }


        if (canViewBidLog) {
          await runStage(
            () =>
              prefetchBidLogWorkspace(
                [
                  'awarded',
                  'lost',
                ]
              ),
          );
        }


        if (canViewCompletedBillings) {
          await runStage(
            prefetchCompletedBillings,
          );
        }


        if (canViewProjects) {
          await runStage(
            () =>
              prefetchProjectsWorkspace({
                includeActive: false,
                includeCompleted: true,
              }),
          );
        }


        if (canViewBidLog) {
          await runStage(
            () =>
              prefetchBidLogWorkspace(
                ['unpursued']
              ),
          );
        }
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

        if (
          timeoutId !== null
        ) {
          window.clearTimeout(
            timeoutId
          );
        }
      };
    },
    [
      canViewBidLog,
      canViewCompletedBillings,
      canViewProjectedBillings,
      canViewProjects,
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

  const sourceSelectionKey =
    `${bidScope}-${includeActiveProjects ? 'projects' : 'no-projects'}`;

  const showCombinedSources =
    includeActiveProjects
    && includeBids;

  const showPotentialOnly =
    includeBids
    && !includeActiveProjects;

  const showProbabilityColumn =
    includeBids;

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
    + (showProbabilityColumn ? 1 : 0)
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
    + 2
    + (showProbabilityColumn ? 1 : 0)
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


  const normalizedSearch = search.trim().toLowerCase();
  // Scope the overview to represented month values. Preserve its existing completed-
  // project actual-history inclusion; the editable Projects directory is active-only.
  const currentRangeRows = useMemo(() => !rangeValid ? [] : currentProjects
    .filter(row => hasMonthlyValues(currentMonthly.get(row.jobListId), fromMonth, throughMonth,
      ['projectedAmount','actualAmount','systemBaselineAmount']))
    .map(row => {
      const m = aggregateCurrentMonthly(currentMonthly.get(row.jobListId), fromMonth, throughMonth, varianceAsOfUTC);
      return {...row,
        needsRebalance: rebalanceByJobId.has(String(row.jobListId)),
        reviewStatus: rebalanceByJobId.get(String(row.jobListId))?.reviewStatus,
        reviewStatusSource: rebalanceByJobId.get(String(row.jobListId))?.reviewStatusSource,
        scheduleReview: scheduleReviewByJobId.get(String(row.jobListId)) || null,
        rebalanceVarianceAmount: rebalanceByJobId.get(String(row.jobListId))?.rebalanceVarianceAmount,
        selectedActualValueCount:m.actualValueCount, selectedBaseline:m.baseline,
        selectedMissingPmMonths:m.missingPmMonths, selectedProjected:m.projected,
        selectedActual:m.actual, selectedVariance:m.variance, selectedMarginCollected:m.marginCollected,
        selectedVarianceProjected:m.varianceProjected, selectedVarianceActual:m.varianceActual,
        selectedVarianceComparableRows:m.varianceComparableRows,
        selectedVarianceNoPmForecastRows:m.varianceNoPmForecastRows,
        selectedVarianceMissingEditableRows:m.varianceMissingEditableRows,
        selectedVarianceHistoricalUnavailableRows:m.varianceHistoricalUnavailableRows};
    }).filter(row => !isCompleted(row) || Math.abs(Number(row.selectedActual)||0)>0.000001),
    [rangeValid,currentProjects,currentMonthly,fromMonth,throughMonth,rebalanceByJobId,scheduleReviewByJobId,varianceAsOfUTC]);
  const bidRangeRows = useMemo(() => !rangeValid ? [] : selectedBidSourceRows
    .filter(row => hasMonthlyValues(bidMonthly.get(row.sharePointItemId),fromMonth,throughMonth,
      ['monthlyForecastAmount','weightedMonthlyForecastAmount']))
    .map(row => {const m=aggregateBidMonthly(bidMonthly.get(row.sharePointItemId),fromMonth,throughMonth);
      return {...row,selectedBidForecast:m.forecast,selectedWeightedForecast:m.weighted};}),
    [rangeValid,selectedBidSourceRows,bidMonthly,fromMonth,throughMonth]);

  const scopedPotentialBidCount = activeBids.filter(row =>
    (pmFilter === ALL || pmKey(row.pm) === pmFilter)
    && isPotentialBid(row)
    && hasMonthlyValues(bidMonthly.get(row.sharePointItemId), fromMonth, throughMonth,
      ['weightedMonthlyForecastAmount', 'monthlyForecastAmount'])
  ).length;
  const portfolioFilters={pm:pmFilter,type:projectTypeFilter,purpose:purposeFilter,forecast:forecastStateFilter,projectionSource:projectionSourceFilter,
    gc:gcFilter,pe:peFilter,super:superintendentFilter,apm:apmFilter,foundation:foundationFilter,
    variance:varianceFilter,snoozed:snoozedFilter};
  const portfolioFacets=useMemo(() => {
    const entries=[...(includeActiveProjects?currentRangeRows:[]).filter(r=>currentMatchesSearch(r,normalizedSearch)).map(row=>({kind:'current',row})),
      ...bidRangeRows.filter(r=>bidMatchesSearch(r,normalizedSearch)).map(row=>({kind:'bid',row}))];
    const shared = field => ({values:e=>[e.row[field]]});
    const only = (kind,field) => ({values:e=>e.kind===kind?[e.row[field]]:[],
      matches:(e,value)=>e.kind!==kind || e.row[field]===value});
    const bool = (kind,field) => ({values:e=>e.kind===kind?[String(Boolean(e.row[field]))]:[],
      matches:(e,value)=>e.kind!==kind || String(Boolean(e.row[field]))===value});
    const variance=e=>e.row.selectedVariance==null?null:e.row.selectedVariance>0?'over':e.row.selectedVariance<0?'under':'even';
    const gc=e=>contractorTokens(e.row.generalContractors||e.row.gc,gcDirectory.directory).map(x=>x.key);
    return facetRows(entries,{...portfolioFilters,gc:canonicalFilterKey(gcFilter,gcDirectory.directory)},{
      pm:{values:e=>[pmKey(e.row.pm)]},type:{values:e=>[normalizeProjectType(e.row.projectType)]},
      purpose:shared('purpose'),forecast:shared('forecastState'),
      projectionSource:{
        values:e=>e.kind==='current'
          ? [e.row.hasPmForecast ? 'pm' : 'missing', ...(e.row.needsRebalance ? balanceReviewFacetValues(e.row) : [])]
          : [],
        matches:(e,value)=>e.kind!=='current'
          ? !isBalanceReviewFilter(value)
          : isBalanceReviewFilter(value)
            ? matchesBalanceReviewFacet(e.row, value)
            : value==='pm' ? e.row.hasPmForecast : !e.row.hasPmForecast,
      },
      gc:{values:e=>[...gc(e),...(e.kind==='bid' && generalContractorNames(e.row.generalContractors||e.row.gc).length>1?[MULTIPLE_GCS]:[])],
        matches:(e,value)=>generalContractorFilterMatch(e.row.generalContractors||e.row.gc,value,ALL,gcDirectory.directory)},
      pe:only('current','pe'),super:only('current','superintendent'),apm:only('current','apm'),
      foundation:bool('current','hasFoundationBillingHistory'),
      variance:{values:e=>e.kind==='current'?[variance(e)]:[],matches:(e,value)=>e.kind!=='current'||variance(e)===value},
      snoozed:bool('bid','snoozed'),
    });
  },[includeActiveProjects,currentRangeRows,bidRangeRows,normalizedSearch,gcDirectory.directory,JSON.stringify(portfolioFilters)]);
  useFacetSelectionCleanup(portfolioFilters,portfolioFacets.selections,{pm:setPmFilter,type:setProjectTypeFilter,
    purpose:setPurposeFilter,forecast:setForecastStateFilter,projectionSource:setProjectionSourceFilter,gc:setGcFilter,pe:setPeFilter,super:setSuperintendentFilter,
    apm:setApmFilter,foundation:setFoundationFilter,variance:setVarianceFilter,snoozed:setSnoozedFilter},!dataLoading && rangeValid);
  const currentDetails=useMemo(()=>portfolioFacets.rows.filter(e=>e.kind==='current').map(e=>e.row),[portfolioFacets]);
  const bidDetails=useMemo(()=>portfolioFacets.rows.filter(e=>e.kind==='bid').map(e=>e.row),[portfolioFacets]);
  const pmOptions=portfolioFacets.options.pm;

  useEffect(() => {
    if (!user?.eid || !canViewProjectedBillings || dataLoading || !rangeValid) return;
    const identity = String(user.eid);
    if (pmFilterDefaultRef.current === identity) return;
    const initialPm = resolveSignedInPmOption(user, pmOptions);
    if (!initialPm) return; // Wait for the user's actual PM option; never guess.
    pmFilterDefaultRef.current = identity;
    setPmFilter(initialPm);
  }, [user?.eid, user?.displayName, user?.workspaceProfile,
    canViewProjectedBillings, dataLoading, rangeValid, pmOptions]);
  const projectTypeOptions=portfolioFacets.options.type;
  const purposeOptions=portfolioFacets.options.purpose;
  const peOptions=portfolioFacets.options.pe;
  const superintendentOptions=portfolioFacets.options.super;
  const apmOptions=portfolioFacets.options.apm;
  const gcOptions=contractorFilterOptions(portfolioFacets.contexts.gc.map(e=>e.row.generalContractors||e.row.gc),gcDirectory.directory);
  const multipleGcOptionAvailable=portfolioFacets.options.gc.includes(MULTIPLE_GCS);
  const historicalPmOptions=historicalProjectStaffOptions(portfolioFacets.contexts.pm.map(e=>e.row),'pm','pmSeparated');
  const historicalPeOptions=historicalProjectStaffOptions(portfolioFacets.contexts.pe.map(e=>e.row),'pe','peSeparated');
  const historicalSuperintendentOptions=historicalProjectStaffOptions(portfolioFacets.contexts.super.map(e=>e.row),'superintendent','superintendentSeparated');
  const historicalApmOptions=historicalProjectStaffOptions(portfolioFacets.contexts.apm.map(e=>e.row),'apm','apmSeparated');

  const monthlyComparison = useMemo(() => rangeValid
    ? summarizePortfolioMonths(monthRange, currentDetails, currentMonthly, bidDetails, bidMonthly, varianceAsOfUTC)
    : [], [rangeValid, monthRange, currentDetails, currentMonthly, bidDetails, bidMonthly, varianceAsOfUTC]);

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


  const monthlyComparisonTotals = useMemo(() => summarizeMonthlyTotals(monthlyComparison, varianceAsOfUTC), [monthlyComparison, varianceAsOfUTC]);
  const projectionCoverage = useMemo(() => {
    const rows = (portfolioFacets.contexts.projectionSource || [])
      .filter(entry => entry.kind === 'current')
      .map(entry => entry.row);
    return {
      pm: rows.filter(p => !isCompleted(p) && p.hasPmForecast).length,
      system: rows.filter(p => !isCompleted(p) && !p.hasPmForecast).length,
      rebalance: rows.filter(p => !isCompleted(p) && p.needsRebalance).length,
      historical: rows.filter(p => isCompleted(p)).length,
      blank: rows.reduce((n, p) => n + (p.selectedMissingPmMonths || 0), 0),
    };
  }, [portfolioFacets]);

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

          const projected = nullableAmount(monthly.projectedAmount);

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
            baseline: monthly.systemBaselineAmount ?? (project.projectCompleted ? monthly.projectedAmount : null),
            missingPmMonths: monthly.missingPmMonths || 0,
            variance: amountDifference(actual, pmProjectionForVariance(monthly)),
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
              const aTeam = [
                a.pm,
                a.source === 'Current Project'
                  ? a.raw?.pe
                  : null,
                a.source === 'Current Project'
                  ? a.raw?.apm
                  : null,
                a.source === 'Current Project'
                  ? a.raw?.superintendent
                  : null,
              ]
                .filter(Boolean)
                .join(' ');

              const bTeam = [
                b.pm,
                b.source === 'Current Project'
                  ? b.raw?.pe
                  : null,
                b.source === 'Current Project'
                  ? b.raw?.apm
                  : null,
                b.source === 'Current Project'
                  ? b.raw?.superintendent
                  : null,
              ]
                .filter(Boolean)
                .join(' ');

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

              squareFootage:
                'squareFootage',

              cubicYards:
                'cubicYards',

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

                squareFootage:
                  row.squareFootage,

                cubicYards:
                  row.cubicYards,

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
                row.estimatedPrice
                ?? row.effectiveAmount,

              squareFootage:
                row.squareFootage,

              cubicYards:
                row.cubicYards,

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
              sortKey === 'team'
            ) {
              const aTeam = [
                a.pm,
                a.source === 'Current Project'
                  ? a.raw?.pe
                  : null,
                a.source === 'Current Project'
                  ? a.raw?.apm
                  : null,
                a.source === 'Current Project'
                  ? a.raw?.superintendent
                  : null,
              ]
                .filter(Boolean)
                .join(' ');

              const bTeam = [
                b.pm,
                b.source === 'Current Project'
                  ? b.raw?.pe
                  : null,
                b.source === 'Current Project'
                  ? b.raw?.apm
                  : null,
                b.source === 'Current Project'
                  ? b.raw?.superintendent
                  : null,
              ]
                .filter(Boolean)
                .join(' ');

              result =
                compareText(
                  aTeam,
                  bTeam,
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
      'Cubic Yards',
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
      'Projection Source',
      'Latest PM Version ID',
      'Latest PM Version Number',
      'Blank PM Comparison Months In Range',
      'System Estimate In Range',
      'Projection To Date Through Month',
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
            'Projection Source': isBid ? 'Probability-weighted Bid' : projectionSourceLabel(raw),
            'Latest PM Version ID': raw.latestForecastVersionId ?? '',
            'Latest PM Version Number': raw.latestForecastVersionNumber ?? '',
            'Blank PM Comparison Months In Range': isBid ? '' : rangeMargin?.missingPmMonths ?? 0,
            'System Estimate In Range': isBid ? '' : rangeMargin?.baseline ?? '',
            'Projection To Date Through Month': isBid ? '' : raw.projectionAsOfMonth ?? '',
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
              raw.squareFootage
              ?? '',


            'Cubic Yards':
              raw.cubicYards
              ?? '',


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
              isBid
                ? (raw.effectiveAmount ?? row.projectValue ?? raw.estimatedPrice ?? '')
                : (raw.totalContractAmount ?? ''),


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


  function exportMonthlyProjectionView() {
    const { headers, rows } = buildMonthlyProjectionExport(currentDetails, currentMonthly,
      bidDetails, bidMonthly, fromMonth, throughMonth, isAdmin);
    downloadCsv(`riggs-pm-first-monthly-${fromMonth}-to-${throughMonth}.csv`, headers, rows);
  }

  function resetFilters() {
    setSearch('');
    setPmFilter(ALL);
    setProjectTypeFilter(ALL);
    setPurposeFilter(ALL);
    setForecastStateFilter(ALL);
    setProjectionSourceFilter(ALL);
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
    setSnoozedFilter(ALL);
    setFromMonth(
      addMonths(
        todayMonth,
        -1,
      )
    );
    setThroughMonth(
      addMonths(
        todayMonth,
        10,
      )
    );
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
            {canViewProjectedBillings && (
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
            )}

            {canViewBidLog && (
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

            {canViewProjects && (
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

            {canViewSetupSummary && !canViewProjects && (
              <button type="button"
                className={activePage === 'project-setups' ? 'active' : ''}
                onClick={() => setActivePage('project-setups')}>
                Awaiting information
              </button>
            )}

            {canViewCompletedBillings && (
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
            {canViewAdministration && (
              <button
                type="button"
                className={activePage === 'administration' ? 'active' : ''}
                onClick={() => setActivePage('administration')}
              >
                Administration
              </button>
            )}
          </nav>
        </div>

        <div className="topbar-actions">
          {activePage === 'projected' && canViewProjectedBillings && <RefreshButton
            label="Refresh projected billings" busy={portfolioFreshness.refreshing}
            title={null} onClick={() => {
              void portfolioFreshness.refreshAll(); void loadNotifications();
              if (canReadGcReference(user)) void gcDirectory.refresh();
            }} />}
          {((activePage === 'bid-log' && canViewBidLog)
            || (activePage === 'active-projects' && canViewProjects)
            || (activePage === 'accountability' && canViewCompletedBillings)) && (
            <RefreshButton
              label={activePage === 'bid-log' ? 'Refresh bids'
                : activePage === 'active-projects' ? 'Refresh projects'
                  : 'Refresh completed billings'}
              busy={refreshingWorkspace === activePage}
              title={null}
              onClick={() => { void refreshWorkspacePage(activePage); }}
            />
          )}
          {activePage === 'administration' && canViewAdministration && (
            <RefreshButton
              label="Refresh administration"
              busy={refreshingWorkspace === 'administration' || administrationBusy}
              title={null}
              onClick={() => { void refreshWorkspacePage('administration'); }}
            />
          )}
          <div
            ref={notificationCenterRef}
            className="notification-center"
            hidden={!canViewProjectedBillings && !canViewBidLog}
          >
            <button
              type="button"
              className={
                (
                  'notification-button '
                  + (
                      notificationCount
                        ? 'has-attention'
                        : ''
                    )
                )
              }
              aria-expanded={
                attentionOpen
              }
              aria-label={
                notificationCount
                  ? `${notificationCount} notifications`
                  : 'Notifications'
              }
              title="Notifications"
              onClick={
                () => {
                  setAttentionOpen(
                    current =>
                      !current
                  );

                  void loadNotifications();
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

              {notificationCount > 0 && (
                <span className="notification-count">
                  {
                    notificationCount > 99
                      ? '99+'
                      : notificationCount
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

                    {notificationCount > 0 && (
                      <strong>
                        {`${notificationCount} active`}
                      </strong>
                    )}
                  </div>

                  <RefreshButton
                    label="Refresh notifications"
                    busy={notificationsLoading}
                    onClick={() => void loadNotifications()}
                  />
                </div>

                {notificationsError && (
                  <div className="notification-message error">
                    {notificationsError}
                  </div>
                )}

                {!notificationsLoading
                  && !notificationCount
                  && !notificationsError
                  && (
                    <div className="notification-empty">
                      No notifications.
                    </div>
                  )}

                {notificationCount > 0 && (
                  <div className="notification-list">
                    <NotificationProjectCards
                      forecastItems={forecastAttention.map(item => {
                        const review = rebalanceByJobId.get(String(item.jobListId));
                        return {...item, reviewStatus: review?.forecastVersionId === item.forecastVersionId
                          ? review.reviewStatus : undefined};
                      })}
                      originatingItems={originatingBidAttentionItems}
                      scheduleItems={scheduleReviewAttention.items}
                      onOpenSchedule={openScheduleReviewProject}
                      onOpenForecast={openAttentionProject}
                      onOpenOriginating={openOriginatingBidAttentionProject}
                      originatingStatus={originatingBidAttentionStatus}
                      currency={currency}
                    />
                    {originatingBidAttentionData.graceSuppressedCount > 0 && (
                      <p className="notification-message notification-grace-note">
                        {originatingBidAttentionData.graceSuppressedCount}
                        {' new projects remain inside the '}
                        {originatingBidAttentionData.graceHours}
                        {'-hour setup grace period.'}
                      </p>
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


      {(
        activePage === 'projected'
        && canViewProjectedBillings
      ) ? (
      <main className="page-shell">
        <div className="page-heading projected-page-heading">
          <h1>
            Projected Billings
          </h1>

          <div className="projected-heading-controls">
            <div
              className="source-toggles projected-heading-source-toggles"
              aria-label="Projected billing sources"
            >
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
                    {Math.round(potentialProbabilityPercent)}%+ · {scopedPotentialBidCount}
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
                  <small>{currentRangeRows.length} filtered</small>
                </span>
              </button>
            </div>

            <button
              type="button"
              className="secondary-button projected-export-button"
              onClick={() => setExportDialogOpen(true)}
              disabled={
                dataLoading
                || !rangeValid
                || !detailRows.length
              }
            >
              Export CSV
            </button>
          </div>
        </div>


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


        {!dataError && hasCacheReadProblem(portfolioFreshness.cacheStatus) && (
            <div className="page-alert" role="alert">
              The latest billing refresh failed. You can try Refresh again.
            </div>
          )}

        {gcDirectory.error && canReadGcReference(user) && <div className="page-alert" role="status">
          General Contractor directory is unavailable. Source names are shown; use the header refresh to retry.
        </div>}

        <section
          className="filter-panel projected-filter-panel"
          ref={mainFiltersRef}
        >
          <div className="filter-grid primary-filters">
            <TextField
              label="Search"
              value={search}
              onChange={setSearch}
              placeholder="Project, bid, job #s, GC, city…"
            />

            <SelectField
              label="PM"
              value={pmFilter}
              onChange={setPmFilter}
            >
              <option value={ALL}>
                All PMs
              </option>

              {historicalLastOptions(
                pmOptions,
                historicalPmOptions,
              ).map(
                value => {
                  const historical =
                    historicalPmOptions.has(value);

                  return (
                    <option
                      key={value}
                      value={value}
                      style={
                        historical
                          ? { color: 'var(--warning)' }
                          : undefined
                      }
                    >
                      {pmLabel(value)}
                      {historical
                        ? ' · Historical'
                        : ''}
                    </option>
                  );
                }
              )}
            </SelectField>

            <label className="filter-field">
              <span>
                From Month
              </span>

              <MonthInput value={fromMonth} onChange={setFromMonth} label="From Month" />
            </label>

            <label className="filter-field">
              <span>
                Through Month
              </span>

              <MonthInput value={throughMonth} onChange={setThroughMonth} label="Through Month" />
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
{portfolioFacets.options.forecast.map(value => <option key={value} value={value}>{({"READY": "Ready", "NOT_CONFIGURED": "Not Configured"})[value] || value}</option>)}
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

                  {gcOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}{option.status === 'AMBIGUOUS' ? ' · record unclear' : ''}
                    </option>
                  ))}
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

                      {historicalLastOptions(
                        peOptions,
                        historicalPeOptions,
                      ).map(
                        value => {
                          const historical =
                            historicalPeOptions.has(value);

                          return (
                            <option
                              key={value}
                              value={value}
                              style={
                                historical
                                  ? { color: 'var(--warning)' }
                                  : undefined
                              }
                            >
                              {value}
                              {historical
                                ? ' · Historical'
                                : ''}
                            </option>
                          );
                        }
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

                      {historicalLastOptions(
                        superintendentOptions,
                        historicalSuperintendentOptions,
                      ).map(
                        value => {
                          const historical =
                            historicalSuperintendentOptions.has(value);

                          return (
                            <option
                              key={value}
                              value={value}
                              style={
                                historical
                                  ? { color: 'var(--warning)' }
                                  : undefined
                              }
                            >
                              {value}
                              {historical
                                ? ' · Historical'
                                : ''}
                            </option>
                          );
                        }
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

                      {historicalLastOptions(
                        apmOptions,
                        historicalApmOptions,
                      ).map(
                        value => {
                          const historical =
                            historicalApmOptions.has(value);

                          return (
                            <option
                              key={value}
                              value={value}
                              style={
                                historical
                                  ? { color: 'var(--warning)' }
                                  : undefined
                              }
                            >
                              {value}
                              {historical
                                ? ' · Historical'
                                : ''}
                            </option>
                          );
                        }
                      )}
                    </SelectField>

                    <FilterToggleGroup
                      label="Billings"
                      value={foundationFilter}
                      onChange={setFoundationFilter}
                      allValue={ALL}
                      options={[
                        { value: 'true', label: 'Has Billings', available: portfolioFacets.options.foundation.includes('true') },
                        { value: 'false', label: 'No Billings', available: portfolioFacets.options.foundation.includes('false') },
                      ]}
                    />

                    <FilterToggleGroup
                      label="Billing vs Projection"
                      value={varianceFilter}
                      onChange={setVarianceFilter}
                      allValue={ALL}
                      options={[
                        { value: 'over', label: 'Billed More', available: portfolioFacets.options.variance.includes('over') },
                        { value: 'under', label: 'Billed Less', available: portfolioFacets.options.variance.includes('under') },
                        { value: 'even', label: 'On Target', available: portfolioFacets.options.variance.includes('even') },
                      ]}
                    />
                  </div>
                </div>
              )}


              {includeBids && (
                <div className="source-filter-group">
                  <div className="filter-group-title">
                    Potential Project Filters
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
                    <FilterToggleGroup
                      label="Snoozed"
                      value={snoozedFilter}
                      onChange={setSnoozedFilter}
                      allValue={ALL}
                      options={[
                        { value: 'true', label: 'Snoozed only', available: portfolioFacets.options.snoozed.includes('true') },
                      ]}
                    />
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
                        {Math.round(potentialProbabilityPercent)}%+ · {scopedPotentialBidCount}
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
                        {currentRangeRows.length} filtered
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
                      placeholder="Project, bid, job #s, GC, city…"
                    />

                    <SelectField
                      label="PM"
                      value={pmFilter}
                      onChange={setPmFilter}
                    >
                      <option value={ALL}>
                        All PMs
                      </option>

                      {historicalLastOptions(
                        pmOptions,
                        historicalPmOptions,
                      ).map(
                        value => {
                          const historical =
                            historicalPmOptions.has(value);

                          return (
                            <option
                              key={value}
                              value={value}
                              style={
                                historical
                                  ? { color: 'var(--warning)' }
                                  : undefined
                              }
                            >
                              {pmLabel(value)}
                              {historical
                                ? ' · Historical'
                                : ''}
                            </option>
                          );
                        }
                      )}
                    </SelectField>

                    <label className="filter-field">
                      <span>
                        From Month
                      </span>

                      <MonthInput value={fromMonth} onChange={setFromMonth} label="From Month" />
                    </label>

                    <label className="filter-field">
                      <span>
                        Through Month
                      </span>

                      <MonthInput value={throughMonth} onChange={setThroughMonth} label="Through Month" />
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
{portfolioFacets.options.forecast.map(value => <option key={value} value={value}>{({"READY": "Ready", "NOT_CONFIGURED": "Not Configured"})[value] || value}</option>)}
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

                      {gcOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}{option.status === 'AMBIGUOUS' ? ' · record unclear' : ''}
                    </option>
                  ))}
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

                        {historicalLastOptions(
                          peOptions,
                          historicalPeOptions,
                        ).map(
                          value => {
                            const historical =
                              historicalPeOptions.has(value);

                            return (
                              <option
                                key={value}
                                value={value}
                                style={
                                  historical
                                    ? { color: 'var(--warning)' }
                                    : undefined
                                }
                              >
                                {value}
                                {historical
                                  ? ' · Historical'
                                  : ''}
                              </option>
                            );
                          }
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

                        {historicalLastOptions(
                          superintendentOptions,
                          historicalSuperintendentOptions,
                        ).map(
                          value => {
                            const historical =
                              historicalSuperintendentOptions.has(value);

                            return (
                              <option
                                key={value}
                                value={value}
                                style={
                                  historical
                                    ? { color: 'var(--warning)' }
                                    : undefined
                                }
                              >
                                {value}
                                {historical
                                  ? ' · Historical'
                                  : ''}
                              </option>
                            );
                          }
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

                        {historicalLastOptions(
                          apmOptions,
                          historicalApmOptions,
                        ).map(
                          value => {
                            const historical =
                              historicalApmOptions.has(value);

                            return (
                              <option
                                key={value}
                                value={value}
                                style={
                                  historical
                                    ? { color: 'var(--warning)' }
                                    : undefined
                                }
                              >
                                {value}
                                {historical
                                  ? ' · Historical'
                                  : ''}
                              </option>
                            );
                          }
                        )}
                      </SelectField>

                      <FilterToggleGroup
                        label="Billings"
                        value={foundationFilter}
                        onChange={setFoundationFilter}
                        allValue={ALL}
                        options={[
                          { value: 'true', label: 'Has Billings', available: portfolioFacets.options.foundation.includes('true') },
                          { value: 'false', label: 'No Billings', available: portfolioFacets.options.foundation.includes('false') },
                        ]}
                      />

                      <FilterToggleGroup
                        label="Billing vs Projection"
                        value={varianceFilter}
                        onChange={setVarianceFilter}
                        allValue={ALL}
                        options={[
                          { value: 'over', label: 'Billed More', available: portfolioFacets.options.variance.includes('over') },
                          { value: 'under', label: 'Billed Less', available: portfolioFacets.options.variance.includes('under') },
                          { value: 'even', label: 'On Target', available: portfolioFacets.options.variance.includes('even') },
                        ]}
                      />
                    </div>
                  </section>
                )}


                {includeBids && (
                  <section className="side-filter-section">
                    <div className="side-filter-section-title">
                      Potential Project Filters
                    </div>

                    <div className="side-filter-fields">
                      {bidScope === 'potential' && (
                        <ProbabilityInput
                          value={potentialProbabilityInput}
                          onChange={setPotentialProbabilityInput}
                          onBlur={normalizePotentialProbabilityInput}
                        />
                      )}
                      <FilterToggleGroup
                        label="Snoozed"
                        value={snoozedFilter}
                        onChange={setSnoozedFilter}
                        allValue={ALL}
                        options={[
                          { value: 'true', label: 'Snoozed only', available: portfolioFacets.options.snoozed.includes('true') },
                        ]}
                      />
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
              {monthlyComparisonOpen && <div
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
              </div>}

              {monthlyComparisonOpen && includeBids && (
                <span className="section-note">
                  Potential Projects are probability weighted
                </span>
              )}

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

          <div className="monthly-comparison-body" hidden={!monthlyComparisonOpen}>
            {monthlyComparisonOpen && (
              <>
                <div className="projection-basis-controls">
                  {includeActiveProjects && (
                    <div className="projection-source-filter-group" aria-label="Projection source filter">
                      <button
                        type="button"
                        className={`projection-source-count-toggle ${projectionSourceFilter === ALL || projectionSourceFilter === 'pm' ? 'active' : ''}`}
                        aria-pressed={projectionSourceFilter === ALL || projectionSourceFilter === 'pm'}
                        title="Show projects with a submitted PM Projection"
                        onClick={() => setProjectionSourceFilter(value => value === 'pm' ? ALL : 'pm')}
                      >
                        {projectionCoverage.pm} PM Projections
                      </button>
                      <span className="projection-source-divider" aria-hidden="true">·</span>
                      <button
                        type="button"
                        className={`projection-source-count-toggle ${projectionSourceFilter === ALL || projectionSourceFilter === 'missing' ? 'active' : ''}`}
                        aria-pressed={projectionSourceFilter === ALL || projectionSourceFilter === 'missing'}
                        title="* No submitted PM Projection"
                        onClick={() => setProjectionSourceFilter(value => value === 'missing' ? ALL : 'missing')}
                      >
                        {projectionCoverage.system} No PM Projection*
                      </button>
                      <span className="projection-source-divider" aria-hidden="true">·</span>
                      <button
                        type="button"
                        className={`projection-source-count-toggle ${isBalanceReviewFilter(projectionSourceFilter) ? 'active' : ''} ${projectionCoverage.rebalance ? 'rebalance-count' : ''}`}
                        aria-pressed={isBalanceReviewFilter(projectionSourceFilter)}
                        title={portfolioBalance === null
                          ? 'Portfolio balance statuses are loading or unavailable'
                          : visibleReview.source === VISIBLE_REVIEW_SOURCE.SQL_REBALANCE_FALLBACK
                            ? 'Available SQL balance gaps remain visible while Foundation timing classification is temporarily unavailable.'
                            : 'Review flagged projections, including those pending Foundation billing'}
                        disabled={portfolioBalance === null}
                        onClick={() => setProjectionSourceFilter(value => value === 'rebalance' ? ALL : 'rebalance')}
                      >
                        {portfolioBalance === null ? '—' : projectionCoverage.rebalance} Balance Reviews
                      </button>
                      {projectionCoverage.historical > 0 && (
                        <span>{projectionCoverage.historical} historical billing</span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

          {monthlyComparisonView === 'project'
            ? (
              <ProjectBillingPivot
                teamIdentityByName={teamIdentityByName}
                months={monthRange}
                currentProjects={currentDetails}
                bidProjects={bidDetails}
                currentMonthly={currentMonthly}
                bidMonthly={bidMonthly}
                currency={currency}
                monthLabel={monthLabel}
                varianceAsOfUTC={varianceAsOfUTC}
                onSelectCurrentProject={
                  openCurrentProjectDrawer
                }
                onSelectBidProject={
                  openActiveBidDrawer
                }
                canViewMargin={isAdmin}
                includeActiveProjects={includeActiveProjects}
                includeBids={includeBids}
                projectionSourceFilter={projectionSourceFilter}
                projectionCoverage={projectionCoverage}
                portfolioBalanceAvailable={portfolioBalance !== null}
                onProjectionSourceFilterChange={setProjectionSourceFilter}
                projectionSourceAllValue={ALL}
                onBalanceReviewQuickFilter={status => setProjectionSourceFilter(value =>
                  toggleExclusiveBalanceReview(value, status, ALL))}
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
                            <ProjectionAmount value={row.currentProjected} currency={currency} missing={row.missingPmMonths} baseline={row.currentBaseline} compare={false} />
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
                            <ProjectionAmount value={row.combinedExpected} currency={currency} missing={row.missingPmMonths} />
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
                            title={varianceTooltipText({actualVariance:row.actualVariance,
                              comparableVariance:row.comparableVariance, mode:row.varianceMode,
                              compared:row.varianceComparableRows, actualProjects:row.actualValueCount}, currency)}
                          >
                            {row.variance === null ? '—' : currency(row.variance)}
                            {row.variance != null && row.varianceMode === 'COMPARABLE' && (
                              <sup className="pivot-variance-mode-indicator" title="Comparable variance">C</sup>
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

                                        {showProbabilityColumn && (
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
                                          label="GC"
                                          sortKey="gc"
                                          currentSort={monthDetailSort}
                                          onSort={toggleMonthDetailSort}
                                        />

                                        <SortHeader
                                          label="Team"
                                          sortKey="team"
                                          currentSort={monthDetailSort}
                                          onSort={toggleMonthDetailSort}
                                        />

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
                                                      detail.raw,
                                                      event.target.closest('[data-needs-rebalance], [data-schedule-review]')
                                                        ? 'pm-forecast' : null,
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
                                                        : (
                                                            detail.raw?.projectCompleted
                                                              ? 'source-chip completed'
                                                              : 'source-chip current'
                                                          )
                                                    }
                                                  >
                                                    {detail.source
                                                      === 'Current Project'
                                                      ? (
                                                          detail.raw?.projectCompleted
                                                            ? 'Completed'
                                                            : 'Active'
                                                        )
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
                                                <div className="project-name-status-line">
                                                  {detail.source === 'Current Project' && <ProjectionEstimateMarker project={detail.raw} />}
                                                  <strong
                                                    className="project-title-ellipsis"
                                                    title={displayValue(detail.name)}
                                                  >
                                                    {displayValue(
                                                      detail.name
                                                    )}
                                                  </strong>

                                                  {detail.source === 'Current Project' && !isCompleted(detail.raw) && detail.raw?.needsRebalance && (
                                                    <span className="balance-review-status-stack">
                                                      <ForecastBalanceFlag review={rebalanceByJobId.get(String(detail.raw?.jobListId))}
                                                        onClick={() => openCurrentProjectDrawer(detail.raw, 'pm-forecast')}
                                                        onQuickFilter={status => setProjectionSourceFilter(value =>
                                                          toggleExclusiveBalanceReview(value, status, ALL))}
                                                        selectedQuickFilter={projectionSourceFilter}
                                                      />
                                                      <BalanceReviewAmount review={rebalanceByJobId.get(String(detail.raw?.jobListId))} />
                                                    </span>
                                                  )}
                                                  {detail.source === 'Current Project' && !isCompleted(detail.raw) && (
                                                    <ScheduleReviewFlag review={detail.raw?.scheduleReview} />
                                                  )}
                                                  {detail.raw?.projectCompleted && (
                                                    <span className="project-completed-pill">
                                                      Completed
                                                    </span>
                                                  )}
                                                </div>

                                                <span>
                                                  {detail.location
                                                    || '—'}
                                                </span>
                                              </td>

                                              {showProbabilityColumn && (
                                                <td className="numeric">
                                                  {detail.probability === null
                                                    || detail.probability === undefined
                                                      ? '—'
                                                      : `${Math.round(Number(detail.probability) * 100)}%`}
                                                </td>
                                              )}

                                              <td className="gc-table-cell">
                                                <GeneralContractorDisplay
                                                  value={
                                                    detail.raw?.generalContractors
                                                    || detail.raw?.gc
                                                  }
                                                  compact
                                                />
                                              </td>

                                              <td className="project-team-badge-column">
                                                <ProjectTeamBadges
                                                  teamIdentityByName={teamIdentityByName}
                                                  pm={detail.pm}
                                                  pmInitials={detail.pmInitials}
                                                  pmHexColor={detail.pmHexColor}
                                                  pe={
                                                    detail.source === 'Current Project'
                                                      ? detail.raw?.pe
                                                      : null
                                                  }
                                                  peInitials={detail.raw?.peInitials}
                                                  peHexColor={detail.raw?.peHexColor}
                                                  apm={
                                                    detail.source === 'Current Project'
                                                      ? detail.raw?.apm
                                                      : null
                                                  }
                                                  apmInitials={detail.raw?.apmInitials}
                                                  apmHexColor={detail.raw?.apmHexColor}
                                                  superintendent={
                                                    detail.source === 'Current Project'
                                                      ? detail.raw?.superintendent
                                                      : null
                                                  }
                                                  superintendentInitials={detail.raw?.superintendentInitials}
                                                  superintendentHexColor={detail.raw?.superintendentHexColor}
                                                />
                                              </td>

                                              <td className="numeric strong-cell">
                                                <ProjectionAmount value={detail.expected} currency={currency} missing={detail.missingPmMonths} baseline={detail.baseline} compare={false} />
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
                        <ProjectionAmount value={monthlyComparisonTotals.currentProjected} currency={currency} missing={monthlyComparisonTotals.missingPmMonths} baseline={monthlyComparisonTotals.currentBaseline} compare={false} />
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
                        <ProjectionAmount value={monthlyComparisonTotals.combinedExpected} currency={currency} missing={monthlyComparisonTotals.missingPmMonths} />
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
                        title={varianceTooltipText({actualVariance:monthlyComparisonTotals.actualVariance,
                          comparableVariance:monthlyComparisonTotals.comparableVariance,
                          mode:monthlyComparisonTotals.varianceMode,
                          compared:monthlyComparisonTotals.varianceComparableRows,
                          actualProjects:monthlyComparisonTotals.actualValueCount,
                          scope:'project-months'}, currency)}
                      >
                        {monthlyComparisonTotals.variance === null ? '—' : currency(monthlyComparisonTotals.variance)}
                        {monthlyComparisonTotals.variance != null &&
                        ['COMPARABLE','MIXED'].includes(monthlyComparisonTotals.varianceMode) && (
                          <sup className="pivot-variance-mode-indicator" title={
                            monthlyComparisonTotals.varianceMode === 'MIXED'
                              ? 'Mixed monthly variance' : 'Comparable variance'
                          }>{monthlyComparisonTotals.varianceMode === 'MIXED' ? '*' : 'C'}</sup>
                        )}
                      </td>
                    )}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
            )}
          </div>
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

                  {showProbabilityColumn && (
                    <SortHeader
                      label="Probability"
                      sortKey="probability"
                      currentSort={detailSort}
                      onSort={toggleDetailSort}
                      firstDirection="desc"
                      numeric
                    />
                  )}

                  <SortHeader
                    label="GC"
                    sortKey="gc"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                  />

                  <SortHeader
                    label="Team"
                    sortKey="team"
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
                    label="SF"
                    sortKey="squareFootage"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                    firstDirection="desc"
                    numeric
                  />

                  <SortHeader
                    label="CY"
                    sortKey="cubicYards"
                    currentSort={detailSort}
                    onSort={toggleDetailSort}
                    firstDirection="desc"
                    numeric
                  />

                  {includeActiveProjects && (
                    <SortHeader
                      label="Month"
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
                        event => {
                          if (
                            row.source
                            === 'Current Project'
                          ) {
                            openCurrentProjectDrawer(
                              row.raw,
                              event.target.closest('[data-needs-rebalance], [data-schedule-review]')
                                ? 'pm-forecast' : null,
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
                                : (
                                    row.raw?.projectCompleted
                                      ? 'source-chip completed'
                                      : 'source-chip current'
                                  )
                            }
                          >
                            {row.source
                              === 'Current Project'
                              ? (
                                  row.raw?.projectCompleted
                                    ? 'Completed'
                                    : 'Active'
                                )
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
                        <div className="project-name-status-line">
                          {row.source === 'Current Project' && <ProjectionEstimateMarker project={row.raw} />}
                          <strong
                            className="project-title-ellipsis"
                            title={displayValue(row.name)}
                          >
                            {displayValue(
                              row.name
                            )}
                          </strong>

                          {row.source === 'Current Project' && !isCompleted(row.raw) && row.raw?.needsRebalance && (
                            <span className="balance-review-status-stack">
                              <ForecastBalanceFlag review={rebalanceByJobId.get(String(row.raw?.jobListId))}
                                                        onClick={() => openCurrentProjectDrawer(row.raw, 'pm-forecast')}
                                                        onQuickFilter={status => setProjectionSourceFilter(value =>
                                                          toggleExclusiveBalanceReview(value, status, ALL))}
                                                        selectedQuickFilter={projectionSourceFilter}
                                                      />
                              <BalanceReviewAmount review={rebalanceByJobId.get(String(row.raw?.jobListId))} />
                            </span>
                          )}
                          {row.source === 'Current Project' && !isCompleted(row.raw) && (
                            <ScheduleReviewFlag review={row.raw?.scheduleReview} />
                          )}
                          {row.raw?.projectCompleted && (
                            <span className="project-completed-pill">
                              Completed
                            </span>
                          )}
                        </div>

                        <span className="project-location-line">
                          {row.location || '—'}
                        </span>
                      </td>

                      {showProbabilityColumn && (
                        <td className="numeric">
                          {row.probability === null
                            || row.probability === undefined
                              ? '—'
                              : `${Math.round(Number(row.probability) * 100)}%`}
                        </td>
                      )}

                      <td className="gc-table-cell">
                        <GeneralContractorDisplay
                          value={
                            row.raw?.generalContractors
                            || row.raw?.gc
                          }
                          compact
                        />
                      </td>

                      <td className="project-team-badge-column">
                        <ProjectTeamBadges
                          teamIdentityByName={teamIdentityByName}
                          pm={row.pm}
                          pmInitials={row.pmInitials}
                          pmHexColor={row.pmHexColor}
                          pe={
                            row.source === 'Current Project'
                              ? row.raw?.pe
                              : null
                          }
                          peInitials={row.raw?.peInitials}
                          peHexColor={row.raw?.peHexColor}
                          apm={
                            row.source === 'Current Project'
                              ? row.raw?.apm
                              : null
                          }
                          apmInitials={row.raw?.apmInitials}
                          apmHexColor={row.raw?.apmHexColor}
                          superintendent={
                            row.source === 'Current Project'
                              ? row.raw?.superintendent
                              : null
                          }
                          superintendentInitials={row.raw?.superintendentInitials}
                          superintendentHexColor={row.raw?.superintendentHexColor}
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

                      <td className="numeric">
                        {row.squareFootage
                          === null
                          || row.squareFootage
                            === undefined
                          ? '—'
                          : Math.round(
                              Number(row.squareFootage)
                            ).toLocaleString('en-US')}
                      </td>

                      <td className="numeric">
                        {row.cubicYards
                          === null
                          || row.cubicYards
                            === undefined
                          ? '—'
                          : Math.round(
                              Number(row.cubicYards)
                            ).toLocaleString('en-US')}
                      </td>

                      {includeActiveProjects && (
                        <td className="project-month-cell">
                          {row.projectMonth}
                        </td>
                      )}

                      <td className="numeric strong-cell">
                        <ProjectionAmount value={row.expected} currency={currency} missing={row.raw?.selectedMissingPmMonths} baseline={row.raw?.selectedBaseline} compare={false} />
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
      ) : (
        activePage === 'bid-log'
        && canViewBidLog
      ) ? (
        <BidLogWorkspace
          user={user}
          pmBadgeDirectory={teamBadgeDirectory}
          refreshApiRef={bidLogRefreshRef}
          pmDirectory={[
            ...currentProjects,
            ...activeBids,
          ]}
          onBidDataChanged={() => {
            void refreshProjectedBidData();
          }}
          onOpenProjectSetup={originalBidLogId => {
            if (String(user?.appRole || '').trim().toUpperCase() !== 'ADMIN') return;
            setProjectSetupIntent({originalBidLogId});
            setActivePage('active-projects');
          }}
        />
      ) : (
        activePage === 'active-projects'
        && canViewProjects
      ) ? (
        <ActiveProjectsWorkspace
          user={user}
          setupIntent={projectSetupIntent}
          onSetupIntentChanged={setProjectSetupIntent}
          teamIdentityByName={teamIdentityByName}
          refreshApiRef={projectsRefreshRef}
          rebalanceByJobId={rebalanceByJobId}
          scheduleReviewByJobId={scheduleReviewByJobId}
          onOpenBillingProject={canViewProjectedBillings ? openBillingProjectFromDirectory : null}
          onProjectDataChanged={refreshProjectedCurrentProjectData}
        />
      ) : (
        activePage === 'project-setups'
        && canViewSetupSummary
      ) ? (
        <main className="page-shell active-projects-workspace">
          <div className="page-heading bid-log-workspace-heading">
            <div><div className="eyebrow">PROJECT SETUP</div><h1>Awaiting information</h1></div>
          </div>
          <ProjectSetupAwaitingPanel />
        </main>
      ) : (
        activePage === 'accountability'
        && canViewCompletedBillings
      ) ? (
        <ProjectAccountability
          user={user}
          teamIdentityByName={teamIdentityByName}
          refreshApiRef={completedRefreshRef}
          pmDirectory={[
            ...currentProjects,
            ...activeBids,
          ]}
        />
      ) : (
        activePage === 'administration'
        && canViewAdministration
      ) ? (
        <AdministrationDashboard
          onSessionError={handleReadSessionError}
          refreshApiRef={administrationRefreshRef}
          onBusyChange={setAdministrationBusy}
        />
      ) : null}

      {((activePage === 'projected' && refreshFeedback)
        || (workspaceRefreshFeedback?.page === activePage && workspaceRefreshFeedback)) && (
        <div
          className={`action-toast refresh-feedback ${
            activePage === 'projected'
              ? (refreshFeedback === DATA_REFRESH_FAILED_MESSAGE ? 'error' : '')
              : (workspaceRefreshFeedback.type === 'error' ? 'error' : '')
          }`}
          role={((activePage === 'projected' && refreshFeedback === DATA_REFRESH_FAILED_MESSAGE)
            || (workspaceRefreshFeedback?.page === activePage && workspaceRefreshFeedback?.type === 'error'))
            ? 'alert' : 'status'}
        >
          <span className={`refresh-toast-indicator ${
            (activePage === 'projected' ? refreshFeedback === DATA_UPDATING_MESSAGE
              : workspaceRefreshFeedback?.type === 'progress') ? 'is-progress' : ''
          }`} aria-hidden="true">
            {(activePage === 'projected' ? refreshFeedback === DATA_UPDATING_MESSAGE
              : workspaceRefreshFeedback?.type === 'progress') ? '↻' : (
                (activePage === 'projected' ? refreshFeedback === DATA_REFRESH_FAILED_MESSAGE
                  : workspaceRefreshFeedback?.type === 'error') ? '!' : '✓'
              )}
          </span>
          {activePage === 'projected' ? refreshFeedback : workspaceRefreshFeedback.message}
        </div>
      )}

      <CsvExportDialog
        open={exportDialogOpen}
        projectCount={detailRows.length}
        onClose={() => setExportDialogOpen(false)}
        onMonthly={exportMonthlyProjectionView}
        onBreakdown={exportCurrentView}
      />

      <CurrentProjectBillingDrawer
        project={selectedCurrentProject}
        user={user}
        rebalanceAttention={selectedCurrentProject
          ? rebalanceByJobId.get(String(selectedCurrentProject.jobListId)) || null
          : null}
        scheduleReview={selectedCurrentProject
          ? scheduleReviewByJobId.get(String(selectedCurrentProject.jobListId)) || null
          : null}
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
        initialProjectControl={
          selectedCurrentProjectControl
        }
        onClose={() => {
          setSelectedCurrentProject(null);
          setSelectedCurrentProjectControl(null);
        }}
        onEditProject={() => {
          if (!selectedCurrentProject?.jobListId) {
            return;
          }

          setEditProjectedProjectId(
            selectedCurrentProject.jobListId,
          );
          setSelectedCurrentProject(null);
          setSelectedCurrentProjectControl(null);
        }}
        onAttentionChanged={refreshProjectedCurrentProjectData}
      />

      <ScheduleReviewInfoDrawer
        review={selectedScheduleInfo}
        onClose={() => setSelectedScheduleInfo(null)}
      />

      <OriginatingBidAttentionDrawer
        project={originatingBidReviewProject}
        user={user}
        onClose={() => setOriginatingBidReviewProject(null)}
        onLinked={() => {
          void refreshProjectedCurrentProjectData();
        }}
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
              .filter(
                row =>
                  row?.pm
                  && (row?.pmInitials || row?.pmHexColor)
                  && String(row.pm).trim().toUpperCase() !== 'NO PM ASSIGNED',
              )
              .map(row => row.pm),
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
