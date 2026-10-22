import {useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState} from 'react';
import ProjectBillingPivot from './ProjectBillingPivot.jsx';
import {
  completedHistoryView,
  completedMonthLabel,
  completedMonthRange,
  defaultCompletedMonths,
  normalizeCompletedMonthly,
} from './completedMonthlyView.js';

const currency = value => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(value);
const moneyOrDash = value => value == null ? '—' : currency(value);

async function fetchCompletedHistory(months, signal) {
  const search = new URLSearchParams({
    startMonth: `${months[0]}-01`,
    endMonth: `${months[months.length - 1]}-01`,
  });
  const response = await fetch(`/api/completed-projects/monthly?${search}`, {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', signal,
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Completed monthly history requires an authorized session.');
    }
    throw new Error('Unable to load completed monthly history. Retry or return to Directory.');
  }
  return normalizeCompletedMonthly(await response.json(), months);
}

export default function CompletedMonthlyHistory({
  view, onViewChange, projects, canViewMargin, pmIdentityByName,
  onSelectProject, refreshApiRef,
}) {
  const [initialRange] = useState(defaultCompletedMonths);
  const [fromMonth, setFromMonth] = useState(initialRange.from);
  const [throughMonth, setThroughMonth] = useState(initialRange.through);
  const [focusedMonth, setFocusedMonth] = useState(null);
  const [history, setHistory] = useState({key: null, byId: null, loading: false, error: null});
  const cache = useRef(new Map());
  const inFlight = useRef(null);

  const months = useMemo(
    () => completedMonthRange(fromMonth, throughMonth), [fromMonth, throughMonth],
  );
  const rangeKey = `${fromMonth}|${throughMonth}`;
  const historicalView = view !== 'directory';

  // Prefetch once when Completed Billings mounts, even in Directory. Both
  // By Month and By Project reuse this exact normalized 24-month response.
  // Only an explicit top-banner refresh or date-range change fetches again.
  const loadRange = useCallback((force = false) => {
    if (!months.length) return Promise.resolve(null);
    const cached = cache.current.get(rangeKey);
    if (!force && cached) {
      setHistory({key: rangeKey, byId: cached, loading: false, error: null});
      return Promise.resolve(cached);
    }
    if (!force && inFlight.current?.key === rangeKey
      && !inFlight.current.controller.signal.aborted) {
      return inFlight.current.promise;
    }

    inFlight.current?.controller.abort();
    const controller = new AbortController();
    const flight = {key: rangeKey, controller, promise: null};
    const isCurrent = () => !controller.signal.aborted && inFlight.current === flight;
    setHistory(previous => ({
      key: rangeKey,
      byId: cached ?? (previous.key === rangeKey ? previous.byId : null),
      loading: true, error: null,
    }));

    flight.promise = fetchCompletedHistory(months, controller.signal)
      .then(byId => {
        if (!isCurrent()) return null;
        cache.current.delete(rangeKey);
        cache.current.set(rangeKey, byId);
        // Bound per-mounted-user historical cache; never persist margin in
        // localStorage or share it across authenticated role changes.
        if (cache.current.size > 4) {
          cache.current.delete(cache.current.keys().next().value);
        }
        setHistory({key: rangeKey, byId, loading: false, error: null});
        return byId;
      })
      .catch(error => {
        if (isCurrent()) {
          setHistory(previous => ({
            key: rangeKey,
            byId: previous.key === rangeKey ? previous.byId : null,
            loading: false,
            error: error.message || 'Unable to refresh historical billing.',
          }));
        }
        if (error?.name !== 'AbortError') throw error;
        return null;
      })
      .finally(() => {
        if (inFlight.current === flight) inFlight.current = null;
      });
    inFlight.current = flight;
    return flight.promise;
  }, [months, rangeKey]);

  useEffect(() => {
    void loadRange().catch(() => {}); // Error is rendered in historical views.
    return () => { inFlight.current?.controller.abort(); };
  }, [loadRange]);

  useImperativeHandle(refreshApiRef, () => ({
    refresh: () => loadRange(true),
  }), [loadRange]);

  const byId = history.key === rangeKey ? history.byId : null;
  const prepared = useMemo(() => byId ? completedHistoryView(
    projects, byId, months, {canViewMargin, pmIdentityByName},
  ) : null, [projects, byId, months, canViewMargin, pmIdentityByName]);

  const activeFocus = focusedMonth && months.includes(focusedMonth) ? focusedMonth : null;
  const pivotMonths = activeFocus ? [activeFocus] : months;
  const pivotProjects = useMemo(() => {
    if (!prepared || !activeFocus) return prepared?.currentProjects || [];
    return prepared.currentProjects.filter(project =>
      prepared.currentMonthly.get(project.jobListId)?.some(row => row.monthStart === `${activeFocus}-01`));
  }, [prepared, activeFocus]);

  function changeView(next) {
    if (next === 'project') setFocusedMonth(null);
    onViewChange(next);
  }

  return (
    <div className="completed-monthly-history">
      <div className="monthly-heading-actions">
        <div className="comparison-view-toggle" role="group" aria-label="Completed billing view">
          {[
            ['directory', 'Directory'],
            ['month', 'By Month'],
            ['project', 'By Project'],
          ].map(([key, label]) => (
            <button type="button" key={key} className={view === key ? 'active' : undefined}
              aria-pressed={view === key} onClick={() => changeView(key)}>{label}</button>
          ))}
        </div>
      </div>

      {historicalView && (
        <div className="completed-history-content">
          <div className="project-pivot-toolbar" data-sticky-table-controls>
            <label className="filter-field">
              <span>From Month</span>
              <input type="month" value={fromMonth} onChange={event => {
                setFromMonth(event.target.value); setFocusedMonth(null);
              }} />
            </label>
            <label className="filter-field">
              <span>Through Month</span>
              <input type="month" value={throughMonth} onChange={event => {
                setThroughMonth(event.target.value); setFocusedMonth(null);
              }} />
            </label>
            <span className="section-note">Foundation actuals · read-only · Refresh from the page header</span>
          </div>

          {!months.length && (
            <div className="page-alert" role="alert">Select consecutive months, through the same or a later month, up to 36 months.</div>
          )}
          {months.length > 0 && history.key === rangeKey && history.loading && (
            <div className="loading-panel">Loading historical billing months…</div>
          )}
          {months.length > 0 && history.key === rangeKey && history.error && (
            <div className="page-alert" role="alert">{history.error}</div>
          )}

          {prepared && (
            <>
              <p className="section-note">
                {projects.length.toLocaleString('en-US')} completed projects match filters ·
                {' '}{prepared.projectsWithoutRows.toLocaleString('en-US')} have no authoritative monthly rows in this range.
                A dash means unavailable history, not $0. Contracts above are lifetime amounts.
              </p>

              {view === 'month' && (
                <div className="monthly-table-wrap monthly-summary-wrap">
                  <table className="monthly-table projected-monthly-table">
                    <thead><tr>
                      <th scope="col">Month</th>
                      <th scope="col" className="numeric">Billed Projects</th>
                      <th scope="col" className="numeric">Projects with History</th>
                      <th scope="col" className="numeric">Actual Billings</th>
                      {canViewMargin && <th scope="col" className="numeric">Margin Collected</th>}
                      <th scope="col">Explore</th>
                    </tr></thead>
                    <tbody>
                      {[...prepared.monthlySummary].reverse().map(row => (
                        <tr key={row.month}>
                          <td><strong>{completedMonthLabel(row.month)}</strong></td>
                          <td className="numeric">{row.billedProjects}</td>
                          <td className="numeric">{row.projectsWithRecords}</td>
                          <td className="numeric">{moneyOrDash(row.actual)}</td>
                          {canViewMargin && <td className="numeric">{moneyOrDash(row.marginCollected)}</td>}
                          <td><button type="button" className="text-button" onClick={() => {
                            setFocusedMonth(row.month); onViewChange('project');
                          }}>View Projects</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {view === 'project' && (
                <>
                  {activeFocus && <button type="button" className="text-button"
                    onClick={() => setFocusedMonth(null)}>
                    {completedMonthLabel(activeFocus)} · Show full selected range
                  </button>}
                  <ProjectBillingPivot
                    key="completed-history-pivot" completedHistoryMode
                    months={pivotMonths}
                    currentProjects={pivotProjects}
                    currentMonthly={prepared.currentMonthly}
                    bidProjects={[]}
                    bidMonthly={new Map()}
                    currency={currency}
                    monthLabel={completedMonthLabel}
                    onSelectCurrentProject={onSelectProject}
                    onSelectBidProject={() => {}}
                    canViewMargin={canViewMargin}
                    includeActiveProjects
                    includeBids={false}
                  />
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
