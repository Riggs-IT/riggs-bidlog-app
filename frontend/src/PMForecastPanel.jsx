import {InfoButton, RefreshButton, ShowControls} from './ViewControls.jsx';
import './ReviewControls.css';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createLatestRead, readOptions, watchVisibleReads } from './browserFreshness.js';


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
    'Projection editing is still limited to the controlled test project.',

  bid_log_pm_forecast_changed:
    'This projection changed after you opened it. Reload it before saving.',

  bid_log_pm_forecast_month_locked:
    'One of these months is now locked. Reload the projection before saving.',

  bid_log_pm_forecast_total_mismatch:
    'The projection total must match the system estimate total.',

  bid_log_pm_forecast_baseline_not_ready:
    'This project does not have a complete system estimate yet.',

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
    const error = new Error(errorText(payload?.detail));
    error.status = response.status;
    error.detail = payload?.detail;
    throw error;
  }

  return payload;
}


export default function PMForecastPanel({
  project,
  monthlyRows,
  user,
  onAttentionChanged,
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
    editMode,
    setEditMode,
  ] = useState('pm');

  const [
    correctionReason,
    setCorrectionReason,
  ] = useState('');

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


  const [baselineComparison, setBaselineComparison] = useState(false);
  const [showRunningTotals, setShowRunningTotals] = useState(false);
  const [latestNoteOpen, setLatestNoteOpen] = useState(false);
  const showBaseline = !forecast?.hasPmForecast || baselineComparison;
  useEffect(() => { setBaselineComparison(false); setShowRunningTotals(false); setLatestNoteOpen(false); }, [project?.jobListId]);

  const [refreshError, setRefreshError] = useState(null);
  const draftBusy = useRef(false);
  const mutationBusy = useRef(false);
  const onChangedRef = useRef(onAttentionChanged);
  onChangedRef.current = onAttentionChanged;
  draftBusy.current = editing || saving || policySaving;
  const projectId = project?.jobListId;
  const reader = useMemo(() => {
    const owner = { alive: false };
    owner.read = createLatestRead({
      read: async config => {
        const base = `/api/current-projects/${projectId}/pm-forecast`;
        const [forecastPayload, historyPayload, policyPayload] = await Promise.all([
          fetchJson(base, readOptions(config)),
          fetchJson(`${base}/history`, readOptions(config)),
          fetchJson(`${base}/policy`, readOptions(config)),
        ]);
        if (!forecastPayload || !Array.isArray(forecastPayload.items)
            || !Array.isArray(historyPayload?.items) || !policyPayload) {
          throw new Error('Projection data returned an invalid response.');
        }
        return { forecastPayload, historyPayload, policyPayload };
      },
      publish: (data, config) => {
        if (!owner.alive || (draftBusy.current && !config.afterSave)) return false;
        setForecast(data.forecastPayload);
        setHistory(data.historyPayload.items);
        setPolicy(data.policyPayload);
        setError(null);
        setRefreshError(null);
      },
      failed: (err, config) => {
        if (!owner.alive || (draftBusy.current && !config.afterSave)) return;
        if (err?.status === 401) {
          window.location.replace(err.detail === 'application_updated'
            ? '/?auth_error=application_updated' : '/?signed_out=timeout');
          return;
        }
        if (config.afterSave && !config.quiet) {
          setError('Projection saved, but the read-back failed. Retry the read below; do not repeat the save.');
        } else if (config.quiet) {
          setRefreshError('Could not refresh projection data. Last loaded values are shown.');
        } else setError(err.message || 'Unable to load billing projections.');
      },
    });
    return owner;
  }, [projectId]);

  const load = async ({ quiet = false, ...config } = {}) => {
    if (!projectId || !reader.alive || (draftBusy.current && !config.afterSave)) return;
    if (!quiet) setLoading(true);
    try { return await reader.read.load({ quiet, ...config }); }
    finally { if (reader.alive && !reader.read.pending && !quiet) setLoading(false); }
  };
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    reader.alive = true;
    draftBusy.current = false;
    mutationBusy.current = false;
    setForecast(null);
    setHistory([]);
    setPolicy(null);
    setError(null);
    setRefreshError(null);
    setEditing(false);
    setEditMode('pm');
    setCorrectionReason('');
    setEdits({});
    setNotes('');
    setSaving(false);
    setPolicySaving(false);
    setSaveError(null);
    setPolicyError(null);
    setHistoryOpen(false);
    void loadRef.current({ passive: true });
    return () => { reader.alive = false; reader.read.cancel(); };
  }, [reader]);

  useEffect(() => {
    if (!projectId || editing || saving || policySaving) return undefined;
    return watchVisibleReads(config => loadRef.current({ quiet: true, ...config }), {
      allowed: () => reader.alive && !draftBusy.current,
    });
  }, [reader, projectId, editing, saving, policySaving]);

  function notifyProjectionChanged() {
    // A failed portfolio/attention refresh cannot turn a completed write into
    // a retryable save error. Both independent readers display their errors.
    void Promise.resolve().then(() => onChangedRef.current?.()).catch(() => {});
  }

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
              Object.prototype.hasOwnProperty.call(row, 'systemBaselineAmount')
                ? row.systemBaselineAmount : row.projectedAmount,

            pmForecastAmount:
              row.hasPmForecast ? row.pmForecastAmount : null,

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
    user?.canEditBilling
    === true;



  const isAdmin =
    role === 'ADMIN';

  const canEdit =
    canSubmit
    && !loading
    && !saving
    && !policySaving
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


  const isAdminCorrection =
    editMode === 'admin';

  const totalMismatch =
    Boolean(
      policy
        ?.requireBaselineTotalMatch

      && !isAdminCorrection

      && Math.abs(
           editTotals.difference
         ) >= 0.005
    );

  const adminCreatesVariance =
    Boolean(
      isAdminCorrection

      && Math.abs(
           editTotals.difference
         ) >= 0.005
    );


  const changeTotalSetting = async () => {
    if (
      !isAdmin
      || !policy
      || policySaving
      || mutationBusy.current
    ) {
      return;
    }


    const nextValue =
      !policy
        .requireBaselineTotalMatch;


    reader.read.cancel();
    mutationBusy.current = true;
    draftBusy.current = true;
    setPolicySaving(true);
    setPolicyError(null);


    try {
      const updated =
        await fetchJson(
          `/api/current-projects/${project.jobListId}/pm-forecast/policy`,
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


      notifyProjectionChanged();
      if (!reader.alive) return;
      setPolicy(
        updated
      );
      if (!editing) await load({ replace: true, passive: true, quiet: true, afterSave: true });

    } catch (err) {
      if (!reader.alive) return;
      setPolicyError(
        err.message
        || 'Unable to update the projection total setting.'
      );

    } finally {
      if (reader.alive) {
        mutationBusy.current = false;
        draftBusy.current = editing;
        setPolicySaving(false);
      }
    }
  };


  const beginEdit = (
    mode = 'pm',
  ) => {
    reader.read.cancel();
    draftBusy.current = true;
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
    setCorrectionReason('');
    setEditMode(mode);

    setEditing(true);
  };


  const beginAdminCorrection = () => {
    if (
      !isAdmin
      || !latest
    ) {
      return;
    }

    beginEdit(
      'admin'
    );
  };


  const cancelEdit = () => {
    draftBusy.current = false;
    setEditing(false);
    setEditMode('pm');
    setCorrectionReason('');
    setEdits({});
    setNotes('');
    setSaveError(null);
  };


  const save = async () => {
    if (saving || policySaving || mutationBusy.current || !editing) return;
    mutationBusy.current = true;
    reader.read.cancel();
    draftBusy.current = true;
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
          'The projection total must match the system estimate total.'
        );
      }

      if (
        isAdminCorrection
        && !latest?.forecastVersionId
      ) {
        throw new Error(
          'An Admin Correction requires an existing projection version.'
        );
      }

      if (
        isAdminCorrection
        && !correctionReason.trim()
      ) {
        throw new Error(
          'Enter a reason for the Admin Correction.'
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

      const endpoint =
        isAdminCorrection
          ? (
              `/api/current-projects/${project.jobListId}/pm-forecast/admin-correction`
            )
          : (
              `/api/current-projects/${project.jobListId}/pm-forecast`
            );

      const payload = {
        items,

        notes:
          notes.trim()
          || null,

        expectedLatestForecastVersionId:
          latest
            ?.forecastVersionId
          ?? null,

        ...(
          isAdminCorrection
            ? {
                correctionReason:
                  correctionReason.trim(),
              }
            : {}
        ),
      };

      await fetchJson(
        endpoint,
        {
          method:
            'POST',

          headers:
            requestHeaders(),

          body:
            JSON.stringify(
              payload
            ),
        },
      );

      notifyProjectionChanged();
      if (!reader.alive) return;
      setEditing(false);
      setEditMode('pm');
      setCorrectionReason('');
      setEdits({});
      setNotes('');

      await load({ replace: true, passive: true, afterSave: true });

    } catch (err) {
      if (!reader.alive) return;
      setSaveError(
        err.message
        || 'Unable to save the billing projection.'
      );

    } finally {
      if (reader.alive) {
        mutationBusy.current = false;
        setSaving(false);
      }
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
              <div className="pm-forecast-heading-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    () =>
                      beginEdit('pm')
                  }
                  disabled={
                    !editableRows.length
                  }
                >
                  Revise Projections
                </button>

                {isAdmin
                  && latest
                  && (
                    <button
                      type="button"
                      className="secondary-button pm-admin-correction-button"
                      onClick={
                        beginAdminCorrection
                      }
                      disabled={
                        !editableRows.length
                      }
                    >
                      Admin Correction
                    </button>
                  )}
              </div>
            )}
        </div>


        {refreshError && <div className="pm-forecast-message error" role="status">{refreshError}</div>}
        {!editing && (error || refreshError) && <RefreshButton label="Retry projection read" busy={loading}
          disabled={saving || policySaving} onClick={() => void load({replace:true})} />}

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
              {!isAdmin && forecast.hasPmForecast && latest?.submittedAtUTC && (
                <div className="pm-forecast-status-line">
                  <span>Projection updated {fmtDateTime(latest.submittedAtUTC)}</span>
                </div>
              )}


              {isAdmin && policy && (
                <div className="pm-policy-admin-control">
                  <div className="pm-policy-admin-copy">
                    <span className="pm-policy-admin-kicker">
                      PROJECTION BALANCE
                    </span>

                    <strong>
                      {policy.requireBaselineTotalMatch
                        ? 'Projection total must stay balanced'
                        : 'PM projection total can change'}
                    </strong>

                    <small>
                      {policy.requireBaselineTotalMatch
                        ? "Move dollars between editable months, but keep their total equal to the project's overall projection amount."
                        : 'You can change both the timing and total projected dollars.'}
                    </small>

                    <small className="pm-policy-updated">
                      {policy.policySource === 'PROJECT'
                        ? (
                            <>
                              Project setting
                              {policy.projectPolicyUpdatedByName
                                ? (
                                    <>
                                      {' · '}
                                      Last changed by {
                                        policy.projectPolicyUpdatedByName
                                      }
                                      {' · '}
                                      {
                                        fmtDateTime(
                                          policy.projectPolicyUpdatedAtUTC
                                        )
                                      }
                                    </>
                                  )
                                : null}
                            </>
                          )
                        : 'Company default'}
                      {forecast.hasPmForecast && latest?.submittedAtUTC
                        ? (
                            <>
                              {' · '}Projection updated {fmtDateTime(latest.submittedAtUTC)}
                            </>
                          )
                        : null}
                    </small>
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


        <div className="pm-comparison-controls">
          <ShowControls baseline={baselineComparison} onBaseline={forecast?.hasPmForecast ? setBaselineComparison : undefined}
            running={showRunningTotals} onRunning={setShowRunningTotals} />
        </div>

        <div className="billing-monthly-table-wrap">
          <table className="billing-monthly-table pm-accountability-table">
            <thead>
              <tr>
                <th>Month</th>

                {showBaseline && <th className="numeric">System Baseline</th>}

                <th className="numeric">
                  PM Projection
                </th>

                <th className="numeric">
                  Actual Billings
                </th>

                <th className="numeric" title="Actual Billings minus the selected projection">Difference</th>
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

                      {showBaseline && <td className="numeric">
                        <strong>
                          {fmtMoney(
                            row.baseline
                          )}
                        </strong>

                        {showRunningTotals && <small>
                          Running total {
                            fmtMoney(
                              row.runningBaseline
                            )
                          }
                        </small>}
                      </td>}

                      <td className="numeric pm-forecast-cell">
                        {inlineEdit
                          ? (
                            <div className="pm-inline-edit-control">
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

                              {(showBaseline &&
                                edits[
                                  row.monthStart
                                ] !== ''
                                && Number.isFinite(
                                  Number(
                                    edits[
                                      row.monthStart
                                    ]
                                  )
                                )
                                && Math.abs(
                                  Number(
                                    edits[
                                      row.monthStart
                                    ]
                                  )
                                  -
                                  Number(
                                    row.baseline
                                    ?? 0
                                  )
                                ) >= 0.005
                              ) && (
                                <button
                                  type="button"
                                  className="pm-inline-reset-button"
                                  disabled={saving}
                                  title="Reset to System Baseline"
                                  aria-label={
                                    `Reset ${fmtMonth(
                                      row.monthStart
                                    )} to System Baseline`
                                  }
                                  onClick={
                                    () =>
                                      setEdits(
                                        current => ({
                                          ...current,

                                          [row.monthStart]:
                                            Number(
                                              row.baseline
                                              ?? 0
                                            ).toFixed(2),
                                        })
                                      )
                                  }
                                >
                                  <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      d="M9 7H4v5"
                                    />
                                    <path
                                      d="M4.8 10.5A8 8 0 1 1 6.4 17"
                                    />
                                  </svg>
                                </button>
                              )}
                            </div>
                          )
                          : (
                            <strong>
                              {fmtMoney(
                                row.displayedPm
                              )}
                            </strong>
                          )}

                        {showRunningTotals && <small>
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
                        </small>}
                      </td>

                      <td className="numeric">
                        <strong>
                          {fmtMoney(
                            row.actual
                          )}
                        </strong>

                        {showRunningTotals && <small>
                          Running total {
                            fmtMoney(
                              row.runningActual
                            )
                          }
                        </small>}
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

                        {showRunningTotals && <small>
                          Running total {
                            fmtMoney(
                              row.runningVariance
                            )
                          }
                        </small>}
                      </td>
                    </tr>
                  );
                }
              )}

              {!rows.length && (
                <tr>
                  <td
                    colSpan={showBaseline ? 5 : 4}
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
                {isAdminCorrection
                  ? 'Admin Correction'
                  : (
                      forecast.hasPmForecast
                        ? 'Revise PM Projection'
                        : 'Start from System Estimate'
                    )}
              </strong>

              <span>
                {isAdminCorrection
                  ? 'Use this only for an intentional administrator adjustment. A reason is required, and an unresolved total variance will notify the assigned project team.'
                  : 'Adjust the months that look different from the current plan. Past locked months stay unchanged.'}
              </span>
            </div>


            <div className="pm-inline-totals">
              <div>
                <span>
                  Editable System Estimate
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
                The PM Projection total must equal the editable system estimate total.
              </div>
            )}

            {adminCreatesVariance && (
              <div className="pm-forecast-message warning">
                This Admin Correction will leave a {
                  fmtMoney(
                    editTotals.difference,
                    true,
                  )
                } difference from the editable system estimate. The assigned PM, APM, PE, and Superintendent will see a Needs Rebalance notification until Operations balances the projection.
              </div>
            )}

            {isAdminCorrection && (
              <label className="pm-inline-note pm-admin-correction-reason">
                <span>
                  Admin correction reason
                  <small>
                    Required
                  </small>
                </span>

                <textarea
                  rows="3"
                  maxLength="1000"
                  value={
                    correctionReason
                  }
                  disabled={
                    saving
                  }
                  placeholder="Why is this projection being changed by an administrator?"
                  onChange={
                    event =>
                      setCorrectionReason(
                        event
                          .target
                          .value
                      )
                  }
                />
              </label>
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
                  || (
                    isAdminCorrection
                    && !correctionReason.trim()
                  )
                }
                onClick={save}
              >
                {saving
                  ? 'Saving…'
                  : (
                      isAdminCorrection
                        ? 'Save Admin Correction'
                        : 'Save Projections'
                    )}
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

          <div className="pm-history-actions">
            {latest?.notes && !editing && (
              <InfoButton
                label="Latest projection note"
                expanded={latestNoteOpen}
                onClick={() => setLatestNoteOpen(current => !current)}
              />
            )}

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
        </div>

        {latestNoteOpen && latest?.notes && !editing && (
          <div className="pm-latest-note pm-latest-note-inline" role="note">
            <p>{latest.notes}</p>
          </div>
        )}


        {historyOpen && (
          <div className="pm-history-list">
            {!history.length && (
              <div className="pm-forecast-message">
                No projection versions have been saved yet.
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
                      <div className="pm-history-version-title">
                        <strong>
                          Version {
                            version
                              .versionNumber
                          }
                        </strong>

                        {version.forecastVersionType
                          === 'ADMIN_CORRECTION'
                          && (
                            <span className="pm-history-admin-badge">
                              ADMIN CORRECTION
                            </span>
                          )}
                      </div>

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

                  {version.correctionReason && (
                    <p className="pm-history-correction-reason">
                      <strong>
                        Admin reason:
                      </strong>
                      {' '}
                      {
                        version.correctionReason
                      }
                    </p>
                  )}

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
