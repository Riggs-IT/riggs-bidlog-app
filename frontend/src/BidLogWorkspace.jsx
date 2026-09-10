import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  GeneralContractorDisplay,
} from './GeneralContractors.jsx';


const ALL = '__ALL__';


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


function probabilityLabel(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return `${Math.round(number * 100)}%`;
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


async function loadActiveBids(signal) {
  const response = await window.fetch(
    '/api/bid-log/active?limit=500&offset=0',
    {
      credentials: 'same-origin',
      signal,
    },
  );

  if (!response.ok) {
    let detail = 'Unable to load active bids.';

    try {
      const payload = await response.json();
      detail = payload?.detail || detail;
    } catch {
      // Keep the user-facing fallback.
    }

    throw new Error(detail);
  }

  const payload = await response.json();

  if (!Array.isArray(payload?.items)) {
    throw new Error('Active Bid Log returned an invalid response.');
  }

  return payload;
}


function SummaryCard({
  active,
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
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </button>
  );
}


export default function BidLogWorkspace({
  user,
}) {
  const [
    payload,
    setPayload,
  ] = useState({
    items: [],
  });

  const [
    loading,
    setLoading,
  ] = useState(true);

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
  ] = useState('active');


  const role = String(
    user?.appRole || '',
  ).toUpperCase();

  const canSeeMargin =
    role === 'ADMIN'
    || role === 'OPERATIONS';


  useEffect(
    () => {
      const controller =
        new AbortController();

      setLoading(true);
      setError(null);

      loadActiveBids(controller.signal)
        .then(setPayload)
        .catch(
          loadError => {
            if (
              loadError?.name
              !== 'AbortError'
            ) {
              setError(
                loadError?.message
                || 'Unable to load active bids.',
              );
            }
          },
        )
        .finally(
          () => {
            if (!controller.signal.aborted) {
              setLoading(false);
            }
          },
        );

      return () => {
        controller.abort();
      };
    },
    [],
  );


  const items = useMemo(
    () =>
      Array.isArray(payload?.items)
        ? payload.items
        : [],
    [payload],
  );


  const pmOptions = useMemo(
    () =>
      sortedUnique(
        items,
        row => row.pm,
      ),
    [items],
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
              && (
                row.probability === null
                || row.probability === undefined
                || Number(row.probability)
                  < probability
              )
            ) {
              return false;
            }

            return true;
          },
        )
        .sort(
          (a, b) => {
            const aDate = dateOnly(a.dueDate);
            const bDate = dateOnly(b.dueDate);

            if (aDate && bDate) {
              const difference =
                aDate.getTime()
                - bDate.getTime();

              if (difference !== 0) {
                return difference;
              }
            } else if (aDate) {
              return -1;
            } else if (bDate) {
              return 1;
            }

            return String(a.bidName || '')
              .localeCompare(
                String(b.bidName || ''),
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
      typeFilter,
    ],
  );


  function clearFilters() {
    setSearch('');
    setPmFilter(ALL);
    setTypeFilter(ALL);
    setDueFilter(ALL);
    setMinimumProbability('');
    setRealBidsOnly(false);
    setQuickFilter('active');
  }


  return (
    <main className="page-shell bid-log-workspace">
      <div className="page-heading bid-log-workspace-heading">
        <div>
          <div className="eyebrow">
            BID LOG
          </div>

          <h1>
            Active Bids
          </h1>

          <p>
            Review current Bid Log opportunities, due dates,
            estimating values, and assignment information.
          </p>
        </div>

        <div className="bid-log-workspace-count">
          <span>SHOWING</span>
          <strong>{filteredItems.length}</strong>
          <small>of {items.length} active bids</small>
        </div>
      </div>


      <section
        className="bid-log-summary-grid"
        aria-label="Bid Log summary filters"
      >
        <SummaryCard
          active={quickFilter === 'active'}
          label="Total Active Bids"
          value={counts.active}
          note="All current Bid Log items"
          onClick={() => setQuickFilter('active')}
        />

        <SummaryCard
          active={quickFilter === 'due30'}
          label="Due Within 30 Days"
          value={counts.due30}
          note="Upcoming bid deadlines"
          onClick={() => setQuickFilter('due30')}
        />

        <SummaryCard
          active={quickFilter === 'unassigned'}
          label="Unassigned Bids"
          value={counts.unassigned}
          note="No PM assigned"
          onClick={() => setQuickFilter('unassigned')}
        />

        <SummaryCard
          active={quickFilter === 'snoozed'}
          label="Snoozed Bids"
          value={counts.snoozed}
          note="Currently snoozed"
          onClick={() => setQuickFilter('snoozed')}
        />

        <SummaryCard
          active={quickFilter === 'missingEstimate'}
          label="Missing Estimate"
          value={counts.missingEstimate}
          note="No estimated price"
          onClick={() => setQuickFilter('missingEstimate')}
        />
      </section>


      <section className="filter-panel bid-log-workspace-filters">
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

        <div className="bid-log-filter-footer">
          <label className="bid-log-checkbox">
            <input
              type="checkbox"
              checked={realBidsOnly}
              onChange={event => setRealBidsOnly(event.target.checked)}
            />
            <span>Real estimates only</span>
          </label>

          <button
            type="button"
            className="secondary-button"
            onClick={clearFilters}
          >
            Clear Filters
          </button>
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
              ACTIVE BID LOG
            </div>
            <h2>Current Opportunities</h2>
          </div>

          <div className="bid-log-read-only-note">
            {loading
              ? 'Loading…'
              : `${filteredItems.length} bids`}
          </div>
        </div>

        <div className="bid-log-table-wrap">
          <table className="bid-log-table">
            <thead>
              <tr>
                <th>Due</th>
                <th>Bid</th>
                <th>PM</th>
                <th>General Contractor</th>
                <th>Type</th>
                <th>Status</th>
                <th className="numeric">Final Bid</th>
                {canSeeMargin && (
                  <th className="numeric">Margin</th>
                )}
                <th className="numeric">SF</th>
                <th className="numeric">CY</th>
                <th className="numeric">MH</th>
                <th className="numeric">Probability</th>
              </tr>
            </thead>

            <tbody>
              {filteredItems.map(
                row => {
                  const state = dueState(row);

                  return (
                    <tr key={row.sharePointItemId}>
                      <td className="bid-log-due-cell">
                        <strong>{dateLabel(row.dueDate)}</strong>
                        {state && (
                          <span className={`bid-log-due-state ${state.tone}`}>
                            {state.label}
                          </span>
                        )}
                      </td>

                      <td className="bid-log-name-cell">
                        <strong>{displayValue(row.bidName)}</strong>
                        <span>
                          {[
                            row.city,
                            row.state,
                          ]
                            .filter(Boolean)
                            .join(', ')
                            || `Item ${row.sharePointItemId}`}
                        </span>
                      </td>

                      <td>{displayValue(row.pm)}</td>

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

                      <td className="numeric">
                        {wholeNumber(row.squareFootage)}
                      </td>

                      <td className="numeric">
                        {wholeNumber(row.cubicYards)}
                      </td>

                      <td className="numeric">
                        {wholeNumber(row.manHours)}
                      </td>

                      <td className="numeric">
                        {probabilityLabel(row.probability)}
                      </td>
                    </tr>
                  );
                },
              )}

              {!filteredItems.length && (
                <tr>
                  <td
                    className="empty-cell"
                    colSpan={canSeeMargin ? 12 : 11}
                  >
                    {loading
                      ? 'Loading active bids…'
                      : 'No active bids match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
