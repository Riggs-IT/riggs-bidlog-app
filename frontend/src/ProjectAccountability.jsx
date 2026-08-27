import {
  useEffect,
  useMemo,
  useState,
} from 'react';


const ALL = '__ALL__';
const UNASSIGNED = '__UNASSIGNED__';


function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}


function currency(value) {
  if (
    value === null
    || value === undefined
    || value === ''
  ) {
    return '—';
  }

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


function dateLabel(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(
    `${String(value).slice(0, 10)}T12:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    return String(value);
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


function daysLabel(value) {
  if (
    value === null
    || value === undefined
  ) {
    return '—';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return `${number.toLocaleString('en-US')} days`;
}


function pmKey(value) {
  const text = String(value || '').trim();

  return text || UNASSIGNED;
}


function pmLabel(value) {
  return value === UNASSIGNED
    ? 'No PM Assigned'
    : value;
}


function containsText(value, search) {
  return String(value || '')
    .toLowerCase()
    .includes(search);
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

  let detail = 'data_api_unavailable';

  try {
    const payload = await response.json();
    detail = payload?.detail || detail;
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
    || 'Unable to load project accountability.',
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
    emphasis ? 'emphasis' : '',
    tone ? `tone-${tone}` : '',
  ].filter(Boolean).join(' ');

  return (
    <article className={classes}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}


function StatusPill({
  children,
  tone = 'neutral',
}) {
  return (
    <span
      className={`accountability-pill ${tone}`}
    >
      {children}
    </span>
  );
}


function closeTone(row) {
  if (row.accountingCloseCritical) {
    return 'critical';
  }

  if (row.accountingCloseFollowUp) {
    return 'warning';
  }

  if (
    row.foundationCloseState
    === 'OPEN_NO_BILLING_HISTORY'
  ) {
    return 'review';
  }

  if (row.foundationIsClosed) {
    return 'success';
  }

  return 'neutral';
}


function closeLabel(row) {
  const labels = {
    OPS_ACTIVE: 'Ops Active',
    OPS_MISSING_COMPLETION_DATE:
      'Missing Ops Completion',
    FOUNDATION_CLOSED: 'Foundation Closed',
    OPEN_NO_BILLING_HISTORY:
      'Open · No Billing History',
    OPEN_180_PLUS_DAYS_INACTIVE:
      'Open · 180+ Days Inactive',
    OPEN_91_180_DAYS_INACTIVE:
      'Open · 91–180 Days Inactive',
    OPEN_61_90_DAYS_INACTIVE:
      'Open · 61–90 Days Inactive',
    OPEN_31_60_DAYS_INACTIVE:
      'Open · 31–60 Days Inactive',
    OPEN_BILLING_RECENT:
      'Open · Billing Recent',
  };

  return (
    labels[row.foundationCloseState]
    || row.foundationCloseState
    || 'Unknown'
  );
}


function billingLabel(value) {
  const labels = {
    OPS_ACTIVE: 'Ops Active',
    OPS_MISSING_COMPLETION_DATE:
      'Missing Ops Completion',
    NO_BILLING_HISTORY:
      'No Billing History',
    BILLING_CONTINUED_180_PLUS_DAYS:
      'Billing +180 Days',
    BILLING_CONTINUED_91_180_DAYS:
      'Billing +91–180 Days',
    BILLING_CONTINUED_61_90_DAYS:
      'Billing +61–90 Days',
    BILLING_CONTINUED_31_60_DAYS:
      'Billing +31–60 Days',
    BILLING_ENDED_WITHIN_30_DAYS:
      'Billing Within 30 Days',
    BILLING_ENDED_BEFORE_OPS_COMPLETION:
      'Billing Ended Before Ops Complete',
  };

  return labels[value] || value || '—';
}


function severity(row) {
  if (row.accountingCloseCritical) {
    return 1000 + toNumber(row.daysSinceLastBilling);
  }

  if (row.accountingCloseFollowUp) {
    return 800 + toNumber(row.daysSinceLastBilling);
  }

  if (
    row.projectCompleted
    && row.operationsCompletionDate
    && !row.foundationIsClosed
    && !row.lastBillingActivityDate
  ) {
    return 700 + toNumber(row.daysSinceOperationsCompletion);
  }

  if (row.opsStartAfterCompletion) {
    return 650;
  }

  if (row.opsMissingCompletionDate) {
    return 600;
  }

  if (row.opsMissingStart) {
    return 500;
  }

  if (row.opsMissingDuration) {
    return 400;
  }

  if (!row.foundationIsClosed) {
    return 300;
  }

  return 0;
}


function rowHasOpsIssue(row) {
  return Boolean(
    row.opsMissingStart
    || row.opsMissingDuration
    || row.opsMissingCompletionDate
    || row.opsStartAfterCompletion
  );
}


function rowNeedsCloseReview(row) {
  return Boolean(
    row.projectCompleted
    && row.operationsCompletionDate
    && !row.foundationIsClosed
  );
}


function rowNeedsAttention(row) {
  return Boolean(
    rowHasOpsIssue(row)
    || rowNeedsCloseReview(row)
  );
}


export default function ProjectAccountability({
  user,
}) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [viewMode, setViewMode] = useState('close');
  const [search, setSearch] = useState('');
  const [pmFilter, setPmFilter] = useState(ALL);
  const [purposeFilter, setPurposeFilter] = useState(ALL);


  useEffect(() => {
    let cancelled = false;

    async function loadAccountability() {
      setLoading(true);
      setError(null);

      try {
        const payload = await fetchJson(
          '/api/project-accountability',
        );

        if (
          !cancelled
          && Array.isArray(payload)
        ) {
          setRows(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError.message
            || 'Unable to load project accountability.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAccountability();

    return () => {
      cancelled = true;
    };
  }, []);


  const completed = useMemo(
    () => rows.filter(
      row => row.projectCompleted,
    ),
    [rows],
  );

  const pmOptions = useMemo(
    () => [
      ...new Set(
        rows.map(
          row => pmKey(row.riggsPM),
        ),
      ),
    ].sort(
      (a, b) => pmLabel(a)
        .localeCompare(pmLabel(b)),
    ),
    [rows],
  );

  const purposeOptions = useMemo(
    () => [
      ...new Set(
        rows
          .map(row => String(row.purpose || '').trim())
          .filter(Boolean),
      ),
    ].sort(),
    [rows],
  );

  const metrics = useMemo(() => {
    const opsCompleteFoundationOpen =
      completed.filter(
        row => (
          row.operationsCompletionDate
          && !row.foundationIsClosed
        ),
      );

    const foundationClosed = rows.filter(
      row => row.foundationIsClosed,
    );

    const likelyBatchClosed =
      foundationClosed.filter(
        row => row.likelyBatchClose,
      );

    return {
      completed: completed.length,
      missingCompletion:
        completed.filter(
          row => row.opsMissingCompletionDate,
        ).length,
      missingStart:
        completed.filter(
          row => row.opsMissingStart,
        ).length,
      missingDuration:
        completed.filter(
          row => row.opsMissingDuration,
        ).length,
      invalidStart:
        completed.filter(
          row => row.opsStartAfterCompletion,
        ).length,
      openAfterOps:
        opsCompleteFoundationOpen.length,
      closeFollowUp:
        opsCompleteFoundationOpen.filter(
          row => row.accountingCloseFollowUp,
        ).length,
      closeCritical:
        opsCompleteFoundationOpen.filter(
          row => row.accountingCloseCritical,
        ).length,
      openNoBilling:
        opsCompleteFoundationOpen.filter(
          row => !row.lastBillingActivityDate,
        ).length,
      foundationClosed:
        foundationClosed.length,
      likelyBatchClosed:
        likelyBatchClosed.length,
      batchPercent:
        foundationClosed.length
          ? (
            likelyBatchClosed.length
            / foundationClosed.length
            * 100
          )
          : 0,
    };
  }, [rows, completed]);


  const filteredRows = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return rows
      .filter(row => {
        if (
          viewMode === 'attention'
          && !rowNeedsAttention(row)
        ) {
          return false;
        }

        if (
          viewMode === 'ops'
          && !rowHasOpsIssue(row)
        ) {
          return false;
        }

        if (
          viewMode === 'close'
          && !rowNeedsCloseReview(row)
        ) {
          return false;
        }

        if (
          viewMode === 'critical'
          && !row.accountingCloseCritical
        ) {
          return false;
        }

        if (
          viewMode === 'completed'
          && !row.projectCompleted
        ) {
          return false;
        }

        if (
          pmFilter !== ALL
          && pmKey(row.riggsPM) !== pmFilter
        ) {
          return false;
        }

        if (
          purposeFilter !== ALL
          && String(row.purpose || '').trim()
            !== purposeFilter
        ) {
          return false;
        }

        if (
          normalizedSearch
          && ![
            row.jobNumber,
            row.jobName,
            row.riggsPM,
            row.purpose,
            row.foundationCloseState,
            row.billingFollowUpState,
          ].some(
            value => containsText(
              value,
              normalizedSearch,
            ),
          )
        ) {
          return false;
        }

        return true;
      })
      .sort(
        (a, b) => (
          severity(b) - severity(a)
          || toNumber(b.daysSinceOperationsCompletion)
            - toNumber(a.daysSinceOperationsCompletion)
          || String(a.jobNumber || '')
            .localeCompare(String(b.jobNumber || ''))
        ),
      );
  }, [
    rows,
    viewMode,
    pmFilter,
    purposeFilter,
    search,
  ]);


  return (
    <main className="page-shell accountability-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            PROJECT LIFECYCLE
          </div>

          <h1>
            Project Accountability
          </h1>

          <p>
            Separate Operations data quality, billing tail,
            and Foundation close backlog so each process
            can be reviewed on its own clock.
          </p>
        </div>

        <div className="heading-actions">
          <span className="role-chip">
            {user.appRole}
          </span>
        </div>
      </div>

      <section className="accountability-explainer">
        <div>
          <span>1</span>
          <strong>Operations Complete</strong>
          <small>Cognito DateCompleted</small>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span>2</span>
          <strong>Last Billing Activity</strong>
          <small>Foundation posted non-zero billing</small>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span>3</span>
          <strong>Foundation Closed</strong>
          <small>Job status C / completion date</small>
        </div>
      </section>

      {error && (
        <div
          className="page-alert"
          role="alert"
        >
          <strong>
            Project accountability could not be loaded.
          </strong>
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="loading-panel">
          <div>
            <strong>
              Loading project lifecycle data…
            </strong>
          </div>
        </div>
      )}

      <div className="accountability-section-title">
        <div>
          <div className="section-kicker">
            OPERATIONS
          </div>
          <h2>Data Health</h2>
        </div>

        <span className="section-note">
          Independent flags · one project may have multiple issues
        </span>
      </div>

      <section className="stats-grid accountability-stats">
        <StatCard
          label="Completed Projects"
          value={metrics.completed.toLocaleString('en-US')}
          detail="Projects marked complete in Cognito"
        />
        <StatCard
          label="Missing Completion Date"
          value={metrics.missingCompletion.toLocaleString('en-US')}
          detail="Completed flag set, DateCompleted blank"
          tone="warning"
        />
        <StatCard
          label="Missing Start"
          value={metrics.missingStart.toLocaleString('en-US')}
          detail="No anticipated / usable start date"
          tone="warning"
        />
        <StatCard
          label="Missing Duration"
          value={metrics.missingDuration.toLocaleString('en-US')}
          detail="Estimated Duration not populated yet"
          tone="review"
        />
        <StatCard
          label="Invalid Dates"
          value={metrics.invalidStart.toLocaleString('en-US')}
          detail="Start occurs after completion"
          tone="critical"
        />
      </section>

      <div className="accountability-section-title">
        <div>
          <div className="section-kicker">
            ACCOUNTING / ADMIN
          </div>
          <h2>Foundation Close Backlog</h2>
        </div>

        <span className="section-note">
          Ops complete + Foundation still open
        </span>
      </div>

      <section className="stats-grid accountability-stats close-stats">
        <StatCard
          label="Foundation Still Open"
          value={metrics.openAfterOps.toLocaleString('en-US')}
          detail="Operations complete with an open Foundation job"
          emphasis
        />
        <StatCard
          label="90+ Days Billing Inactive"
          value={metrics.closeFollowUp.toLocaleString('en-US')}
          detail="Strong close-process follow-up"
          tone="warning"
        />
        <StatCard
          label="180+ Days Billing Inactive"
          value={metrics.closeCritical.toLocaleString('en-US')}
          detail="Critical administrative close backlog"
          tone="critical"
        />
        <StatCard
          label="Open · No Billing History"
          value={metrics.openNoBilling.toLocaleString('en-US')}
          detail="Review source coverage before assigning cause"
          tone="review"
        />
        <StatCard
          label="Historical Batch Close"
          value={`${metrics.batchPercent.toFixed(1)}%`}
          detail={`${metrics.likelyBatchClosed.toLocaleString('en-US')} of ${metrics.foundationClosed.toLocaleString('en-US')} closed jobs share 5+ job close dates`}
          tone="review"
        />
      </section>

      <section className="content-card accountability-card">
        <div className="section-heading accountability-heading">
          <div>
            <div className="section-kicker">
              REVIEW QUEUE
            </div>
            <h2>
              Projects Needing Attention
            </h2>
          </div>

          <span className="section-note">
            {filteredRows.length.toLocaleString('en-US')} rows
          </span>
        </div>

        <div className="accountability-controls">
          <div className="mode-tabs accountability-tabs">
            {[
              ['attention', 'Needs Attention'],
              ['ops', 'Operations Data'],
              ['close', 'Foundation Open'],
              ['critical', '180+ Day Critical'],
              ['completed', 'All Completed'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  viewMode === value
                    ? 'active'
                    : ''
                }
                onClick={() => setViewMode(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="filter-grid accountability-filter-grid">
            <label className="filter-field">
              <span>Search</span>
              <input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Job number, project, PM…"
              />
            </label>

            <label className="filter-field">
              <span>PM</span>
              <select
                value={pmFilter}
                onChange={event => setPmFilter(event.target.value)}
              >
                <option value={ALL}>All PMs</option>
                {pmOptions.map(value => (
                  <option
                    key={value}
                    value={value}
                  >
                    {pmLabel(value)}
                  </option>
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
                  <option
                    key={value}
                    value={value}
                  >
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="detail-table-wrap">
          <table className="detail-table accountability-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Project</th>
                <th>PM</th>
                <th>Ops Complete</th>
                <th>Last Billing</th>
                <th>Billing Inactive</th>
                <th>Foundation</th>
                <th>Billing Tail</th>
                <th>Ops Data</th>
                <th className="numeric">Billed</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.map(row => (
                <tr key={row.jobListId}>
                  <td>
                    {row.accountingCloseCritical ? (
                      <StatusPill tone="critical">
                        Critical
                      </StatusPill>
                    ) : row.accountingCloseFollowUp ? (
                      <StatusPill tone="warning">
                        Follow Up
                      </StatusPill>
                    ) : rowNeedsCloseReview(row) ? (
                      <StatusPill tone="review">
                        Review
                      </StatusPill>
                    ) : rowHasOpsIssue(row) ? (
                      <StatusPill tone="review">
                        Ops Data
                      </StatusPill>
                    ) : (
                      <StatusPill tone="success">
                        Clear
                      </StatusPill>
                    )}
                  </td>

                  <td className="accountability-project-cell">
                    <strong>
                      {row.jobName || 'Unnamed Project'}
                    </strong>
                    <span>
                      Job {row.jobNumber || '—'}
                      {row.purpose
                        ? ` · ${row.purpose}`
                        : ''}
                    </span>
                  </td>

                  <td>
                    {row.riggsPM || 'No PM Assigned'}
                  </td>

                  <td>
                    <strong>
                      {dateLabel(row.operationsCompletionDate)}
                    </strong>
                    <small className="cell-subtext">
                      {row.daysSinceOperationsCompletion === null
                        || row.daysSinceOperationsCompletion === undefined
                        ? '—'
                        : `${daysLabel(row.daysSinceOperationsCompletion)} ago`}
                    </small>
                  </td>

                  <td>
                    <strong>
                      {dateLabel(row.lastBillingActivityDate)}
                    </strong>
                    <small className="cell-subtext">
                      {billingLabel(row.billingFollowUpState)}
                    </small>
                  </td>

                  <td>
                    <strong>
                      {row.daysSinceLastBilling === null
                        || row.daysSinceLastBilling === undefined
                        ? '—'
                        : daysLabel(row.daysSinceLastBilling)}
                    </strong>
                  </td>

                  <td>
                    <div className="accountability-state-stack">
                      <StatusPill tone={closeTone(row)}>
                        {closeLabel(row)}
                      </StatusPill>

                      {row.foundationCompletionDate && (
                        <small>
                          Closed {dateLabel(row.foundationCompletionDate)}
                          {row.foundationCloseBatchSize >= 5
                            ? ` · batch of ${row.foundationCloseBatchSize}`
                            : ''}
                        </small>
                      )}
                    </div>
                  </td>

                  <td>
                    {row.operationsToLastBillingDays === null
                      || row.operationsToLastBillingDays === undefined
                      ? '—'
                      : daysLabel(row.operationsToLastBillingDays)}
                  </td>

                  <td>
                    <div className="accountability-flag-stack">
                      {row.opsMissingCompletionDate && (
                        <StatusPill tone="warning">
                          Missing completion
                        </StatusPill>
                      )}
                      {row.opsMissingStart && (
                        <StatusPill tone="review">
                          Missing start
                        </StatusPill>
                      )}
                      {row.opsMissingDuration && (
                        <StatusPill tone="neutral">
                          Missing duration
                        </StatusPill>
                      )}
                      {row.opsStartAfterCompletion && (
                        <StatusPill tone="critical">
                          Invalid dates
                        </StatusPill>
                      )}
                      {!rowHasOpsIssue(row) && (
                        <span className="muted-value">—</span>
                      )}
                    </div>
                  </td>

                  <td className="numeric strong-cell">
                    {currency(row.actualBilledTotal)}
                  </td>
                </tr>
              ))}

              {!filteredRows.length && (
                <tr>
                  <td
                    colSpan="10"
                    className="empty-cell"
                  >
                    {loading
                      ? 'Loading accountability detail…'
                      : 'No projects match the current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="accountability-footnote">
        <strong>How to read this page</strong>
        <span>
          Foundation close backlog is intentionally separate from billing lag.
          A job can keep billing after field work ends. The strongest close-process
          signal is Operations complete + Foundation open + no billing activity
          for 90 or 180+ days. Contract remaining is intentionally excluded until
          the authoritative revised-contract source is resolved.
        </span>
      </section>
    </main>
  );
}
