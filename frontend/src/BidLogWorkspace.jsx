import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  GeneralContractorDisplay,
  generalContractorDisplayText,
} from './GeneralContractors.jsx';
import BidLogEditDrawer from './BidLogEditDrawer.jsx';
import BidLogOutcomeEditDrawer from './BidLogOutcomeEditDrawer.jsx';
import BidLogCreateDrawer from './BidLogCreateDrawer.jsx';
import ActionToast from './ActionToast.jsx';


const ALL = '__ALL__';
const BID_LOG_CACHE_MAX_AGE_MS = 60_000;
const BID_LOG_INITIAL_RENDER_COUNT = 500;
const BID_LOG_RENDER_STEP = 500;

const BID_VIEWS = {
  active: {
    key: 'active',
    label: 'Active',
    status: null,
    title: 'Active Bids',
    kicker: 'ACTIVE BIDS',
    description: 'Review current Bid Log opportunities, due dates, estimating values, and assignment information.',
  },
  awarded: {
    key: 'awarded',
    label: 'Awarded',
    status: 'Awarded',
    title: 'Awarded Bids',
    kicker: 'AWARDED BIDS',
    description: 'Review and maintain bids that have been awarded.',
  },
  lost: {
    key: 'lost',
    label: 'Lost',
    status: 'Lost',
    title: 'Lost Bids',
    kicker: 'LOST BIDS',
    description: 'Review and maintain bids recorded as lost.',
  },
  unpursued: {
    key: 'unpursued',
    label: 'Unpursued',
    status: 'Not Pursuing',
    title: 'Unpursued Bids',
    kicker: 'UNPURSUED BIDS',
    description: 'Review bids that Riggs chose not to pursue.',
  },
};

let bidLogListCache = Object.fromEntries(
  Object.keys(BID_VIEWS).map(key => [
    key,
    { payload: null, loadedAt: 0 },
  ]),
);


function bidLogCacheIsFresh(viewKey) {
  const entry = bidLogListCache[viewKey];

  return entry?.payload !== null
    && Date.now() - entry.loadedAt < BID_LOG_CACHE_MAX_AGE_MS;
}


function writeBidLogCache(viewKey, payload) {
  bidLogListCache = {
    ...bidLogListCache,
    [viewKey]: {
      payload,
      loadedAt: Date.now(),
    },
  };
}


export function invalidateBidLogWorkspaceCache() {
  bidLogListCache = Object.fromEntries(
    Object.entries(bidLogListCache).map(
      ([key, entry]) => [key, { ...entry, loadedAt: 0 }],
    ),
  );
}


function pmBadgeTextColor(hexColor) {
  const match = String(hexColor || '')
    .trim()
    .match(/^#?([0-9a-f]{6})$/i);

  if (!match) {
    return '#ffffff';
  }

  const value = match[1];
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  const luminance = (
    red * 299
    + green * 587
    + blue * 114
  ) / 1000;

  return luminance > 160
    ? '#111111'
    : '#ffffff';
}


function initialsFromName(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return '';
  }

  return words
    .slice(0, 2)
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase();
}


function pmDirectoryKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}


function PMInitialsBadge({
  name,
  initials,
  hexColor,
}) {
  const value = String(
    initials || initialsFromName(name) || '',
  ).trim();

  if (!value) {
    return (
      <span className="pm-badge-empty">
        —
      </span>
    );
  }

  const background = /^#[0-9a-f]{6}$/i.test(
    String(hexColor || '').trim(),
  )
    ? String(hexColor).trim()
    : '#4b5563';

  return (
    <span
      className="pm-initials-badge"
      title={name || 'Project Manager'}
      style={{
        backgroundColor: background,
        color: pmBadgeTextColor(background),
      }}
    >
      {value}
    </span>
  );
}


function NotesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M5 4.5h14v11H9l-4 4v-15Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 8h8M8 11.5h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}


function SummaryIcon({ name }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  if (name === 'due30') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M7 3h10M7 21h10M8 3c0 4 1.6 5.4 4 7 2.4-1.6 4-3 4-7M8 21c0-4 1.6-5.4 4-7 2.4 1.6 4 3 4 7" />
      </svg>
    );
  }

  if (name === 'unassigned') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="9" cy="8" r="3" />
        <path {...common} d="M3.5 19c.7-3.2 2.5-5 5.5-5 1.6 0 2.9.5 3.9 1.4M17 14v6M14 17h6" />
      </svg>
    );
  }

  if (name === 'snoozed') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M19.5 15.4A8 8 0 0 1 8.6 4.5a7 7 0 1 0 10.9 10.9Z" />
      </svg>
    );
  }

  if (name === 'missingEstimate') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 3 21 20H3L12 3Z" />
        <path {...common} d="M12 9v5M12 17.5v.1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect {...common} x="4" y="7" width="16" height="12" rx="2" />
      <path {...common} d="M9 7V5h6v2M4 12h16M10 12v2h4v-2" />
    </svg>
  );
}


function displayValue(value) {
  if (
    value === null
    || value === undefined
    || String(value).trim() === ''
  ) {
    return '—';
  }

  return String(value).trim();
}


function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
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


function wholeNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return new Intl.NumberFormat(
    'en-US',
    {
      maximumFractionDigits: 0,
    },
  ).format(number);
}


function probabilityRatio(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  if (number >= 0 && number <= 1) {
    return number;
  }

  if (number > 1 && number <= 100) {
    return number / 100;
  }

  return null;
}


function probabilityLabel(value) {
  const ratio = probabilityRatio(value);

  if (ratio === null) {
    return '—';
  }

  return `${Math.round(ratio * 100)}%`;
}


function dateOnly(value) {
  if (!value) {
    return null;
  }

  const text = String(value).slice(0, 10);
  const date = new Date(`${text}T12:00:00`);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}


