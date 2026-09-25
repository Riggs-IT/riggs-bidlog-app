import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  GeneralContractorDisplay,
  generalContractorDisplayText,
} from './GeneralContractors.jsx';
import {
  MoneyValue,
  ProjectTeamCell,
} from './BillingDisplay.jsx';
import ActiveProjectEditDrawer from './ActiveProjectEditDrawer.jsx';


const ALL = '__ALL__';
const UNASSIGNED = '__UNASSIGNED__';
const DIRECTORY_CACHE_MAX_AGE_MS = 60_000;

let activeProjectsCache = {
  items: null,
  loadedAt: 0,
};

let completedProjectsCache = {
  items: null,
  loadedAt: 0,
};


function cacheIsFresh(cache) {
  return Array.isArray(cache?.items)
    && Date.now() - cache.loadedAt < DIRECTORY_CACHE_MAX_AGE_MS;
}


function writeDirectoryCache(cacheName, items) {
  const next = {
    items,
    loadedAt: Date.now(),
  };

  if (cacheName === 'completed') {
    completedProjectsCache = next;
  } else {
    activeProjectsCache = next;
  }
}


export function invalidateProjectsWorkspaceCache() {
  activeProjectsCache = {
    ...activeProjectsCache,
    loadedAt: 0,
  };

  completedProjectsCache = {
    ...completedProjectsCache,
    loadedAt: 0,
  };
}


function SummaryIcon({ name }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  if (name === 'pm') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="9" cy="8" r="3" />
        <path {...common} d="M3.5 19c.7-3.2 2.5-5 5.5-5 1.6 0 2.9.5 3.9 1.4M17 14v6M14 17h6" />
      </svg>
    );
  }

  if (name === 'super') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 20h16M6 20V9l6-5 6 5v11M9 20v-6h6v6" />
      </svg>
    );
  }

  if (name === 'duration') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="12" cy="12" r="8" />
        <path {...common} d="M12 8v4l3 2M9 3h6" />
      </svg>
    );
  }

  if (name === 'start') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect {...common} x="4" y="5" width="16" height="15" rx="2" />
        <path {...common} d="M8 3v4M16 3v4M4 10h16M8 14h3M13 14h3M8 17h3" />
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


function quantityLabel(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return '—';
  }

  return Math.round(number).toLocaleString('en-US');
}


function sortedUnique(items, selector) {
  return [
    ...new Set(
      items
        .map(selector)
        .map(value => String(value || '').trim())
        .filter(Boolean),
    ),
  ].sort(
    (a, b) => a.localeCompare(
      b,
      undefined,
      {
        sensitivity: 'base',
        numeric: true,
      },
    ),
  );
}



function matchesSearch(project, search) {
  const raw = String(search || '').trim();
  const term = raw.toLowerCase();

  if (!term) {
    return true;
  }

  const jobTokens = raw
    .split(/[\s,;]+/)
    .map(token => token.trim())
    .filter(Boolean);

  if (
    jobTokens.length >= 2
    && jobTokens.every(token => /^\d+$/.test(token))
  ) {
    return jobTokens.includes(
      String(project.jobNumber || '').trim()
    );
  }

  return [
    project.jobNumber,
    project.jobName,
    generalContractorDisplayText(project.generalContractors),
    project.pm,
    project.apm,
    project.pe,
    project.superintendent,
    project.streetAddress,
    project.cityStateZip,
    project.projectType,
    project.purpose,
  ]
    .filter(Boolean)
    .some(
      value => String(value)
        .toLowerCase()
        .includes(term),
    );
}


function isUnassigned(value) {
  return !String(value || '').trim();
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
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase();
}


function PMBadge({ project }) {
  const initials = String(
    project.pmInitials
    || initialsFromName(project.pm),
  ).trim();

  if (!initials) {
    return <span className="pm-badge-empty">—</span>;
  }

  const background = /^#[0-9a-f]{6}$/i.test(
    String(project.pmHexColor || '').trim(),
  )
    ? String(project.pmHexColor).trim()
    : '#4b5563';

  return (
    <div className="active-project-pm-cell">
      <span
        className="pm-initials-badge"
        title={project.pm || 'Project Manager'}
        style={{
          backgroundColor: background,
          color: pmBadgeTextColor(background),
        }}
      >
        {initials}
      </span>
    </div>
  );
}


