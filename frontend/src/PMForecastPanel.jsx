import {
  useEffect,
  useMemo,
  useState,
} from 'react';


const fmtMoney = (
  value,
  cents = false,
) => {
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
      minimumFractionDigits:
        cents ? 2 : 0,
      maximumFractionDigits:
        cents ? 2 : 0,
    },
  ).format(number);
};


const fmtMonth = value => {
  if (!value) {
    return '—';
  }

  const [
    year,
    month,
  ] = String(value)
    .slice(0, 7)
    .split('-')
    .map(Number);

  if (!year || !month) {
    return String(value);
  }

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
    )
  );
};


const fmtDateTime = value => {
  if (!value) {
    return '—';
  }

  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return String(value);
  }

  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    },
  ).format(parsed);
};


const varianceClass = value => {
  const number = Number(value);

  if (
    !Number.isFinite(number)
    || Math.abs(number) < 0.005
  ) {
    return '';
  }

  return number > 0
    ? 'variance-positive'
    : 'variance-negative';
};


const errorText = detail => ({
  pm_forecast_test_job_only:
    'Forecast editing is still limited to the controlled test project.',

  bid_log_pm_forecast_changed:
    'This forecast changed after you opened it. Reload it before saving.',

  bid_log_pm_forecast_month_locked:
    'One of these months is now locked. Reload the forecast before saving.',

  bid_log_pm_forecast_total_mismatch:
    'The forecast total must match the System Baseline total with the current total setting.',

  bid_log_pm_forecast_baseline_not_ready:
    'This project does not have a ready System Baseline yet.',

  bid_log_pm_forecast_user_not_authorized:
    'Your account is not authorized to edit this forecast.',

  pm_forecast_writes_disabled:
    'Forecast editing is not enabled yet.',
}[detail]
  || 'Unable to complete the forecast request.');


async function fetchJson(
  url,
  options = {},
) {
  const response =
    await window.fetch(
      url,
      {
        credentials:
          'same-origin',

        ...options,
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
      errorText(
        payload?.detail
      )
    );
  }

  return payload;
}