function dateLabel(value) {
  const date = dateOnly(value);

  if (!date) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
    },
  ).format(date);
}


function startOfToday() {
  const now = new Date();

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
}


function daysFromToday(value) {
  const date = dateOnly(value);

  if (!date) {
    return null;
  }

  const today = startOfToday();
  const target = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  return Math.round(
    (target.getTime() - today.getTime())
    / 86400000,
  );
}


function dueState(row) {
  const days = daysFromToday(row.dueDate);

  if (days === null) {
    return null;
  }

  if (days < 0) {
    return {
      label: 'OVERDUE',
      tone: 'overdue',
    };
  }

  if (days === 0) {
    return {
      label: 'DUE TODAY',
      tone: 'today',
    };
  }

  return null;
}


function normalizedSearch(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}


function matchesSearch(row, search) {
  const needle = normalizedSearch(search);

  if (!needle) {
    return true;
  }

  return [
    row.sharePointItemId,
    row.bidName,
    row.pm,
    row.projectType,
    row.purpose,
    row.generalContractors,
    row.developer,
    row.streetAddress,
    row.city,
    row.state,
    row.status,
  ].some(
    value =>
      normalizedSearch(value)
        .includes(needle),
  );
}


function isUnassigned(row) {
  const pm = normalizedSearch(row.pm);

  return (
    !pm
    || pm === 'no pm assigned'
  );
}


function isDueWithin(row, days) {
  const difference = daysFromToday(row.dueDate);

  return (
    difference !== null
    && difference >= 0
    && difference <= days
  );
}


function isOverdue(row) {
  const difference = daysFromToday(row.dueDate);

  return (
    difference !== null
    && difference < 0
  );
}


function sortedUnique(items, selector) {
  return Array.from(
    new Set(
      items
        .map(selector)
        .filter(
          value =>
            value !== null
            && value !== undefined
            && String(value).trim() !== '',
        )
        .map(value => String(value).trim()),
    ),
  ).sort(
    (a, b) =>
      a.localeCompare(b),
  );
}


async function loadActiveBidDetail(sharePointItemId) {
  const response = await window.fetch(
    `/api/bid-log/active/${sharePointItemId}`,
    {
      credentials: 'same-origin',
    },
  );

  if (!response.ok) {
    let detail = 'Unable to load bid notes.';

    try {
      const payload = await response.json();
      detail = payload?.detail || detail;
    } catch {
      // Keep the user-facing fallback.
    }

    throw new Error(detail);
  }

  return response.json();
}


function normalizeOutcomeListPayload(payload) {
  if (!Array.isArray(payload?.items)) {
    throw new Error('Historical Bid Log returned an invalid response.');
  }

  return {
    ...payload,
    items: payload.items.map(row => ({
      ...row,
      probability: probabilityRatio(row?.probabilityPercent),
    })),
  };
}


async function loadBidView(viewKey, signal) {
  const view = BID_VIEWS[viewKey] || BID_VIEWS.active;
  const path = view.key === 'active'
    ? '/api/bid-log/active?limit=500&offset=0'
    : `/api/bid-log/outcomes?status=${encodeURIComponent(view.status)}`;

  const response = await window.fetch(
    path,
    {
      credentials: 'same-origin',
      signal,
    },
  );

  if (!response.ok) {
    let detail = `Unable to load ${view.title.toLowerCase()}.`;

    try {
      const payload = await response.json();
      detail = payload?.detail || detail;
    } catch {
      // Keep the user-facing fallback.
    }

    throw new Error(detail);
  }

  const payload = await response.json();

  if (view.key === 'active') {
    if (!Array.isArray(payload?.items)) {
      throw new Error('Active Bid Log returned an invalid response.');
    }

    return payload;
  }

  return normalizeOutcomeListPayload(payload);
}


export async function prefetchBidLogWorkspace(
  viewKeys = Object.keys(BID_VIEWS),
) {
  for (const viewKey of viewKeys) {
    if (
      !BID_VIEWS[viewKey]
      || bidLogCacheIsFresh(viewKey)
    ) {
      continue;
    }

    try {
      const payload = await loadBidView(viewKey);

      writeBidLogCache(
        viewKey,
        payload,
      );
    } catch {
      // Background prefetch is intentionally silent.
    }
  }
}