function compareValues(aValue, bValue, type, direction) {
  const aMissing =
    aValue === null
    || aValue === undefined
    || String(aValue).trim() === '';
  const bMissing =
    bValue === null
    || bValue === undefined
    || String(bValue).trim() === '';

  if (aMissing && bMissing) {
    return 0;
  }

  if (aMissing) {
    return 1;
  }

  if (bMissing) {
    return -1;
  }

  let result = 0;

  if (type === 'number') {
    result = Number(aValue) - Number(bValue);
  } else if (type === 'date') {
    result = dateOnly(aValue).getTime()
      - dateOnly(bValue).getTime();
  } else {
    result = String(aValue).localeCompare(
      String(bValue),
      undefined,
      {
        sensitivity: 'base',
        numeric: true,
      },
    );
  }

  return direction === 'desc'
    ? -result
    : result;
}


function SortHeader({
  label,
  sortKey,
  type = 'text',
  sortState,
  onSort,
  className = '',
}) {
  const active = sortState.key === sortKey;

  return (
    <th
      className={className || undefined}
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
        onClick={() => onSort(sortKey, type)}
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


async function fetchProjectList(path, signal, label) {
  const response = await window.fetch(
    path,
    {
      credentials: 'same-origin',
      signal,
    },
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      payload?.detail
      || `Unable to load ${label}.`,
    );
  }

  if (!Array.isArray(payload)) {
    throw new Error(
      `${label} returned an invalid response.`,
    );
  }

  return payload;
}


function fetchActiveProjects(signal) {
  return fetchProjectList(
    '/api/active-projects',
    signal,
    'active projects',
  );
}


function fetchCompletedProjects(signal) {
  return fetchProjectList(
    '/api/projects/completed-directory',
    signal,
    'completed projects',
  );
}


export async function prefetchProjectsWorkspace({
  includeActive = true,
  includeCompleted = true,
} = {}) {
  if (
    includeActive
    && !cacheIsFresh(activeProjectsCache)
  ) {
    try {
      const payload =
        await fetchActiveProjects();

      writeDirectoryCache(
        'active',
        payload,
      );
    } catch {
      // Background prefetch is intentionally silent.
    }
  }

  if (
    includeCompleted
    && !cacheIsFresh(completedProjectsCache)
  ) {
    try {
      const payload =
        await fetchCompletedProjects();

      writeDirectoryCache(
        'completed',
        payload,
      );
    } catch {
      // Background prefetch is intentionally silent.
    }
  }
}


export default function ActiveProjectsWorkspace({
  user,
}) {
  const [activeItems, setActiveItems] = useState(
    () => activeProjectsCache.items || [],
  );
  const [completedItems, setCompletedItems] = useState(
    () => completedProjectsCache.items || [],
  );
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(
    () => !Array.isArray(activeProjectsCache.items),
  );
  const [completedLoading, setCompletedLoading] = useState(false);
  const [error, setError] = useState(null);
  const [completedError, setCompletedError] = useState(null);
  const [search, setSearch] = useState('');
  const [pmFilter, setPmFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [purposeFilter, setPurposeFilter] = useState(ALL);
  const [peFilter, setPeFilter] = useState(ALL);
  const [superFilter, setSuperFilter] = useState(ALL);
  const [quickFilter, setQuickFilter] = useState(null);
  const [editProjectId, setEditProjectId] = useState(null);
  const [sortState, setSortState] = useState({
    key: 'job',
    direction: 'desc',
    type: 'text',
  });

  const loadProjects = useCallback(
    async ({ quiet = false } = {}) => {
      const controller = new AbortController();

      if (!quiet) {
        setLoading(true);
      }

      setError(null);

      try {
        const payload = await fetchActiveProjects(
          controller.signal,
        );
        writeDirectoryCache('active', payload);
        setActiveItems(payload);
      } catch (loadError) {
        if (loadError?.name !== 'AbortError') {
          setError(
            loadError?.message
            || 'Unable to load active projects.',
          );
        }
      } finally {
        if (!quiet) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const loadCompletedProjects = useCallback(
    async ({ quiet = false } = {}) => {
      const controller = new AbortController();

      if (!quiet) {
        setCompletedLoading(true);
      }

      setCompletedError(null);

      try {
        const payload = await fetchCompletedProjects(
          controller.signal,
        );
        writeDirectoryCache('completed', payload);
        setCompletedItems(payload);
      } catch (loadError) {
        if (loadError?.name !== 'AbortError') {
          setCompletedError(
            loadError?.message
            || 'Unable to load completed projects.',
          );
        }
      } finally {
        if (!quiet) {
          setCompletedLoading(false);
        }
      }
    },
    [],
  );

  useEffect(
    () => {
      if (cacheIsFresh(activeProjectsCache)) {
        return undefined;
      }

      void loadProjects({
        quiet: Array.isArray(activeProjectsCache.items),
      });

      return undefined;
    },
    [loadProjects],
  );

  useEffect(
    () => {
      if (!showCompleted) {
        return undefined;
      }

      if (cacheIsFresh(completedProjectsCache)) {
        return undefined;
      }

      void loadCompletedProjects({
        quiet: Array.isArray(completedProjectsCache.items),
      });

      return undefined;
    },
    [loadCompletedProjects, showCompleted],
  );

  const items = useMemo(
    () => showCompleted
      ? [...activeItems, ...completedItems]
      : activeItems,
    [activeItems, completedItems, showCompleted],
  );

  const pmOptions = useMemo(
    () => sortedUnique(items, row => row.pm),
    [items],
  );

  const typeOptions = useMemo(
    () => sortedUnique(items, row => row.projectType),
    [items],
  );

  const purposeOptions = useMemo(
    () => sortedUnique(items, row => row.purpose),
    [items],
  );

  const peOptions = useMemo(
    () => sortedUnique(items, row => row.pe),
    [items],
  );

  const superOptions = useMemo(
    () => sortedUnique(items, row => row.superintendent),
    [items],
  );

  const counts = useMemo(
    () => ({
      active: activeItems.length,
      completed: completedItems.length,
      noPm: activeItems.filter(row => isUnassigned(row.pm)).length,
      noSuper: activeItems.filter(row => isUnassigned(row.superintendent)).length,
      noDuration: activeItems.filter(
        row => !Number.isFinite(Number(row.estimatedDurationMonths))
          || Number(row.estimatedDurationMonths) <= 0,
      ).length,
      noStart: activeItems.filter(
        row => !dateOnly(row.effectiveStartDate),
      ).length,
    }),
    [activeItems, completedItems],
  );

  const filteredItems = useMemo(
    () => items
      .filter(project => {
        if (project.projectCompleted && quickFilter) {
          return false;
        }

        if (
          quickFilter === 'noPm'
          && !isUnassigned(project.pm)
        ) {
          return false;
        }

        if (
          quickFilter === 'noSuper'
          && !isUnassigned(project.superintendent)
        ) {
          return false;
        }

        if (
          quickFilter === 'noDuration'
          && Number.isFinite(Number(project.estimatedDurationMonths))
          && Number(project.estimatedDurationMonths) > 0
        ) {
          return false;
        }

        if (
          quickFilter === 'noStart'
          && dateOnly(project.effectiveStartDate)
        ) {
          return false;
        }

        if (!matchesSearch(project, search)) {
          return false;
        }

        if (
          pmFilter !== ALL
          && (
            pmFilter === UNASSIGNED
              ? !isUnassigned(project.pm)
              : String(project.pm || '').trim() !== pmFilter
          )
        ) {
          return false;
        }

        if (
          typeFilter !== ALL
          && String(project.projectType || '').trim() !== typeFilter
        ) {
          return false;
        }

        if (
          purposeFilter !== ALL
          && String(project.purpose || '').trim() !== purposeFilter
        ) {
          return false;
        }

        if (
          peFilter !== ALL
          && (
            peFilter === UNASSIGNED
              ? !isUnassigned(project.pe)
              : String(project.pe || '').trim() !== peFilter
          )
        ) {
          return false;
        }

        if (
          superFilter !== ALL
          && (
            superFilter === UNASSIGNED
              ? !isUnassigned(project.superintendent)
              : String(project.superintendent || '').trim() !== superFilter
          )
        ) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        let aValue;
        let bValue;

        switch (sortState.key) {
          case 'project':
            aValue = a.jobName;
            bValue = b.jobName;
            break;
          case 'gc':
            aValue = generalContractorDisplayText(a.generalContractors);
            bValue = generalContractorDisplayText(b.generalContractors);
            break;
          case 'pm':
            aValue = a.pm;
            bValue = b.pm;
            break;
          case 'team':
            aValue = [a.pe, a.superintendent, a.apm]
              .filter(Boolean)
              .join(' ');
            bValue = [b.pe, b.superintendent, b.apm]
              .filter(Boolean)
              .join(' ');
            break;
          case 'type':
            aValue = a.projectType;
            bValue = b.projectType;
            break;
          case 'purpose':
            aValue = a.purpose;
            bValue = b.purpose;
            break;
          case 'start':
            aValue = a.effectiveStartDate;
            bValue = b.effectiveStartDate;
            break;
          case 'complete':
            aValue = a.projectedCompletionDate;
            bValue = b.projectedCompletionDate;
            break;
          case 'contract':
            aValue = a.originalContractAmount;
            bValue = b.originalContractAmount;
            break;
          case 'squareFootage':
            aValue = a.squareFootage;
            bValue = b.squareFootage;
            break;
          case 'cubicYards':
            aValue = a.cubicYards;
            bValue = b.cubicYards;
            break;
          case 'job':
          default:
            aValue = a.jobNumber;
            bValue = b.jobNumber;
            break;
        }

        const comparison = compareValues(
          aValue,
          bValue,
          sortState.type,
          sortState.direction,
        );

        if (comparison !== 0) {
          return comparison;
        }

        return compareValues(
          a.jobNumber,
          b.jobNumber,
          'text',
          'desc',
        );
      }),
    [
      items,
      peFilter,
      pmFilter,
      purposeFilter,
      quickFilter,
      search,
      sortState,
      superFilter,
      typeFilter,
    ],
  );

  function toggleQuickFilter(value) {
    setQuickFilter(
      current => current === value
        ? null
        : value,
    );
  }

  function changeSort(key, type) {
    setSortState(current => {
      if (current.key === key) {
        return {
          key,
          type,
          direction:
            current.direction === 'asc'
              ? 'desc'
              : 'asc',
        };
      }

      return {
        key,
        type,
        direction:
          key === 'job'
          || key === 'contract'
          || type === 'date'
            ? 'desc'
            : 'asc',
      };
    });
  }

  function clearFilters() {
    setSearch('');
    setPmFilter(ALL);
    setTypeFilter(ALL);
    setPurposeFilter(ALL);
    setPeFilter(ALL);
    setSuperFilter(ALL);
    setQuickFilter(null);
  }

  const selectedProject =
    items.find(
      project => project.jobListId === editProjectId,
    ) || null;

  const role = String(
    user?.appRole || '',
  ).toUpperCase();
  const canEdit =
    role === 'ADMIN'
    || role === 'OPERATIONS';

  return (
    <main className="page-shell active-projects-workspace">
      <div className="page-heading bid-log-workspace-heading">
        <div>
          <div className="eyebrow">
            PROJECT DIRECTORY
          </div>
          <h1>Projects</h1>
          <p>
            Review active project ownership and core job details, with completed projects available on demand. Select any project to open its editor.
          </p>
        </div>

        <div className="bid-log-workspace-count">
          <span>SHOWING</span>
          <strong>{filteredItems.length}</strong>
          <small>of {items.length} projects in view</small>
        </div>
      </div>

      <section className="bid-log-summary-grid active-project-summary-grid">
        <button
          type="button"
          className={
            quickFilter === null
              ? 'bid-log-summary-card active'
              : 'bid-log-summary-card'
          }
          onClick={() => setQuickFilter(null)}
        >
          <span className="bid-log-summary-icon">
            <SummaryIcon name="active" />
          </span>
          <span className="bid-log-summary-label">Active Projects</span>
          <strong>{counts.active}</strong>
          <small>Current non-completed projects</small>
        </button>

        <button
          type="button"
          className={
            quickFilter === 'noPm'
              ? 'bid-log-summary-card active'
              : 'bid-log-summary-card'
          }
          onClick={() => toggleQuickFilter('noPm')}
        >
          <span className="bid-log-summary-icon">
            <SummaryIcon name="pm" />
          </span>
          <span className="bid-log-summary-label">No PM</span>
          <strong>{counts.noPm}</strong>
          <small>Project manager unassigned</small>
        </button>

        <button
          type="button"
          className={
            quickFilter === 'noSuper'
              ? 'bid-log-summary-card active'
              : 'bid-log-summary-card'
          }
          onClick={() => toggleQuickFilter('noSuper')}
        >
          <span className="bid-log-summary-icon">
            <SummaryIcon name="super" />
          </span>
          <span className="bid-log-summary-label">No Superintendent</span>
          <strong>{counts.noSuper}</strong>
          <small>Current staffing missing</small>
        </button>

        <button
          type="button"
          className={
            quickFilter === 'noDuration'
              ? 'bid-log-summary-card active'
              : 'bid-log-summary-card'
          }
          onClick={() => toggleQuickFilter('noDuration')}
        >
          <span className="bid-log-summary-icon">
            <SummaryIcon name="duration" />
          </span>
          <span className="bid-log-summary-label">Missing Duration</span>
          <strong>{counts.noDuration}</strong>
          <small>Needed for projected completion</small>
        </button>

        <button
          type="button"
          className={
            quickFilter === 'noStart'
              ? 'bid-log-summary-card active'
              : 'bid-log-summary-card'
          }
          onClick={() => toggleQuickFilter('noStart')}
        >
          <span className="bid-log-summary-icon">
            <SummaryIcon name="start" />
          </span>
          <span className="bid-log-summary-label">Missing Start</span>
          <strong>{counts.noStart}</strong>
          <small>No effective project start</small>
        </button>
      </section>

      <section className="panel bid-log-workspace-filters">
        <div className="bid-log-filter-toolbar active-project-filter-toolbar">
          <button
            type="button"
            className={`project-directory-completed-toggle${
              showCompleted ? ' active' : ''
            }`}
            aria-pressed={showCompleted}
            onClick={() => setShowCompleted(current => !current)}
          >
            <span className="project-directory-completed-dot" aria-hidden="true" />
            Completed
          </button>

          <div className="active-project-filter-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void loadProjects({ quiet: false });
                if (showCompleted) {
                  void loadCompletedProjects({ quiet: false });
                }
              }}
              disabled={loading || completedLoading}
            >
              Refresh
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

        <div className="bid-log-filter-grid active-project-filter-grid">
          <label className="filter-field">
            <span>Search Project / GC / Team</span>
            <input
              type="search"
              value={search}
              placeholder="Job #s, project, GC, team, location…"
              onChange={event => setSearch(event.target.value)}
            />
          </label>

          <label className="filter-field">
            <span>PM</span>
            <select
              value={pmFilter}
              onChange={event => setPmFilter(event.target.value)}
            >
              <option value={ALL}>All PMs</option>
              <option value={UNASSIGNED}>Unassigned</option>
              {pmOptions.map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Project Type</span>
            <select
              value={typeFilter}
              onChange={event => setTypeFilter(event.target.value)}
            >
              <option value={ALL}>All Types</option>
              {typeOptions.map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Purpose</span>
            <select
              value={purposeFilter}
              onChange={event => setPurposeFilter(event.target.value)}
            >
              <option value={ALL}>All Purposes</option>
              {purposeOptions.map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>PE</span>
            <select
              value={peFilter}
              onChange={event => setPeFilter(event.target.value)}
            >
              <option value={ALL}>All PEs</option>
              <option value={UNASSIGNED}>Unassigned</option>
              {peOptions.map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Superintendent</span>
            <select
              value={superFilter}
              onChange={event => setSuperFilter(event.target.value)}
            >
              <option value={ALL}>All Superintendents</option>
              <option value={UNASSIGNED}>Unassigned</option>
              {superOptions.map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="active-project-filter-note bid-log-read-only-note">
          {canEdit
            ? 'Click any row to edit project information.'
            : 'Click any row to view project information.'}
        </div>
      </section>

      {error && (
        <div className="bid-edit-message error active-project-list-error">
          <span>{error}</span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => loadProjects({ quiet: false })}
          >
            Retry
          </button>
        </div>
      )}

      {completedError && showCompleted && (
        <div className="bid-edit-message error active-project-list-error">
          <span>{completedError}</span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => loadCompletedProjects({ quiet: false })}
          >
            Retry Completed
          </button>
        </div>
      )}

      <section className="panel bid-log-list-card active-project-list-card">
        <div className="bid-log-list-heading">
          <div>
            <span className="section-kicker">PROJECT LIST</span>
            <h2>Project Directory</h2>
          </div>
          <span className="bid-log-read-only-note">
            {loading
              ? 'Loading…'
              : `${filteredItems.length} shown`}
          </span>
        </div>

        <div className="bid-log-table-wrap active-project-table-wrap">
          <table className="bid-log-table active-project-table">
            <thead>
              <tr>
                <SortHeader
                  label="Job #"
                  sortKey="job"
                  sortState={sortState}
                  onSort={changeSort}
                />
                <SortHeader
                  label="Project"
                  sortKey="project"
                  sortState={sortState}
                  onSort={changeSort}
                />
                <SortHeader
                  label="GC"
                  sortKey="gc"
                  sortState={sortState}
                  onSort={changeSort}
                />
                <SortHeader
                  label="PM"
                  sortKey="pm"
                  sortState={sortState}
                  onSort={changeSort}
                />
                <SortHeader
                  label="Team"
                  sortKey="team"
                  sortState={sortState}
                  onSort={changeSort}
                />
                <SortHeader
                  label="Type"
                  sortKey="type"
                  sortState={sortState}
                  onSort={changeSort}
                />
                <SortHeader
                  label="Purpose"
                  sortKey="purpose"
                  sortState={sortState}
                  onSort={changeSort}
                />
                <SortHeader
                  label="Start"
                  sortKey="start"
                  type="date"
                  sortState={sortState}
                  onSort={changeSort}
                />
                <SortHeader
                  label="Est. Complete"
                  sortKey="complete"
                  type="date"
                  sortState={sortState}
                  onSort={changeSort}
                />
                <SortHeader
                  label="Contract"
                  sortKey="contract"
                  type="number"
                  sortState={sortState}
                  onSort={changeSort}
                  className="numeric"
                />
                <SortHeader
                  label="SF"
                  sortKey="squareFootage"
                  type="number"
                  sortState={sortState}
                  onSort={changeSort}
                  className="numeric"
                />
                <SortHeader
                  label="CY"
                  sortKey="cubicYards"
                  type="number"
                  sortState={sortState}
                  onSort={changeSort}
                  className="numeric"
                />
              </tr>
            </thead>

            <tbody>
              {!loading && filteredItems.map(project => (
                <tr
                  key={project.jobListId}
                  className="bid-log-data-row active-project-data-row"
                  tabIndex="0"
                  onClick={() => setEditProjectId(project.jobListId)}
                  onKeyDown={event => {
                    if (
                      event.key === 'Enter'
                      || event.key === ' '
                    ) {
                      event.preventDefault();
                      setEditProjectId(project.jobListId);
                    }
                  }}
                >
                  <td className="active-project-job-cell">
                    <strong>{displayValue(project.jobNumber)}</strong>
                  </td>

                  <td className="active-project-name-cell">
                    <div className="active-project-name-line">
                      <strong>{displayValue(project.jobName)}</strong>
                      {project.projectCompleted && (
                        <span className="project-status-pill completed">
                          Completed
                        </span>
                      )}
                    </div>
                    <span>
                      {[project.streetAddress, project.cityStateZip]
                        .filter(Boolean)
                        .join(' · ') || (
                          project.projectCompleted
                            ? `Completed ${dateLabel(project.dateCompleted)}`
                            : 'Location TBD'
                        )}
                    </span>
                  </td>

                  <td className="active-project-gc-cell">
                    <GeneralContractorDisplay
                      value={project.generalContractors}
                    />
                  </td>

                  <td>
                    <PMBadge project={project} />
                  </td>

                  <td className="active-project-team-cell">
                    <ProjectTeamCell
                      pe={project.pe}
                      superintendent={project.superintendent}
                      apm={project.apm}
                    />
                  </td>

                  <td>{displayValue(project.projectType)}</td>
                  <td>{displayValue(project.purpose)}</td>

                  <td className="active-project-date-cell">
                    {dateLabel(project.effectiveStartDate)}
                  </td>

                  <td className="active-project-date-cell">
                    {dateLabel(project.projectedCompletionDate)}
                  </td>

                  <td className="numeric active-project-contract-cell">
                    <MoneyValue value={project.originalContractAmount} />
                  </td>

                  <td className="numeric active-project-quantity-cell">
                    {quantityLabel(project.squareFootage)}
                  </td>

                  <td className="numeric active-project-quantity-cell">
                    {quantityLabel(project.cubicYards)}
                  </td>
                </tr>
              ))}

              {!loading && !filteredItems.length && (
                <tr>
                  <td colSpan="12" className="empty-cell">
                    No projects match the current filters.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan="12" className="empty-cell">
                    Loading projects…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ActiveProjectEditDrawer
        jobListId={editProjectId}
        projectSummary={selectedProject}
        user={user}
        onClose={() => setEditProjectId(null)}
        onSaved={() => {
          void loadProjects({ quiet: true });
          if (showCompleted) {
            void loadCompletedProjects({ quiet: true });
          }
        }}
      />
    </main>
  );
}
