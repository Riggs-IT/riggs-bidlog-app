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


const makeRequestId = () => {
  const cryptoApi =
    window.crypto;


  if (
    cryptoApi
    && typeof cryptoApi.randomUUID
       === 'function'
  ) {
    return cryptoApi.randomUUID();
  }


  if (
    cryptoApi
    && typeof cryptoApi.getRandomValues
       === 'function'
  ) {
    const bytes =
      new Uint8Array(16);

    cryptoApi.getRandomValues(
      bytes
    );

    bytes[6] =
      (bytes[6] & 0x0f)
      | 0x40;

    bytes[8] =
      (bytes[8] & 0x3f)
      | 0x80;


    const hex =
      Array.from(
        bytes,
        value =>
          value
            .toString(16)
            .padStart(2, '0')
      );


    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join(''),
    ].join('-');
  }


  /*
    Extremely old/non-WebCrypto browser:
    omit the browser request ID and allow the trusted
    Bid Log backend to generate one.
  */
  return null;
};


const requestHeaders = () => {
  const requestId =
    makeRequestId();

  return {
    'Content-Type':
      'application/json',

    ...(
      requestId
        ? {
            'X-Request-ID':
              requestId,
          }
        : {}
    ),
  };
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
    'This projection changed after you opened it. Reload it before saving.',

  bid_log_pm_forecast_month_locked:
    'One of these months is now locked. Reload the projection before saving.',

  bid_log_pm_forecast_total_mismatch:
    'The projection total must match the System Baseline total.',

  bid_log_pm_forecast_baseline_not_ready:
    'This project does not have a complete System Baseline yet.',

  bid_log_pm_forecast_user_not_authorized:
    'Your account is not authorized to edit this projection.',

  pm_forecast_writes_disabled:
    'Projection editing is not enabled yet.',

  bid_log_admin_required:
    'Only Bid Log administrators can change this setting.',
}[detail]
  || 'Unable to complete the projection request.');


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



  const [
    policySaving,
    setPolicySaving,
  ] = useState(false);

  const [
    policyError,
    setPolicyError,
  ] = useState(null);


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
        || 'Unable to load billing projections.'
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
      setPolicyError(null);
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
              displayedPm;

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
              || plan === null
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



  const isAdmin =
    role === 'ADMIN';

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


  const changeTotalSetting = async () => {
    if (
      !isAdmin
      || !policy
      || policySaving
    ) {
      return;
    }


    const nextValue =
      !policy
        .requireBaselineTotalMatch;


    setPolicySaving(true);
    setPolicyError(null);


    try {
      const updated =
        await fetchJson(
          '/api/pm-forecast/policy',
          {
            method:
              'PUT',

            headers:
              requestHeaders(),

            body:
              JSON.stringify({
                requireBaselineTotalMatch:
                  nextValue,
              }),
          },
        );


      setPolicy(
        updated
      );

    } catch (err) {
      setPolicyError(
        err.message
        || 'Unable to update the forecast total setting.'
      );

    } finally {
      setPolicySaving(false);
    }
  };


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
          'The projection total must match the System Baseline total.'
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
          'Projection amounts cannot be negative.'
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
              PM PROJECTIONS
            </span>

            <h3>
              Billing projections
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
                  ? 'Revise Projections'
                  : 'Revise Projections'}
              </button>
            )}
        </div>


        {loading && (
          <div className="pm-forecast-message">
            Loading billing projections…
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
                    ? 'PM Projection'
                    : 'Using System Baseline'}
                </strong>

                {forecast.hasPmForecast
                  && latest?.submittedAtUTC
                  && (
                    <>
                      <span>
                        ·
                      </span>

                      <span>
                        Updated {
                          fmtDateTime(
                            latest.submittedAtUTC
                          )
                        }
                      </span>
                    </>
                  )}
              </div>


              {isAdmin && policy && (
                <div className="pm-policy-admin-control">
                  <div className="pm-policy-admin-copy">
                    <span className="pm-policy-admin-kicker">
                      PROJECTION TOTAL SETTING
                    </span>

                    <strong>
                      Keep editable projection total equal to baseline
                    </strong>

                    <small>
                      Applies to all current-project PM projections. {
                        policy.requireBaselineTotalMatch
                          ? 'PMs can adjust billing timing between editable months, while the editable total stays aligned with the System Baseline.'
                          : 'PMs can adjust both billing timing and the remaining projection total.'
                      }
                    </small>

                    {policy.updatedByName && (
                      <small className="pm-policy-updated">
                        Last changed by {
                          policy.updatedByName
                        }
                        {' · '}
                        {
                          fmtDateTime(
                            policy.updatedAtUTC
                          )
                        }
                      </small>
                    )}
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={
                      policy.requireBaselineTotalMatch
                    }
                    className={
                      (
                        'pm-policy-switch '
                        + (
                            policy.requireBaselineTotalMatch
                              ? 'is-on'
                              : ''
                          )
                      )
                    }
                    disabled={
                      policySaving
                      || saving
                    }
                    onClick={
                      changeTotalSetting
                    }
                  >
                    <span className="pm-policy-switch-track">
                      <span className="pm-policy-switch-thumb" />
                    </span>

                    <strong>
                      {policySaving
                        ? 'Saving…'
                        : (
                            policy.requireBaselineTotalMatch
                              ? 'ON'
                              : 'OFF'
                          )}
                    </strong>
                  </button>
                </div>
              )}


              {policyError && (
                <div className="pm-forecast-message error">
                  {policyError}
                </div>
              )}


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
              MONTHLY BILLINGS
            </span>

            <h3>
              Projected vs Actual Billings
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
                  PM Projection
                </th>

                <th className="numeric">
                  Actual Billings
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
                                  )} PM Projection`
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
                    No System Baseline or actual billing rows are available for this project.
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
                  ? 'Revise PM Projection'
                  : 'Start from System Baseline'}
              </strong>

              <span>
                Adjust the months that look different from the current plan. Past locked months stay unchanged.
              </span>
            </div>


            <div className="pm-inline-totals">
              <div>
                <span>
                  Editable System Baseline
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
                  PM Projection
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
                The PM Projection total must equal the editable System Baseline total.
              </div>
            )}


            <label className="pm-inline-note">
              <span>
                Projection note
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
                  : 'Save Projections'}
              </button>
            </div>
          </div>
        )}
      </section>


      <section className="pm-history-section">
        <div className="section-heading compact pm-history-heading">
          <div>
            <span className="section-kicker">
              PM PROJECTION HISTORY
            </span>

            <h3>
              Projection history
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
                          PM Projection
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