function SummaryCard({
  active,
  icon,
  label,
  value,
  note,
  onClick,
}) {
  return (
    <button
      type="button"
      className={
        `bid-log-summary-card${active ? ' active' : ''}`
      }
      onClick={onClick}
    >
      <span className="bid-log-summary-icon">
        <SummaryIcon name={icon} />
      </span>
      <span className="bid-log-summary-label">{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </button>
  );
}


function BidLogSortHeader({
  label,
  sortKey,
  sortState,
  onSort,
  firstDirection = 'asc',
  numeric = false,
}) {
  const active =
    sortState.key === sortKey;

  return (
    <th
      className={
        numeric
          ? 'numeric sortable-column'
          : 'sortable-column'
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
          () => onSort(
            sortKey,
            firstDirection,
          )
        }
      >
        <span>{label}</span>
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


function compareSortValues(
  aValue,
  bValue,
  type,
  direction,
) {
  const aMissing =
    aValue === null
    || aValue === undefined
    || (
      type === 'text'
      && String(aValue).trim() === ''
    )
    || (
      type === 'number'
      && !Number.isFinite(Number(aValue))
    )
    || (
      type === 'date'
      && !dateOnly(aValue)
    );

  const bMissing =
    bValue === null
    || bValue === undefined
    || (
      type === 'text'
      && String(bValue).trim() === ''
    )
    || (
      type === 'number'
      && !Number.isFinite(Number(bValue))
    )
    || (
      type === 'date'
      && !dateOnly(bValue)
    );

  if (aMissing && bMissing) {
    return 0;
  }

  if (aMissing) {
    return 1;
  }

  if (bMissing) {
    return -1;
  }

  let comparison = 0;

  if (type === 'number') {
    comparison =
      Number(aValue) - Number(bValue);
  } else if (type === 'date') {
    comparison =
      dateOnly(aValue).getTime()
      - dateOnly(bValue).getTime();
  } else {
    comparison =
      String(aValue)
        .localeCompare(
          String(bValue),
          undefined,
          { sensitivity: 'base' },
        );
  }

  return direction === 'desc'
    ? -comparison
    : comparison;
}


export default function BidLogWorkspace({
  user,
  pmDirectory = [],
}) {
  const [
    bidView,
    setBidView,
  ] = useState('active');

  const currentView = BID_VIEWS[bidView] || BID_VIEWS.active;
  const activeView = currentView.key === 'active';

  const [
    payload,
    setPayload,
  ] = useState(
    () => bidLogListCache.active.payload || {
      items: [],
    },
  );

  const loadSequenceRef = useRef(0);

  const [
    payloadViewKey,
    setPayloadViewKey,
  ] = useState('active');

  const [
    loading,
    setLoading,
  ] = useState(
    () => bidLogListCache.active.payload === null,
  );

  const [
    error,
    setError,
  ] = useState(null);

  const [
    search,
    setSearch,
  ] = useState('');

  const [
    pmFilter,
    setPmFilter,
  ] = useState(ALL);

  const [
    typeFilter,
    setTypeFilter,
  ] = useState(ALL);

  const [
    dueFilter,
    setDueFilter,
  ] = useState(ALL);

  const [
    minimumProbability,
    setMinimumProbability,
  ] = useState('');

  const [
    realBidsOnly,
    setRealBidsOnly,
  ] = useState(false);

  const [
    quickFilter,
    setQuickFilter,
  ] = useState(null);


  const [
    sortState,
    setSortState,
  ] = useState({
    key: 'due',
    direction: 'desc',
  });


  const [
    notesBidId,
    setNotesBidId,
  ] = useState(null);

  const [
    notesByBidId,
    setNotesByBidId,
  ] = useState({});

  const [
    notesLoadingId,
    setNotesLoadingId,
  ] = useState(null);

  const [
    notesErrorByBidId,
    setNotesErrorByBidId,
  ] = useState({});

  const [
    editSelection,
    setEditSelection,
  ] = useState(null);

  const [
    visibleRowCount,
    setVisibleRowCount,
  ] = useState(BID_LOG_INITIAL_RENDER_COUNT);

  const loadMoreSentinelRef = useRef(null);

  const [
    createBidOpen,
    setCreateBidOpen,
  ] = useState(false);

  const [
    actionToast,
    setActionToast,
  ] = useState(null);


  function showActionToast(
    type,
    message,
  ) {
    setActionToast({
      id: `${Date.now()}-${Math.random()}`,
      type,
      message,
    });
  }


  const role = String(
    user?.appRole || '',
  ).toUpperCase();

  const canSeeMargin =
    role === 'ADMIN'
    || role === 'OPERATIONS';

  const canEdit = canSeeMargin;


  const pmIdentityByName = useMemo(
    () => {
      const map = new Map();

      for (const row of pmDirectory) {
        const name = String(row?.pm || '').trim();
        const key = pmDirectoryKey(name);

        if (!key) {
          continue;
        }

        const current = map.get(key) || {};

        map.set(
          key,
          {
            name,
            initials: row?.pmInitials || current.initials || initialsFromName(name),
            hexColor: row?.pmHexColor || current.hexColor || null,
          },
        );
      }

      return map;
    },
    [pmDirectory],
  );


  useEffect(
    () => {
      const loadSequence = ++loadSequenceRef.current;
      const requestedViewKey = bidView;
      const requestedView = BID_VIEWS[requestedViewKey] || BID_VIEWS.active;
      const cacheEntry = bidLogListCache[requestedViewKey];
      const hasCachedPayload = cacheEntry?.payload !== null;

      setPayload(
        cacheEntry?.payload || { items: [] },
      );
      setPayloadViewKey(requestedViewKey);
      setLoading(!hasCachedPayload);
      setError(null);
      setQuickFilter(null);
      setRealBidsOnly(false);
      setNotesBidId(null);
      setEditSelection(null);

      if (bidLogCacheIsFresh(requestedViewKey)) {
        return undefined;
      }

      const controller = new AbortController();

      loadBidView(requestedViewKey, controller.signal)
        .then(nextPayload => {
          if (
            controller.signal.aborted
            || loadSequenceRef.current !== loadSequence
          ) {
            return;
          }

          writeBidLogCache(requestedViewKey, nextPayload);
          setPayload(nextPayload);
          setPayloadViewKey(requestedViewKey);
        })
        .catch(
          loadError => {
            if (
              loadError?.name !== 'AbortError'
              && loadSequenceRef.current === loadSequence
            ) {
              setError(
                loadError?.message
                || `Unable to load ${requestedView.title.toLowerCase()}.`,
              );
            }
          },
        )
        .finally(
          () => {
            if (
              !controller.signal.aborted
              && loadSequenceRef.current === loadSequence
            ) {
              setLoading(false);
            }
          },
        );

      return () => {
        controller.abort();
      };
    },
    [bidView],
  );


  const items = useMemo(
    () => {
      /*
        A lifecycle switch must never reuse rows owned by
        the previously selected lifecycle.

        This also protects the one render between clicking
        a lifecycle tab and its effect/cache synchronization.
      */
      if (payloadViewKey !== bidView) {
        return [];
      }

      const rows = Array.isArray(payload?.items)
        ? payload.items
        : [];

      if (activeView) {
        return rows.filter(
          row => {
            const id = Number(
              row?.sharePointItemId,
            );

            return (
              Number.isFinite(id)
              && id > 0
            );
          },
        );
      }

      const expectedStatus =
        normalizedSearch(
          currentView.status,
        );

      return rows.filter(
        row => {
          const id = Number(
            row?.originalBidLogId,
          );

          return (
            Number.isFinite(id)
            && id > 0
            && normalizedSearch(
              row?.status,
            ) === expectedStatus
          );
        },
      );
    },
    [
      activeView,
      bidView,
      currentView.status,
      payload,
      payloadViewKey,
    ],
  );


  const pmOptions = useMemo(
    () =>
      sortedUnique(
        items,
        row => row.pm,
      ),
    [items],
  );


  const createPmOptions = useMemo(
    () => {
      const values = new Set(pmOptions);

      for (const row of pmDirectory) {
        const name = String(row?.pm || '').trim();

        if (name) {
          values.add(name);
        }
      }

      return Array.from(values).sort(
        (a, b) => a.localeCompare(b),
      );
    },
    [pmOptions, pmDirectory],
  );


  const typeOptions = useMemo(
    () =>
      sortedUnique(
        items,
        row => row.projectType,
      ),
    [items],
  );


  const counts = useMemo(
    () => ({
      active: items.length,
      due30: items.filter(
        row => isDueWithin(row, 30),
      ).length,
      unassigned: items.filter(
        isUnassigned,
      ).length,
      snoozed: items.filter(
        row => row.snoozed === true,
      ).length,
      missingEstimate: items.filter(
        row =>
          row.estimatedPrice === null
          || row.estimatedPrice === undefined,
      ).length,
    }),
    [items],
  );


  const filteredItems = useMemo(
    () => {
      const probability =
        String(minimumProbability).trim() === ''
          ? null
          : Number(minimumProbability) / 100;

      return items
        .filter(
          row => {
            if (
              quickFilter === 'due30'
              && !isDueWithin(row, 30)
            ) {
              return false;
            }

            if (
              quickFilter === 'unassigned'
              && !isUnassigned(row)
            ) {
              return false;
            }

            if (
              quickFilter === 'snoozed'
              && row.snoozed !== true
            ) {
              return false;
            }

            if (
              quickFilter === 'missingEstimate'
              && row.estimatedPrice !== null
              && row.estimatedPrice !== undefined
            ) {
              return false;
            }

            if (!matchesSearch(row, search)) {
              return false;
            }

            if (
              pmFilter !== ALL
              && String(row.pm || '').trim()
                !== pmFilter
            ) {
              return false;
            }

            if (
              typeFilter !== ALL
              && String(row.projectType || '').trim()
                !== typeFilter
            ) {
              return false;
            }

            if (
              dueFilter === '7'
              && !isDueWithin(row, 7)
            ) {
              return false;
            }

            if (
              dueFilter === '30'
              && !isDueWithin(row, 30)
            ) {
              return false;
            }

            if (
              dueFilter === 'overdue'
              && !isOverdue(row)
            ) {
              return false;
            }

            if (
              realBidsOnly
              && row.realEstimate !== true
            ) {
              return false;
            }

            if (
              probability !== null
              && Number.isFinite(probability)
            ) {
              const rowProbability = probabilityRatio(
                row.probability,
              );

              if (
                rowProbability === null
                || rowProbability < probability
              ) {
                return false;
              }
            }

            return true;
          },
        )
        .sort(
          (a, b) => {
            let comparison = 0;

            switch (sortState.key) {
              case 'bid':
                comparison = compareSortValues(
                  a.bidName,
                  b.bidName,
                  'text',
                  sortState.direction,
                );
                break;

              case 'pm':
                comparison = compareSortValues(
                  a.pm,
                  b.pm,
                  'text',
                  sortState.direction,
                );
                break;

              case 'gc':
                comparison = compareSortValues(
                  generalContractorDisplayText(
                    a.generalContractors,
                    '',
                  ),
                  generalContractorDisplayText(
                    b.generalContractors,
                    '',
                  ),
                  'text',
                  sortState.direction,
                );
                break;

              case 'type':
                comparison = compareSortValues(
                  `${a.projectType || ''} ${a.purpose || ''}`.trim(),
                  `${b.projectType || ''} ${b.purpose || ''}`.trim(),
                  'text',
                  sortState.direction,
                );
                break;

              case 'status':
                comparison = compareSortValues(
                  a.status,
                  b.status,
                  'text',
                  sortState.direction,
                );
                break;

              case 'finalBid':
                comparison = compareSortValues(
                  a.estimatedPrice,
                  b.estimatedPrice,
                  'number',
                  sortState.direction,
                );
                break;

              case 'margin':
                comparison = compareSortValues(
                  a.margin,
                  b.margin,
                  'number',
                  sortState.direction,
                );
                break;

              case 'sf':
                comparison = compareSortValues(
                  a.squareFootage,
                  b.squareFootage,
                  'number',
                  sortState.direction,
                );
                break;

              case 'cy':
                comparison = compareSortValues(
                  a.cubicYards,
                  b.cubicYards,
                  'number',
                  sortState.direction,
                );
                break;

              case 'mh':
                comparison = compareSortValues(
                  a.manHours,
                  b.manHours,
                  'number',
                  sortState.direction,
                );
                break;

              case 'probability':
                comparison = compareSortValues(
                  probabilityRatio(a.probability),
                  probabilityRatio(b.probability),
                  'number',
                  sortState.direction,
                );
                break;

              case 'due':
              default:
                comparison = compareSortValues(
                  a.dueDate,
                  b.dueDate,
                  'date',
                  sortState.direction,
                );
            }

            if (comparison !== 0) {
              return comparison;
            }

            return String(a.bidName || '')
              .localeCompare(
                String(b.bidName || ''),
                undefined,
                { sensitivity: 'base' },
              );
          },
        );
    },
    [
      dueFilter,
      items,
      minimumProbability,
      pmFilter,
      quickFilter,
      realBidsOnly,
      search,
      sortState,
      typeFilter,
    ],
  );


  const visibleItems = useMemo(
    () =>
      filteredItems.slice(
        0,
        visibleRowCount,
      ),
    [
      filteredItems,
      visibleRowCount,
    ],
  );


  useEffect(
    () => {
      setVisibleRowCount(
        BID_LOG_INITIAL_RENDER_COUNT,
      );
    },
    [
      bidView,
      dueFilter,
      minimumProbability,
      pmFilter,
      quickFilter,
      realBidsOnly,
      search,
      sortState.direction,
      sortState.key,
      typeFilter,
    ],
  );


  useEffect(
    () => {
      if (
        visibleRowCount
        >= filteredItems.length
      ) {
        return undefined;
      }

      const node =
        loadMoreSentinelRef.current;

      if (!node) {
        return undefined;
      }

      if (
        typeof window.IntersectionObserver
        !== 'function'
      ) {
        setVisibleRowCount(
          filteredItems.length,
        );

        return undefined;
      }

      const observer =
        new window.IntersectionObserver(
          entries => {
            const visible =
              entries.some(
                entry =>
                  entry.isIntersecting,
              );

            if (!visible) {
              return;
            }

            setVisibleRowCount(
              current =>
                Math.min(
                  current
                    + BID_LOG_RENDER_STEP,
                  filteredItems.length,
                ),
            );
          },
          {
            rootMargin:
              '800px 0px',
          },
        );

      observer.observe(node);

      return () => {
        observer.disconnect();
      };
    },
    [
      filteredItems.length,
      visibleRowCount,
    ],
  );


  function toggleSort(
    key,
    firstDirection = 'asc',
  ) {
    setSortState(
      current => {
        if (current.key !== key) {
          return {
            key,
            direction: firstDirection,
          };
        }

        return {
          key,
          direction:
            current.direction === 'asc'
              ? 'desc'
              : 'asc',
        };
      },
    );
  }


  function toggleQuickFilter(nextFilter) {
    setQuickFilter(
      current =>
        current === nextFilter
          ? null
          : nextFilter,
    );
  }


  function clearFilters() {
    setSearch('');
    setPmFilter(ALL);
    setTypeFilter(ALL);
    setDueFilter(ALL);
    setMinimumProbability('');
    setRealBidsOnly(false);
    setQuickFilter(null);
  }


  async function refreshCurrentBidView() {
    if (loading) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextPayload = await loadBidView(
        bidView,
        undefined,
      );

      writeBidLogCache(
        bidView,
        nextPayload,
      );

      setPayload(
        nextPayload,
      );

      setNotesBidId(null);

      setNotesByBidId(
        current =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([key]) =>
                !key.startsWith(`${bidView}:`),
            ),
          ),
      );

      setNotesErrorByBidId(
        current =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([key]) =>
                !key.startsWith(`${bidView}:`),
            ),
          ),
      );

      showActionToast(
        'success',
        `${currentView.title} refreshed.`,
      );
    } catch (refreshError) {
      const message =
        refreshError?.message
        || `Unable to refresh ${currentView.title.toLowerCase()}.`;

      showActionToast(
        'error',
        message,
      );
    } finally {
      setLoading(false);
    }
  }


  function rowIdentity(row) {
    return activeView
      ? Number(row?.sharePointItemId)
      : Number(row?.originalBidLogId);
  }


  function noteCacheKey(row) {
    return `${bidView}:${rowIdentity(row)}`;
  }


  function openBidEditor(row) {
    const id = rowIdentity(row);

    if (
      Number.isFinite(id)
      && id > 0
    ) {
      setEditSelection({
        viewKey: bidView,
        id,
        bidName: String(
          row?.bidName || '',
        ).trim(),
      });
    }
  }


  function changeBidView(
    nextViewKey,
  ) {
    if (
      nextViewKey === bidView
      || !BID_VIEWS[nextViewKey]
    ) {
      return;
    }

    /*
      Active IDs are SharePoint item IDs.
      Historical IDs are OriginalBidLogIDs.

      Close transient lifecycle state BEFORE changing
      identity domains.
    */
    setEditSelection(null);
    setNotesBidId(null);

    /*
      Swap the visible payload synchronously with the tab.

      This prevents a Lost/Awarded/Unpursued payload from
      ever being painted beneath the Active lifecycle while
      React is waiting for the bidView effect to run.
    */
    const nextCache =
      bidLogListCache[nextViewKey];

    setPayload(
      nextCache?.payload
      || { items: [] },
    );

    setPayloadViewKey(
      nextViewKey,
    );

    setLoading(
      nextCache?.payload === null,
    );

    setError(null);

    setVisibleRowCount(
      BID_LOG_INITIAL_RENDER_COUNT,
    );

    setBidView(nextViewKey);
  }


  function handleBidSaved(updated) {
    const updatedIdentity = activeView
      ? Number(updated?.sharePointItemId)
      : Number(updated?.originalBidLogId);

    setPayload(
      current => {
        const next = {
          ...current,
          items: Array.isArray(current?.items)
            ? current.items.map(
                row =>
                  rowIdentity(row) === updatedIdentity
                    ? { ...row, ...updated }
                    : row,
              )
            : [],
        };

        writeBidLogCache(bidView, next);
        return next;
      },
    );

    setNotesByBidId(
      current => ({
        ...current,
        [`${bidView}:${updatedIdentity}`]: updated,
      }),
    );
  }


  function handleBidCreated(created) {
    const createdId = Number(created?.sharePointItemId);

    setPayload(
      current => {
        const currentItems = Array.isArray(current?.items)
          ? current.items
          : [];

        const nextItems = [
          created,
          ...currentItems.filter(
            row => Number(row?.sharePointItemId) !== createdId,
          ),
        ];

        const next = {
          ...current,
          items: nextItems,
          total: Number.isFinite(Number(current?.total))
            ? Number(current.total) + 1
            : nextItems.length,
        };

        writeBidLogCache('active', next);
        return next;
      },
    );

    setCreateBidOpen(false);

    if (Number.isFinite(createdId) && createdId > 0) {
      setEditSelection({
        viewKey: 'active',
        id: createdId,
        bidName: String(
          created?.bidName || '',
        ).trim(),
      });
    }

    showActionToast(
      'success',
      'Bid created.',
    );

  }


  async function toggleBidNotes(row) {
    const identity = rowIdentity(row);
    const cacheKey = noteCacheKey(row);

    if (notesBidId === cacheKey) {
      setNotesBidId(null);
      return;
    }

    setNotesBidId(cacheKey);

    if (notesByBidId[cacheKey]) {
      return;
    }

    setNotesLoadingId(cacheKey);
    setNotesErrorByBidId(
      current => ({
        ...current,
        [cacheKey]: null,
      }),
    );

    try {
      const detail = activeView
        ? await loadActiveBidDetail(identity)
        : await (async () => {
            const response = await window.fetch(
              `/api/bid-log/outcomes/${identity}?status=${encodeURIComponent(currentView.status)}`,
              { credentials: 'same-origin' },
            );

            if (!response.ok) {
              let message = 'Unable to load bid notes.';
              try {
                const body = await response.json();
                message = body?.detail || message;
              } catch {
                // Keep fallback.
              }
              throw new Error(message);
            }

            return response.json();
          })();

      setNotesByBidId(
        current => ({
          ...current,
          [cacheKey]: detail,
        }),
      );
    } catch (loadError) {
      setNotesErrorByBidId(
        current => ({
          ...current,
          [cacheKey]:
            loadError?.message
            || 'Unable to load bid notes.',
        }),
      );
    } finally {
      setNotesLoadingId(
        current =>
          current === cacheKey
            ? null
            : current,
      );
    }
  }


  const editorSelection =
    editSelection?.viewKey === bidView
      ? editSelection
      : null;


  return (
    <main className="page-shell bid-log-workspace">
      <div className="page-heading bid-log-workspace-heading">
        <div>
          <div className="eyebrow">
            BID LOG
          </div>

          <div className="bid-log-heading-title-row">
            <h1>
              {currentView.title}
            </h1>

            <div
              className="bid-log-workspace-count"
              aria-label={
                `Showing ${visibleItems.length} of ${filteredItems.length} matching bids`
              }
            >
              <span>SHOWING</span>
              <strong>{visibleItems.length}</strong>
              <small>
                {filteredItems.length === items.length
                  ? `of ${items.length}`
                  : `of ${filteredItems.length} matching · ${items.length} total`}
              </small>
            </div>
          </div>

          <p>
            {currentView.description}
          </p>
        </div>

        {canEdit && activeView && (
          <div className="bid-log-heading-actions">
            <button
              type="button"
              className="bid-log-new-bid-button bid-log-new-bid-button-header"
              onClick={() => setCreateBidOpen(true)}
            >
              <span className="bid-log-new-bid-plus" aria-hidden="true">+</span>
              <span>New Bid</span>
            </button>
          </div>
        )}
      </div>

      <nav
        className="bid-log-lifecycle-tabs"
        aria-label="Bid Log lifecycle"
      >
        {Object.values(BID_VIEWS).map(view => (
          <button
            key={view.key}
            type="button"
            className={
              `bid-log-lifecycle-tab${bidView === view.key ? ' active' : ''}`
            }
            aria-pressed={bidView === view.key}
            onClick={() => changeBidView(view.key)}
          >
            <span className="bid-log-lifecycle-dot" aria-hidden="true" />
            {view.label}
          </button>
        ))}
      </nav>


      {activeView && (
      <section
        className="bid-log-summary-grid"
        aria-label="Bid Log summary filters"
      >
        <SummaryCard
          active={quickFilter === 'active'}
          icon="active"
          label="Total Active Bids"
          value={counts.active}
          note="All current Bid Log items"
          onClick={() => toggleQuickFilter('active')}
        />

        <SummaryCard
          active={quickFilter === 'due30'}
          icon="due30"
          label="Due Within 30 Days"
          value={counts.due30}
          note="Upcoming bid deadlines"
          onClick={() => toggleQuickFilter('due30')}
        />

        <SummaryCard
          active={quickFilter === 'unassigned'}
          icon="unassigned"
          label="Unassigned Bids"
          value={counts.unassigned}
          note="No PM assigned"
          onClick={() => toggleQuickFilter('unassigned')}
        />

        <SummaryCard
          active={quickFilter === 'snoozed'}
          icon="snoozed"
          label="Snoozed Bids"
          value={counts.snoozed}
          note="Currently snoozed"
          onClick={() => toggleQuickFilter('snoozed')}
        />

        <SummaryCard
          active={quickFilter === 'missingEstimate'}
          icon="missingEstimate"
          label="Missing Estimate"
          value={counts.missingEstimate}
          note="No estimated price"
          onClick={() => toggleQuickFilter('missingEstimate')}
        />
      </section>
      )}


      <section className="filter-panel bid-log-workspace-filters">
        <div className="bid-log-filter-toolbar">
          {activeView ? (
            <button
              type="button"
              className={
                `bid-log-real-bids-toggle${realBidsOnly ? ' active' : ''}`
              }
              aria-pressed={realBidsOnly}
              onClick={() => setRealBidsOnly(current => !current)}
            >
              <span className="bid-log-real-bids-dot" aria-hidden="true" />
              Real Bids
            </button>
          ) : (
            <div className="bid-log-outcome-source-label">
              <span className="bid-log-real-bids-dot" aria-hidden="true" />
              {currentView.label} history
            </div>
          )}

          <div className="bid-log-filter-actions">
            <button
              type="button"
              className="secondary-button bid-log-refresh-button"
              onClick={() => {
                void refreshCurrentBidView();
              }}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={clearFilters}
            >
              Clear Filters
            </button>
          </div>
        </div>

        <div className="bid-log-filter-grid">
          <label className="filter-field bid-log-search-field">
            <span>Search Bid or GC</span>
            <input
              type="search"
              value={search}
              placeholder="Bid, GC, city, PM…"
              onChange={event => setSearch(event.target.value)}
            />
          </label>

          <label className="filter-field">
            <span>Due Date</span>
            <select
              value={dueFilter}
              onChange={event => setDueFilter(event.target.value)}
            >
              <option value={ALL}>All Due Dates</option>
              <option value="7">Due Within 7 Days</option>
              <option value="30">Due Within 30 Days</option>
              <option value="overdue">Overdue</option>
            </select>
          </label>

          <label className="filter-field">
            <span>PM</span>
            <select
              value={pmFilter}
              onChange={event => setPmFilter(event.target.value)}
            >
              <option value={ALL}>All PMs</option>
              {pmOptions.map(
                option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="filter-field">
            <span>Project Type</span>
            <select
              value={typeFilter}
              onChange={event => setTypeFilter(event.target.value)}
            >
              <option value={ALL}>All Project Types</option>
              {typeOptions.map(
                option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="filter-field bid-log-probability-field">
            <span>Minimum Probability</span>
            <div className="bid-log-percent-input">
              <input
                type="number"
                min="0"
                max="100"
                inputMode="decimal"
                value={minimumProbability}
                placeholder="Any"
                onChange={event => setMinimumProbability(event.target.value)}
              />
              <span>%</span>
            </div>
          </label>
        </div>

      </section>


      {error && (
        <div className="page-alert">
          <strong>Unable to load Bid Log.</strong>
          <span>{error}</span>
        </div>
      )}


      <section className="content-card bid-log-list-card">
        <div className="content-card-heading bid-log-list-heading">
          <div>
            <div className="section-kicker">
              {currentView.kicker}
            </div>
            <h2>Bid List</h2>
          </div>

          <div className="bid-log-read-only-note">
            {loading
              ? 'Loading…'
              : visibleItems.length < filteredItems.length
                ? `${visibleItems.length} of ${filteredItems.length} displayed`
                : `${filteredItems.length} bids`}
          </div>
        </div>

        <div className="bid-log-table-wrap">
          <table key={bidView} className="bid-log-table">
            <thead>
              <tr>
                <BidLogSortHeader
                  label="Due"
                  sortKey="due"
                  sortState={sortState}
                  onSort={toggleSort}
                  firstDirection="desc"
                />
                <BidLogSortHeader
                  label="Bid"
                  sortKey="bid"
                  sortState={sortState}
                  onSort={toggleSort}
                />
                <BidLogSortHeader
                  label="PM"
                  sortKey="pm"
                  sortState={sortState}
                  onSort={toggleSort}
                />
                <BidLogSortHeader
                  label="General Contractor"
                  sortKey="gc"
                  sortState={sortState}
                  onSort={toggleSort}
                />
                <BidLogSortHeader
                  label="Type"
                  sortKey="type"
                  sortState={sortState}
                  onSort={toggleSort}
                />
                <BidLogSortHeader
                  label="Status"
                  sortKey="status"
                  sortState={sortState}
                  onSort={toggleSort}
                />
                <BidLogSortHeader
                  label="Final Bid"
                  sortKey="finalBid"
                  sortState={sortState}
                  onSort={toggleSort}
                  firstDirection="desc"
                  numeric
                />
                {canSeeMargin && (
                  <BidLogSortHeader
                    label="Margin"
                    sortKey="margin"
                    sortState={sortState}
                    onSort={toggleSort}
                    firstDirection="desc"
                    numeric
                  />
                )}
                {activeView && (
                  <>
                    <BidLogSortHeader
                      label="SF"
                      sortKey="sf"
                      sortState={sortState}
                      onSort={toggleSort}
                      firstDirection="desc"
                      numeric
                    />
                    <BidLogSortHeader
                      label="CY"
                      sortKey="cy"
                      sortState={sortState}
                      onSort={toggleSort}
                      firstDirection="desc"
                      numeric
                    />
                    <BidLogSortHeader
                      label="MH"
                      sortKey="mh"
                      sortState={sortState}
                      onSort={toggleSort}
                      firstDirection="desc"
                      numeric
                    />
                  </>
                )}
                <BidLogSortHeader
                  label="Probability"
                  sortKey="probability"
                  sortState={sortState}
                  onSort={toggleSort}
                  firstDirection="desc"
                  numeric
                />
              </tr>
            </thead>

            <tbody>
              {visibleItems.map(
                row => {
                  const state = dueState(row);
                  const identity = rowIdentity(row);
                  const cacheKey = noteCacheKey(row);
                  const notesOpen =
                    notesBidId === cacheKey;
                  const detail =
                    notesByBidId[cacheKey];
                  const notesError =
                    notesErrorByBidId[cacheKey];
                  const noteText = String(
                    detail?.notes || '',
                  ).trim();

                  return (
                    <Fragment key={`${bidView}:${identity}`}>
                    <tr
                      className="bid-log-data-row"
                      tabIndex={0}
                      role="button"
                      aria-label={`Edit ${displayValue(row.bidName)}`}
                      onClick={() => openBidEditor(row)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openBidEditor(row);
                        }
                      }}
                    >
                      <td className="bid-log-due-cell">
                        <strong>{dateLabel(row.dueDate)}</strong>
                        {state && (
                          <span className={`bid-log-due-state ${state.tone}`}>
                            {state.label}
                          </span>
                        )}
                      </td>

                      <td className="bid-log-name-cell">
                        <div className="bid-log-name-line">
                          <strong>{displayValue(row.bidName)}</strong>
                          <button
                            type="button"
                            className={
                              `bid-log-notes-button${notesOpen ? ' active' : ''}`
                            }
                            title="View bid notes"
                            aria-label={`View notes for ${displayValue(row.bidName)}`}
                            aria-expanded={notesOpen}
                            onClick={event => {
                              event.stopPropagation();
                              toggleBidNotes(row);
                            }}
                          >
                            <NotesIcon />
                          </button>
                        </div>
                        <span>
                          {[
                            row.city,
                            row.state,
                          ]
                            .filter(Boolean)
                            .join(', ')
                            || (
                              activeView
                                ? `Item ${row.sharePointItemId}`
                                : `Bid ${row.originalBidLogId}`
                            )}
                        </span>
                      </td>

                      <td className="pm-badge-cell">
                        {(() => {
                          const pmName = displayValue(
                            row.pm,
                            'No PM Assigned',
                          );
                          const identity = pmIdentityByName.get(
                            pmDirectoryKey(row.pm),
                          );

                          return (
                            <PMInitialsBadge
                              name={pmName}
                              initials={identity?.initials}
                              hexColor={identity?.hexColor}
                            />
                          );
                        })()}
                      </td>

                      <td className="gc-table-cell">
                        <GeneralContractorDisplay
                          value={row.generalContractors}
                          compact
                        />
                      </td>

                      <td>
                        <div className="bid-log-type-stack">
                          <strong>{displayValue(row.projectType)}</strong>
                          <span>{displayValue(row.purpose)}</span>
                        </div>
                      </td>

                      <td>
                        <span className="bid-log-status-pill">
                          {displayValue(row.status)}
                        </span>
                      </td>

                      <td className="numeric strong-cell">
                        {money(row.estimatedPrice)}
                      </td>

                      {canSeeMargin && (
                        <td className="numeric">
                          {money(row.margin)}
                        </td>
                      )}

                      {activeView && (
                        <>
                          <td className="numeric">
                            {wholeNumber(row.squareFootage)}
                          </td>

                          <td className="numeric">
                            {wholeNumber(row.cubicYards)}
                          </td>

                          <td className="numeric">
                            {wholeNumber(row.manHours)}
                          </td>
                        </>
                      )}

                      <td className="numeric">
                        {probabilityLabel(row.probability)}
                      </td>
                    </tr>

                    {notesOpen && (
                      <tr className="bid-log-notes-row">
                        <td colSpan={canSeeMargin ? (activeView ? 12 : 9) : (activeView ? 11 : 8)}>
                          <div className="bid-log-notes-panel">
                            <div className="bid-log-notes-heading">
                              <div>
                                <span>Bid Notes</span>
                                <strong>{displayValue(row.bidName)}</strong>
                              </div>

                              <button
                                type="button"
                                className="bid-log-notes-close"
                                onClick={() => setNotesBidId(null)}
                              >
                                Close
                              </button>
                            </div>

                            {notesLoadingId === cacheKey ? (
                              <div className="bid-log-notes-message">
                                Loading notes…
                              </div>
                            ) : notesError ? (
                              <div className="bid-log-notes-message error">
                                {notesError}
                              </div>
                            ) : noteText ? (
                              <div className="bid-log-notes-content">
                                {noteText}
                              </div>
                            ) : (
                              <div className="bid-log-notes-message">
                                No notes on this bid.
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                },
              )}

              {!filteredItems.length && (
                <tr>
                  <td
                    className="empty-cell"
                    colSpan={canSeeMargin ? (activeView ? 12 : 9) : (activeView ? 11 : 8)}
                  >
                    {loading
                      ? `Loading ${currentView.title.toLowerCase()}…`
                      : `No ${currentView.label.toLowerCase()} bids match the current filters.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {visibleItems.length < filteredItems.length && (
            <div
              ref={loadMoreSentinelRef}
              className="bid-log-render-sentinel"
              aria-hidden="true"
            />
          )}
        </div>
      </section>

      <ActionToast
        key={actionToast?.id || 'bid-log-toast'}
        message={actionToast?.message}
        type={actionToast?.type}
        onDismiss={() => setActionToast(null)}
      />

      <BidLogCreateDrawer
        open={createBidOpen}
        user={user}
        pmOptions={createPmOptions}
        onClose={() => setCreateBidOpen(false)}
        onCreated={handleBidCreated}
      />

      {activeView && editorSelection && (
        <BidLogEditDrawer
          key={`active:${editorSelection.id}`}
          sharePointItemId={editorSelection.id}
          initialBidName={
            editorSelection.bidName || ''
          }
          user={user}
          pmOptions={pmOptions}
          onClose={() => setEditSelection(null)}
          onSaved={handleBidSaved}
        />
      )}

      {!activeView && editorSelection && (
        <BidLogOutcomeEditDrawer
          key={`${bidView}:${editorSelection.id}`}
          originalBidLogId={editorSelection.id}
          outcomeStatus={currentView.status}
          initialBidName={
            editorSelection.bidName || ''
          }
          user={user}
          pmOptions={pmOptions}
          onClose={() => setEditSelection(null)}
          onSaved={handleBidSaved}
        />
      )}
    </main>
  );
}
