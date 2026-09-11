import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  GeneralContractorDisplay,
} from './GeneralContractors.jsx';


function text(
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

  return String(value);
}


function money(value) {
  if (
    value === null
    || value === undefined
    || value === ''
  ) {
    return '—';
  }

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


function dateLabel(value) {
  if (!value) {
    return '—';
  }

  const parsed =
    new Date(
      `${String(value).slice(0, 10)}T12:00:00`
    );

  if (Number.isNaN(parsed.getTime())) {
    return text(value);
  }

  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    },
  ).format(parsed);
}


function probabilityLabel(value) {
  if (
    value === null
    || value === undefined
    || value === ''
  ) {
    return '—';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return `${Math.round(number * 100)}%`;
}


function stateLabel(value) {
  const normalized =
    String(value || '')
      .trim()
      .toUpperCase();

  const labels = {
    READY: 'Ready',
    NOT_CONFIGURED: 'Needs setup',
    EXCLUDED: 'Excluded',
    MISSING_AMOUNT: 'Needs amount',
    MISSING_START_DATE: 'Needs start date',
    MISSING_DURATION_OR_END: 'Needs duration',
    INVALID_DATE_RANGE: 'Check dates',
  };

  if (!normalized) {
    return 'Needs setup';
  }

  return labels[normalized]
    || normalized
      .toLowerCase()
      .split('_')
      .map(
        part =>
          part.charAt(0).toUpperCase()
          + part.slice(1)
      )
      .join(' ');
}


function projectionStatusMessage(project) {
  const state = project?.forecastState;

  const messages = {
    EXCLUDED:
      'This bid is not included in projected billing totals.',

    MISSING_AMOUNT:
      'Add a projection amount below.',

    MISSING_START_DATE:
      'Add a projection start date below.',

    MISSING_DURATION_OR_END:
      'Add the expected billing duration below.',

    INVALID_DATE_RANGE:
      'Check the projection start date and duration.',

    NOT_CONFIGURED:
      'Finish the setup below to start calculating monthly projected billings.',
  };

  return messages[state] || null;
}


function missingProjectionLabel(project) {
  const labels = {
    MISSING_AMOUNT:
      'Projection amount',

    MISSING_START_DATE:
      'Projection start date',

    MISSING_DURATION_OR_END:
      'Duration',

    INVALID_DATE_RANGE:
      'Start date or duration',

    NOT_CONFIGURED:
      'Setup details',
  };

  return labels[project?.forecastState] || null;
}


function estimatorLabel(project) {
  const explicit = [
    project?.primaryEstimator,
    project?.secondaryEstimator,
  ].filter(Boolean);

  if (explicit.length) {
    return explicit.join(' / ');
  }

  if (
    project?.primaryEstimatorLookupId
    || project?.secondaryEstimatorLookupId
  ) {
    return 'Assigned in Bid Log';
  }

  return '—';
}


function initialForm(project) {
  return {
    includeInForecast:
      project?.includeInForecast
      ?? true,

    startDateOverride:
      project?.startDateOverride
      ? String(
          project.startDateOverride
        ).slice(0, 10)
      : '',

    amountOverride:
      project?.amountOverride
      ?? '',

    estimatedDurationMonths:
      project?.estimatedDurationMonths
      ?? '',

    projectionNotes:
      project?.projectionNotes
      || '',
  };
}


async function requestJson(
  path,
  options = {},
) {
  const response =
    await window.fetch(
      path,
      {
        credentials: 'same-origin',
        ...options,
        headers: {
          ...(options.body
            ? {
                'Content-Type':
                  'application/json',
              }
            : {}),
          ...(options.headers || {}),
        },
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
      // Keep fallback.
    }

    const messages = {
      bid_log_forecast_changed:
        'These projection settings changed after you opened the bid. Reload the drawer and try again.',

      bid_log_user_not_authorized:
        'Your Bid Log role cannot change projection settings.',

      invalid_bid_log_forecast_settings:
        'One or more projection settings are invalid. Review the values and try again.',

      bid_log_forecast_busy:
        'Projection settings are busy right now. Try again in a moment.',

      active_bid_log_bid_not_found:
        'This bid is no longer available in the active Bid Log.',

      projected_billing_resource_not_found:
        'This bid is no longer available in projected billings.',

      data_api_unavailable:
        'Bid Log could not reach Riggs data services. Try again in a moment.',
    };

    const error =
      new Error(
        messages[detail]
        || 'Unable to update this bid projection.'
      );

    error.detail = detail;
    error.status = response.status;

    throw error;
  }

  return response.json();
}


export default function ActiveBidBillingDrawer({
  bid,
  user,
  onClose,
  onEditBid,
  onBidUpdated,
}) {
  const [
    project,
    setProject,
  ] = useState(null);

  const [
    monthlyRows,
    setMonthlyRows,
  ] = useState([]);

  const [
    form,
    setForm,
  ] = useState(
    initialForm(bid)
  );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    loadError,
    setLoadError,
  ] = useState(null);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    saveError,
    setSaveError,
  ] = useState(null);

  const [
    saveMessage,
    setSaveMessage,
  ] = useState(null);


  const sharePointItemId =
    bid?.sharePointItemId;

  const role =
    String(
      user?.appRole
      || ''
    )
      .trim()
      .toUpperCase();

  const canEdit =
    role === 'ADMIN'
    || role === 'OPERATIONS';


  async function loadProjection(
    cancelled = () => false,
  ) {
    if (!sharePointItemId) {
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const payload =
        await requestJson(
          `/api/projected-billings/active-bids/${sharePointItemId}/monthly`
        );

      if (cancelled()) {
        return;
      }

      const nextProject =
        payload?.project
        || bid;

      const nextRows =
        Array.isArray(payload?.items)
          ? payload.items
          : [];

      setProject(nextProject);
      setMonthlyRows(nextRows);
      setForm(
        initialForm(nextProject)
      );

    } catch (error) {
      if (!cancelled()) {
        setLoadError(
          error.message
          || 'Unable to load this bid projection.'
        );
      }

    } finally {
      if (!cancelled()) {
        setLoading(false);
      }
    }
  }


  useEffect(
    () => {
      if (!bid) {
        return undefined;
      }

      let cancelled = false;

      setProject(bid);
      setMonthlyRows([]);
      setForm(initialForm(bid));
      setSaveError(null);
      setSaveMessage(null);

      loadProjection(
        () => cancelled
      );

      const onKeyDown =
        event => {
          if (event.key === 'Escape') {
            onClose();
          }
        };

      const previousOverflow =
        document.body.style.overflow;

      document.body.style.overflow =
        'hidden';

      window.addEventListener(
        'keydown',
        onKeyDown,
      );

  return () => {
        cancelled = true;

        document.body.style.overflow =
          previousOverflow;

        window.removeEventListener(
          'keydown',
          onKeyDown,
        );
      };
    }, [
      sharePointItemId,
    ],
  );


  const activeProject =
    project || bid;

  const projectionMessage =
    projectionStatusMessage(
      activeProject
    );

  const missingLabel =
    missingProjectionLabel(
      activeProject
    );

  const projectedTotal =
    useMemo(
      () =>
        monthlyRows.reduce(
          (total, row) =>
            total
            + Number(
              row.monthlyForecastAmount
              || 0
            ),
          0,
        ),
      [monthlyRows],
    );

  const weightedTotal =
    useMemo(
      () =>
        monthlyRows.reduce(
          (total, row) =>
            total
            + Number(
              row.weightedMonthlyForecastAmount
              || 0
            ),
          0,
        ),
      [monthlyRows],
    );


  if (!bid) {
    return null;
  }


  async function saveSettings(event) {
    event.preventDefault();

    if (!canEdit || saving) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    const amountText =
      String(
        form.amountOverride
        ?? ''
      ).trim();

    const durationText =
      String(
        form.estimatedDurationMonths
        ?? ''
      ).trim();

    const payload = {
      includeInForecast:
        Boolean(
          form.includeInForecast
        ),

      startDateOverride:
        form.startDateOverride
        || null,

      amountOverride:
        amountText === ''
          ? null
          : Number(amountText),

      estimatedDurationMonths:
        durationText === ''
          ? null
          : Number(durationText),

      projectionNotes:
        String(
          form.projectionNotes
          || ''
        ).trim()
        || null,

      expectedRowVersion:
        activeProject?.rowVersion
        || null,
    };

    if (
      payload.amountOverride !== null
      && (
        !Number.isFinite(
          payload.amountOverride
        )
        || payload.amountOverride < 0
      )
    ) {
      setSaveError(
        'Projection Amount must be zero or greater.'
      );
      setSaving(false);
      return;
    }

    if (
      payload.estimatedDurationMonths !== null
      && (
        !Number.isInteger(
          payload.estimatedDurationMonths
        )
        || payload.estimatedDurationMonths < 1
        || payload.estimatedDurationMonths > 120
      )
    ) {
      setSaveError(
        'Duration must be between 1 and 120 months.'
      );
      setSaving(false);
      return;
    }

    try {
      await requestJson(
        `/api/projected-billings/active-bids/${sharePointItemId}/settings`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      );

      const refreshed =
        await requestJson(
          `/api/projected-billings/active-bids/${sharePointItemId}/monthly`
        );

      const nextProject =
        refreshed?.project
        || activeProject;

      const nextRows =
        Array.isArray(
          refreshed?.items
        )
          ? refreshed.items
          : [];

      setProject(nextProject);
      setMonthlyRows(nextRows);
      setForm(
        initialForm(nextProject)
      );
      setSaveMessage(
        'Projection saved.'
      );

      onBidUpdated?.(
        nextProject,
        nextRows,
      );

    } catch (error) {
      setSaveError(
        error.message
        || 'Unable to save projection settings.'
      );

    } finally {
      setSaving(false);
    }
  }


  // Temporary management rollout: master-record editing
  // remains ADMIN-only until Operations rollout is approved.
  const canOpenEditor =
    String(
      user?.appRole || '',
    )
      .trim()
      .toUpperCase()
    === 'ADMIN';


  return (
    <div
      className="billing-drawer-backdrop"
      role="presentation"
      onMouseDown={
        event => {
          if (
            event.target
            === event.currentTarget
          ) {
            onClose();
          }
        }
      }
    >
      <aside
        className="billing-drawer active-bid-billing-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="active-bid-drawer-title"
      >
        <header className="billing-drawer-header">
          <div>
            <span className="section-kicker">
              POTENTIAL PROJECT · PROJECTED BILLINGS
            </span>

            <h2 id="active-bid-drawer-title">
              {text(
                activeProject?.bidName,
                'Unnamed Bid',
              )}
            </h2>

            <p>
              {text(
                activeProject?.status,
                'Active Bid',
              )}
              {' · '}
              {probabilityLabel(
                activeProject?.probability
              )}
              {' probability'}
            </p>
          </div>

          <div className="billing-drawer-header-actions">
            {canOpenEditor && onEditBid && (
              <button
                type="button"
                className="secondary-button billing-drawer-edit-button"
                onClick={() => onEditBid()}
              >
                Edit Bid
              </button>
            )}

            <button
              type="button"
              className="billing-drawer-close"
              onClick={onClose}
              aria-label="Close bid projection detail"
            >
              ×
            </button>
          </div>
        </header>


        <div className="billing-drawer-body">
          {loadError && (
            <div className="active-bid-drawer-message error">
              {loadError}
            </div>
          )}

          <section className="billing-drawer-meta billing-drawer-meta-five">
            <article className="billing-meta-card">
              <small className="billing-meta-label">
                Probability
              </small>

              <strong>
                {probabilityLabel(
                  activeProject?.probability
                )}
              </strong>
            </article>

            <article className="billing-meta-card">
              <small className="billing-meta-label">
                PM
              </small>

              <strong>
                {text(
                  activeProject?.pm,
                  'No PM Assigned',
                )}
              </strong>
            </article>

            <article className="billing-meta-card">
              <small className="billing-meta-label">
                Estimator
              </small>

              <strong>
                {estimatorLabel(
                  activeProject
                )}
              </strong>
            </article>

            <article className="billing-meta-card">
              <small className="billing-meta-label">
                GC
              </small>

              <GeneralContractorDisplay
                value={
                  activeProject?.generalContractors
                }
              />
            </article>

            <article className="billing-meta-card billing-location-card">
              <small className="billing-meta-label">
                Location
              </small>

              <strong>
                {text(
                  activeProject?.streetAddress
                )}
              </strong>

              {(
                activeProject?.city
                || activeProject?.state
              ) && (
                <small>
                  {[
                    activeProject?.city,
                    activeProject?.state,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </small>
              )}
            </article>
          </section>


          <section className="billing-characteristics-grid">
            <article>
              <span>
                Project Type
              </span>

              <strong>
                {text(
                  activeProject?.projectType
                )}
              </strong>
            </article>

            <article>
              <span>
                Purpose
              </span>

              <strong>
                {text(
                  activeProject?.purpose
                )}
              </strong>
            </article>

            <article>
              <span>
                Anticipated Start
              </span>

              <strong className="date-kpi">
                {dateLabel(
                  activeProject?.anticipatedStartDate
                )}
              </strong>
            </article>

            <article>
              <span>
                Forecast Status
              </span>

              <strong>
                {stateLabel(
                  activeProject?.forecastState
                )}
              </strong>
            </article>
          </section>


          <section className="billing-kpi-grid billing-kpi-primary-grid">
            <article>
              <span>
                Estimated Price
              </span>

              <strong>
                {money(
                  activeProject?.estimatedPrice
                )}
              </strong>
            </article>

            <article>
              <span>
                Weighted Projected Value
              </span>

              <strong>
                {money(
                  activeProject?.weightedForecastAmount
                )}
              </strong>
            </article>

            <article>
              <span>
                Estimated Duration
              </span>

              <strong className="date-kpi">
                {activeProject?.estimatedDurationMonths
                  ? `${activeProject.estimatedDurationMonths} months`
                  : '—'}
              </strong>
            </article>

            <article>
              <span>
                Projected Completion
              </span>

              <strong className="date-kpi">
                {dateLabel(
                  activeProject?.effectiveEndDate
                )}
              </strong>
            </article>
          </section>


          {(
            projectionMessage
            || !activeProject?.forecastReady
          ) && (
            <section className="active-bid-readiness-card">
              <div>
                <span className="section-kicker">
                  PROJECTION STATUS
                </span>

                <strong>
                  {activeProject?.forecastReady
                    ? 'Projection ready'
                    : 'Projection not ready'}
                </strong>

                {projectionMessage && (
                  <p>
                    {projectionMessage}
                  </p>
                )}
              </div>

              {missingLabel && (
                <div className="active-bid-missing-field">
                  <small>
                    Missing
                  </small>

                  <strong>
                    {missingLabel}
                  </strong>
                </div>
              )}
            </section>
          )}


          <section className="billing-assumptions active-bid-settings-section">
            <div className="section-heading compact active-bid-settings-heading">
              <div>
                <span className="section-kicker">
                  BILLING FORECAST
                </span>

                <h3>
                  Projection Setup
                </h3>
              </div>

              <span
                className={
                  activeProject?.forecastReady
                    ? 'billing-state ready'
                    : 'billing-state'
                }
              >
                {stateLabel(
                  activeProject?.forecastState
                )}
              </span>
            </div>


            <form
              className="active-bid-settings-form"
              onSubmit={saveSettings}
            >
              <label className="active-bid-settings-toggle">
                <input
                  type="checkbox"
                  checked={
                    Boolean(
                      form.includeInForecast
                    )
                  }
                  onChange={
                    event =>
                      setForm(
                        current => ({
                          ...current,
                          includeInForecast:
                            event.target.checked,
                        })
                      )
                  }
                  disabled={!canEdit || saving}
                />

                <span>
                  <strong>
                    Include this bid in projected billings
                  </strong>

                  <small>
                    Turn this off to leave this bid out of projected billing totals.
                  </small>
                </span>
              </label>


              <div className="active-bid-settings-grid">
                <label>
                  <span>
                    Projection Start Date
                  </span>

                  <input
                    type="date"
                    value={
                      form.startDateOverride
                    }
                    onChange={
                      event =>
                        setForm(
                          current => ({
                            ...current,
                            startDateOverride:
                              event.target.value,
                          })
                        )
                    }
                    disabled={!canEdit || saving}
                  />

                  <small>
                    {activeProject?.anticipatedStartDate
                      ? `Leave blank to use Bid Log: ${dateLabel(activeProject.anticipatedStartDate)}`
                      : 'No Bid Log start date. Enter one here.'}
                  </small>
                </label>


                <label>
                  <span>
                    Projection Amount
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      form.amountOverride
                    }
                    placeholder="Use estimated price"
                    onChange={
                      event =>
                        setForm(
                          current => ({
                            ...current,
                            amountOverride:
                              event.target.value,
                          })
                        )
                    }
                    disabled={!canEdit || saving}
                  />

                  <small>
                    {activeProject?.estimatedPrice !== null
                    && activeProject?.estimatedPrice !== undefined
                      ? `Leave blank to use Bid Log estimate: ${money(activeProject.estimatedPrice)}`
                      : 'No Bid Log estimate. Enter an amount here.'}
                  </small>
                </label>


                <label>
                  <span>
                    Duration
                  </span>

                  <div className="active-bid-duration-input">
                    <input
                      type="number"
                      min="1"
                      max="120"
                      step="1"
                      value={
                        form.estimatedDurationMonths
                      }
                      placeholder="Months"
                      onChange={
                        event =>
                          setForm(
                            current => ({
                              ...current,
                              estimatedDurationMonths:
                                event.target.value,
                            })
                          )
                      }
                      disabled={!canEdit || saving}
                    />

                    <span>
                      months
                    </span>
                  </div>

                  <small>
                    How many months you expect billing to run.
                  </small>
                </label>
              </div>


              <label className="active-bid-notes-field">
                <span>
                  Notes
                </span>

                <textarea
                  rows="3"
                  maxLength="1000"
                  value={
                    form.projectionNotes
                  }
                  onChange={
                    event =>
                      setForm(
                        current => ({
                          ...current,
                          projectionNotes:
                            event.target.value,
                        })
                      )
                  }
                  disabled={!canEdit || saving}
                  placeholder="Optional notes about projection timing or billing"
                />
              </label>


              {saveError && (
                <div className="active-bid-drawer-message error">
                  {saveError}
                </div>
              )}

              {saveMessage && (
                <div className="active-bid-drawer-message success">
                  {saveMessage}
                </div>
              )}


              <div className="active-bid-settings-actions">
                {!canEdit && (
                  <span className="section-note">
                    Your role has read-only projection access.
                  </span>
                )}

                {canEdit && (
                  <button
                    type="submit"
                    className="pm-save-button"
                    disabled={saving || loading}
                  >
                    {saving
                      ? 'Saving…'
                      : 'Save Projection'}
                  </button>
                )}
              </div>
            </form>
          </section>


          <section className="billing-monthly-section">
            <div className="section-heading compact active-bid-monthly-heading">
              <div>
                <span className="section-kicker">
                  PROJECTED BILLINGS
                </span>

                <h3>
                  Monthly Projection
                </h3>
              </div>

              <div className="active-bid-monthly-totals">
                <span>
                  <small>
                    Projected
                  </small>
                  <strong>
                    {money(projectedTotal)}
                  </strong>
                </span>

                <span>
                  <small>
                    Weighted
                  </small>
                  <strong>
                    {money(weightedTotal)}
                  </strong>
                </span>
              </div>
            </div>


            <div className="billing-monthly-table-wrap">
              <table className="billing-monthly-table active-bid-monthly-table">
                <thead>
                  <tr>
                    <th>
                      Month
                    </th>
                    <th className="numeric">
                      Projected Billing
                    </th>
                    <th className="numeric">
                      Probability-Weighted Billing
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {monthlyRows.map(
                    row => (
                      <tr
                        key={
                          row.monthStart
                        }
                      >
                        <td>
                          {text(
                            row.forecastMonthLabel,
                            dateLabel(
                              row.monthStart
                            ),
                          )}
                        </td>

                        <td className="numeric">
                          {money(
                            row.monthlyForecastAmount
                          )}
                        </td>

                        <td className="numeric">
                          {money(
                            row.weightedMonthlyForecastAmount
                          )}
                        </td>
                      </tr>
                    )
                  )}

                  {!monthlyRows.length && (
                    <tr>
                      <td
                        colSpan="3"
                        className="empty-cell"
                      >
                        {loading
                          ? 'Loading projected billings…'
                          : 'No monthly projection is available yet. Complete the required projection settings above.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