export default function PMForecastPanel({
  project,
  monthlyRows,
  user,
}) {
  const [
    forecast,
    setForecast,
  ] = useState(null);

  const [
    history,
    setHistory,
  ] = useState([]);

  const [
    policy,
    setPolicy,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState(null);

  const [
    editing,
    setEditing,
  ] = useState(false);

  const [
    edits,
    setEdits,
  ] = useState({});

  const [
    notes,
    setNotes,
  ] = useState('');

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    saveError,
    setSaveError,
  ] = useState(null);

  const [
    historyOpen,
    setHistoryOpen,
  ] = useState(false);


  const load = async () => {
    if (!project?.jobListId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [
        forecastPayload,
        historyPayload,
        policyPayload,
      ] = await Promise.all([
        fetchJson(
          `/api/current-projects/${project.jobListId}/pm-forecast`
        ),

        fetchJson(
          `/api/current-projects/${project.jobListId}/pm-forecast/history`
        ),

        fetchJson(
          '/api/pm-forecast/policy'
        ),
      ]);

      setForecast(
        forecastPayload
      );

      setHistory(
        Array.isArray(
          historyPayload?.items
        )
          ? historyPayload.items
          : []
      );

      setPolicy(
        policyPayload
      );

    } catch (err) {
      setError(
        err.message
        || 'Unable to load the billing forecast.'
      );

    } finally {
      setLoading(false);
    }
  };


  useEffect(
    () => {
      setForecast(null);
      setHistory([]);
      setPolicy(null);

      setEditing(false);
      setEdits({});
      setNotes('');

      setSaveError(null);
      setHistoryOpen(false);

      load();
    },
    [
      project?.jobListId,
    ],
  );


  const sourceRows =
    useMemo(
      () => {
        if (
          Array.isArray(
            forecast?.items
          )
          && forecast.items.length
        ) {
          return forecast.items;
        }

        return (
          monthlyRows || []
        ).map(
          row => ({
            monthStart:
              row.monthStart,

            systemBaselineAmount:
              row.projectedAmount,

            pmForecastAmount:
              null,

            foundationActualAmount:
              row.actualAmount,

            isEditable:
              false,

            monthEditState:
              null,
          })
        );
      },
      [
        forecast,
        monthlyRows,
      ],
    );


  const rows =
    useMemo(
      () => {
        let runningBaseline = 0;
        let runningPm = 0;
        let runningActual = 0;
        let runningPlan = 0;

        return sourceRows.map(
          row => {
            const baseline =
              row.systemBaselineAmount
                == null
                ? null
                : Number(
                    row.systemBaselineAmount
                  );

            const savedPm =
              row.pmForecastAmount
                == null
                ? null
                : Number(
                    row.pmForecastAmount
                  );

            const actual =
              row.foundationActualAmount
                == null
                ? null
                : Number(
                    row.foundationActualAmount
                  );

            let displayedPm =
              savedPm;

            if (
              editing
              && row.isEditable
            ) {
              const raw =
                edits[
                  row.monthStart
                ];

              if (
                raw !== ''
                && raw !== null
                && raw !== undefined
                && Number.isFinite(
                  Number(raw)
                )
              ) {
                displayedPm =
                  Number(raw);
              } else {
                displayedPm =
                  null;
              }
            }

            if (
              Number.isFinite(
                baseline
              )
            ) {
              runningBaseline +=
                baseline;
            }

            if (
              Number.isFinite(
                displayedPm
              )
            ) {
              runningPm +=
                displayedPm;
            }

            if (
              Number.isFinite(
                actual
              )
            ) {
              runningActual +=
                actual;
            }

            const plan =
              displayedPm !== null
                ? displayedPm
                : baseline;

            if (
              Number.isFinite(
                plan
              )
            ) {
              runningPlan +=
                plan;
            }

            const variance =
              actual === null
                || plan === null
                ? null
                : actual - plan;

            const runningVariance =
              actual === null
                ? null
                : (
                    runningActual
                    - runningPlan
                  );

            return {
              ...row,

              baseline,
              savedPm,
              displayedPm,
              actual,
              variance,

              runningBaseline,
              runningPm,
              runningActual,
              runningVariance,
            };
          }
        );
      },
      [
        sourceRows,
        editing,
        edits,
      ],
    );


  const editableRows =
    useMemo(
      () =>
        rows.filter(
          row =>
            row.isEditable
            === true
        ),
      [
        rows,
      ],
    );


  const role =
    String(
      user?.appRole
      || ''
    ).toUpperCase();

  const canSubmit =
    [
      'ADMIN',
      'OPERATIONS',
    ].includes(role);

  const canEdit =
    canSubmit
    && !loading
    && !error
    && Boolean(forecast);

  const latest =
    forecast?.latestVersion;


  const editTotals =
    useMemo(
      () => {
        let baseline = 0;
        let pm = 0;
        let valid = true;

        editableRows.forEach(
          row => {
            baseline += Number(
              row.baseline
              || 0
            );

            const raw =
              edits[
                row.monthStart
              ];

            if (
              raw === ''
              || raw === null
              || raw === undefined
              || !Number.isFinite(
                Number(raw)
              )
            ) {
              valid = false;
            } else {
              pm += Number(raw);
            }
          }
        );

        return {
          baseline,
          pm,

          difference:
            pm - baseline,

          valid,
        };
      },
      [
        editableRows,
        edits,
      ],
    );


  const totalMismatch =
    Boolean(
      policy
        ?.requireBaselineTotalMatch

      && Math.abs(
           editTotals.difference
         ) >= 0.005
    );


  const beginEdit = () => {
    const next = {};

    editableRows.forEach(
      row => {
        next[
          row.monthStart
        ] = Number(
          row.savedPm
          ?? row.baseline
          ?? 0
        ).toFixed(2);
      }
    );

    setEdits(next);

    setNotes(
      latest?.notes
      || ''
    );

    setSaveError(null);

    setEditing(true);
  };


  const cancelEdit = () => {
    setEditing(false);
    setEdits({});
    setNotes('');
    setSaveError(null);
  };


  const save = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      if (!editTotals.valid) {
        throw new Error(
          'Enter an amount for every editable month.'
        );
      }

      if (totalMismatch) {
        throw new Error(
          'The forecast total must match the System Baseline total with the current total setting.'
        );
      }

      const items =
        editableRows.map(
          row => ({
            monthStart:
              row.monthStart,

            forecastAmount:
              Number(
                edits[
                  row.monthStart
                ]
              ),
          })
        );

      if (
        items.some(
          item =>
            item.forecastAmount < 0
        )
      ) {
        throw new Error(
          'Forecast amounts cannot be negative.'
        );
      }

      await fetchJson(
        `/api/current-projects/${project.jobListId}/pm-forecast`,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            'X-Request-ID':
              window.crypto
                .randomUUID(),
          },

          body:
            JSON.stringify({
              items,

              notes:
                notes.trim()
                || null,

              expectedLatestForecastVersionId:
                latest
                  ?.forecastVersionId
                ?? null,
            }),
        },
      );

      setEditing(false);
      setEdits({});
      setNotes('');

      await load();

    } catch (err) {
      setSaveError(
        err.message
        || 'Unable to save the billing forecast.'
      );

    } finally {
      setSaving(false);
    }
  };


  return (
    <>
      <section className="pm-forecast-section">
        <div className="section-heading compact pm-forecast-heading">
          <div>
            <span className="section-kicker">
              PM / OPERATIONS FORECAST
            </span>

            <h3>
              Billing forecast
            </h3>
          </div>

          {canEdit
            && !editing
            && (
              <button
                type="button"
                className="secondary-button"
                onClick={beginEdit}
                disabled={
                  !editableRows.length
                }
              >
                {forecast?.hasPmForecast
                  ? 'Edit PM Forecast'
                  : 'Start PM Forecast'}
              </button>
            )}
        </div>


        {loading && (
          <div className="pm-forecast-message">
            Loading billing forecast…
          </div>
        )}


        {error && (
          <div className="pm-forecast-message error">
            {error}
          </div>
        )}


        {!loading
          && !error
          && forecast
          && (
            <>
              <div className="pm-forecast-status-line">
                <strong>
                  {forecast.hasPmForecast
                    ? `Version ${latest?.versionNumber}`
                    : 'Not started'}
                </strong>

                <span>
                  ·
                </span>

                <span>
                  {forecast.hasPmForecast
                    ? (
                        <>
                          {latest?.submittedByName
                            || 'Unknown'}
                          {' · '}
                          {fmtDateTime(
                            latest?.submittedAtUTC
                          )}
                        </>
                      )
                    : 'No forecast saved yet'}
                </span>

                <span>
                  ·
                </span>

                <span>
                  Total setting:{' '}
                  <strong>
                    {policy
                      ?.requireBaselineTotalMatch
                      ? 'Must match baseline'
                      : 'Can vary from baseline'}
                  </strong>
                </span>
              </div>


              {latest?.notes
                && !editing
                && (
                  <div className="pm-latest-note">
                    <span>
                      Latest forecast note
                    </span>

                    <p>
                      {latest.notes}
                    </p>
                  </div>
                )}
            </>
          )}
      </section>


      <section className="billing-monthly-section pm-monthly-section">
        <div className="section-heading compact">
          <div>
            <span className="section-kicker">
              MONTHLY BILLING
            </span>

            <h3>
              Billing Forecast vs Foundation Actual
            </h3>
          </div>

          <span className="section-note">
            {rows.length} months
          </span>
        </div>


        <div className="billing-monthly-table-wrap">
          <table className="billing-monthly-table pm-accountability-table">
            <thead>
              <tr>
                <th>Month</th>

                <th className="numeric">
                  System Baseline
                </th>

                <th className="numeric">
                  PM Forecast
                </th>

                <th className="numeric">
                  Foundation Actual
                </th>

                <th className="numeric">
                  Variance
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map(
                row => {
                  const inlineEdit =
                    editing
                    && row.isEditable;

                  return (
                    <tr
                      key={row.monthStart}
                      className={
                        inlineEdit
                          ? 'pm-editable-row'
                          : undefined
                      }
                    >
                      <td>
                        <strong>
                          {fmtMonth(
                            row.monthStart
                          )}
                        </strong>

                        {row.monthEditState && (
                          <small className="billing-month-state">
                            {row.isEditable
                              ? 'Editable'
                              : 'Locked'}
                          </small>
                        )}
                      </td>

                      <td className="numeric">
                        <strong>
                          {fmtMoney(
                            row.baseline
                          )}
                        </strong>

                        <small>
                          Running total {
                            fmtMoney(
                              row.runningBaseline
                            )
                          }
                        </small>
                      </td>

                      <td className="numeric pm-forecast-cell">
                        {inlineEdit
                          ? (
                            <div className="pm-inline-input-wrap">
                              <span>
                                $
                              </span>

                              <input
                                aria-label={
                                  `${fmtMonth(
                                    row.monthStart
                                  )} PM Forecast`
                                }
                                type="number"
                                min="0"
                                step="0.01"
                                disabled={saving}
                                value={
                                  edits[
                                    row.monthStart
                                  ]
                                  ?? ''
                                }
                                onChange={
                                  event =>
                                    setEdits(
                                      current => ({
                                        ...current,

                                        [row.monthStart]:
                                          event
                                            .target
                                            .value,
                                      })
                                    )
                                }
                              />
                            </div>
                          )
                          : (
                            <strong>
                              {fmtMoney(
                                row.displayedPm
                              )}
                            </strong>
                          )}

                        <small>
                          Running total {
                            (
                              forecast
                                ?.hasPmForecast
                              || editing
                            )
                              ? fmtMoney(
                                  row.runningPm
                                )
                              : '—'
                          }
                        </small>
                      </td>

                      <td className="numeric">
                        <strong>
                          {fmtMoney(
                            row.actual
                          )}
                        </strong>

                        <small>
                          Running total {
                            fmtMoney(
                              row.runningActual
                            )
                          }
                        </small>
                      </td>

                      <td
                        className={
                          (
                            'numeric '
                            + varianceClass(
                                row.variance
                              )
                          )
                        }
                      >
                        <strong>
                          {fmtMoney(
                            row.variance
                          )}
                        </strong>

                        <small>
                          Running total {
                            fmtMoney(
                              row.runningVariance
                            )
                          }
                        </small>
                      </td>
                    </tr>
                  );
                }
              )}

              {!rows.length && (
                <tr>
                  <td
                    colSpan="5"
                    className="empty-cell"
                  >
                    No System Baseline or Foundation billing rows are available for this project.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>


        {editing && (
          <div className="pm-inline-editor">
            <div className="pm-inline-edit-intro">
              <strong>
                {forecast.hasPmForecast
                  ? 'Update PM Forecast'
                  : 'Start from System Baseline'}
              </strong>

              <span>
                Adjust the months that look different from the current plan. Past locked months stay unchanged.
              </span>
            </div>


            <div className="pm-inline-totals">
              <div>
                <span>
                  Editable baseline
                </span>

                <strong>
                  {fmtMoney(
                    editTotals.baseline,
                    true,
                  )}
                </strong>
              </div>

              <div>
                <span>
                  PM Forecast
                </span>

                <strong>
                  {fmtMoney(
                    editTotals.pm,
                    true,
                  )}
                </strong>
              </div>

              <div
                className={
                  varianceClass(
                    editTotals.difference
                  )
                }
              >
                <span>
                  Difference
                </span>

                <strong>
                  {fmtMoney(
                    editTotals.difference,
                    true,
                  )}
                </strong>
              </div>
            </div>


            {totalMismatch && (
              <div className="pm-forecast-message warning">
                The current total setting requires the editable PM Forecast total to match the editable System Baseline total.
              </div>
            )}


            <label className="pm-inline-note">
              <span>
                Forecast note
                <small>
                  Optional
                </small>
              </span>

              <textarea
                rows="2"
                maxLength="1000"
                value={notes}
                disabled={saving}
                placeholder="Schedule changes, billing timing, known delays, or other context…"
                onChange={
                  event =>
                    setNotes(
                      event
                        .target
                        .value
                    )
                }
              />
            </label>


            {saveError && (
              <div className="pm-forecast-message error">
                {saveError}
              </div>
            )}


            <div className="pm-editor-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={cancelEdit}
              >
                Cancel
              </button>

              <button
                type="button"
                className="pm-save-button"
                disabled={
                  saving
                  || !editableRows.length
                  || !editTotals.valid
                  || totalMismatch
                }
                onClick={save}
              >
                {saving
                  ? 'Saving…'
                  : 'Save PM Forecast'}
              </button>
            </div>
          </div>
        )}
      </section>


      <section className="pm-history-section">
        <div className="section-heading compact pm-history-heading">
          <div>
            <span className="section-kicker">
              PM FORECAST HISTORY
            </span>

            <h3>
              Forecast history
            </h3>
          </div>

          <button
            type="button"
            className="text-button"
            onClick={
              () =>
                setHistoryOpen(
                  current =>
                    !current
                )
            }
          >
            {historyOpen
              ? 'Hide History'
              : `View History (${history.length})`}
          </button>
        </div>


        {historyOpen && (
          <div className="pm-history-list">
            {!history.length && (
              <div className="pm-forecast-message">
                No forecast versions have been saved yet.
              </div>
            )}

            {history.map(
              version => (
                <article
                  key={
                    version
                      .forecastVersionId
                  }
                  className="pm-history-card"
                >
                  <div className="pm-history-card-main">
                    <div>
                      <strong>
                        Version {
                          version
                            .versionNumber
                        }
                      </strong>

                      <span>
                        {version
                          .submittedByName
                          || 'Unknown'}
                        {' · '}
                        {fmtDateTime(
                          version
                            .submittedAtUTC
                        )}
                      </span>
                    </div>

                    <div className="pm-history-totals">
                      <span>
                        <small>
                          Baseline
                        </small>

                        <strong>
                          {fmtMoney(
                            version
                              .baselineSnapshotTotal
                          )}
                        </strong>
                      </span>

                      <span>
                        <small>
                          PM Forecast
                        </small>

                        <strong>
                          {fmtMoney(
                            version
                              .pmForecastTotal
                          )}
                        </strong>
                      </span>

                      <span
                        className={
                          varianceClass(
                            version
                              .pmVsBaselineTotalVariance
                          )
                        }
                      >
                        <small>
                          Difference
                        </small>

                        <strong>
                          {fmtMoney(
                            version
                              .pmVsBaselineTotalVariance
                          )}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {version.notes && (
                    <p className="pm-history-note">
                      {version.notes}
                    </p>
                  )}
                </article>
              )
            )}
          </div>
        )}
      </section>
    </>
  );
}
