import {
  useEffect,
  useMemo,
  useState,
} from 'react';


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

  const text = String(value).slice(0, 10);

  const date = new Date(
    `${text}T12:00:00`,
  );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return text;
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


function monthLabel(value) {
  if (!value) {
    return '—';
  }

  const text = String(value).slice(0, 10);

  const date = new Date(
    `${text}T12:00:00`,
  );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return text;
  }

  return new Intl.DateTimeFormat(
    'en-US',
    {
      month: 'short',
      year: 'numeric',
    },
  ).format(date);
}


function displayValue(
  value,
  fallback = '—',
) {
  const text = String(
    value ?? '',
  ).trim();

  return text || fallback;
}


function sourceLabel(value) {
  const labels = {
    OPERATIONS_PLANNED_START:
      'Operations planned start',

    OPERATIONS_ANTICIPATED_START:
      'Operations anticipated start',

    OPERATIONS_COMPLETION:
      'Operations completion',

    FOUNDATION_BILLING_DERIVED:
      'Foundation-derived',

    OPERATIONS:
      'Operations',

    MIXED:
      'Mixed source',

    INVALID_DATE_RANGE:
      'Invalid date range',

    INCOMPLETE:
      'Incomplete',
  };

  if (
    String(value || '')
      .startsWith(
        'DERIVED_FROM_'
      )
  ) {
    return sourceLabel(
      String(value).replace(
        'DERIVED_FROM_',
        '',
      ),
    );
  }

  return (
    labels[value]
    || value
    || '—'
  );
}


function sourceTone(value) {
  if (
    String(value || '')
      .includes(
        'FOUNDATION'
      )
  ) {
    return 'derived';
  }

  if (
    value === 'INVALID_DATE_RANGE'
    || value === 'INCOMPLETE'
  ) {
    return 'warning';
  }

  return 'operations';
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

  let detail =
    'data_api_unavailable';

  try {
    const payload =
      await response.json();

    detail =
      payload?.detail
      || detail;
  } catch {
    // Keep default error.
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
    || 'Unable to load completed-project billing.',
  );
}


function DataPill({
  children,
  tone = 'neutral',
}) {
  return (
    <span
      className={
        `completed-data-pill ${tone}`
      }
    >
      {children}
    </span>
  );
}


function DetailValue({
  label,
  value,
  subtext,
  source,
}) {
  return (
    <div className="completed-detail-value">
      <span>{label}</span>

      <strong>
        {value}
      </strong>

      {source && (
        <DataPill
          tone={
            sourceTone(
              source
            )
          }
        >
          {sourceLabel(
            source
          )}
        </DataPill>
      )}

      {subtext && (
        <small>
          {subtext}
        </small>
      )}
    </div>
  );
}


export default function CompletedProjectBillingDrawer({
  project,
  onClose,
}) {
  const [monthly, setMonthly] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);


  useEffect(() => {
    if (!project) {
      return undefined;
    }

    let cancelled = false;

    async function loadMonthly() {
      setLoading(true);
      setError(null);

      try {
        const payload =
          await fetchJson(
            (
              '/api/completed-projects/'
              + `${project.jobListId}/monthly`
            ),
          );

        if (!cancelled) {
          setMonthly(
            Array.isArray(
              payload?.items
            )
              ? payload.items
              : [],
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError.message
            || 'Unable to load monthly billing.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMonthly();

    return () => {
      cancelled = true;
    };
  }, [
    project,
  ]);


  useEffect(() => {
    if (!project) {
      return undefined;
    }

    function handleKeyDown(
      event,
    ) {
      if (
        event.key === 'Escape'
      ) {
        onClose();
      }
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    window.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, [
    project,
    onClose,
  ]);


  const actualTotal = useMemo(
    () => monthly.reduce(
      (
        total,
        row,
      ) => (
        total
        + toNumber(
            row.actualAmount
          )
      ),
      0,
    ),
    [monthly],
  );


  if (!project) {
    return null;
  }


  const estimatorNames = [
    project.primaryEstimator,
    project.secondaryEstimator,
  ]
    .filter(Boolean)
    .join(' · ');


  const hasEstimatorData =
    !project.missingEstimatorBidLink;


  const actualVsEstimate =
    (
      project.estimatorEstimatedAmount
      === null
      || project.estimatorEstimatedAmount
      === undefined
    )
      ? null
      : (
        toNumber(
          project.foundationActualTotal
        )
        -
        toNumber(
          project.estimatorEstimatedAmount
        )
      );


  return (
    <div
      className="completed-drawer-backdrop"
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
        className="completed-drawer"
        aria-label="Completed project billing detail"
      >
        <header className="completed-drawer-header">
          <div>
            <span className="section-kicker">
              COMPLETED PROJECT
            </span>

            <h2>
              {displayValue(
                project.jobName,
                'Unnamed Project',
              )}
            </h2>

            <p>
              Job {displayValue(
                project.jobNumber
              )}

              {project.generalContractor
                ? ` · ${project.generalContractor}`
                : ''}
            </p>
          </div>

          <button
            type="button"
            className="completed-drawer-close"
            onClick={onClose}
            aria-label="Close completed project detail"
          >
            ×
          </button>
        </header>


        <div className="completed-drawer-meta">
          <DataPill>
            {displayValue(
              project.projectType,
              'No Type',
            )}
          </DataPill>

          <DataPill>
            {displayValue(
              project.purpose,
              'No Purpose',
            )}
          </DataPill>

          {project.foundationDerivedStart && (
            <DataPill tone="derived">
              Foundation-derived start
            </DataPill>
          )}

          {project.foundationDerivedEnd && (
            <DataPill tone="derived">
              Foundation-derived completion
            </DataPill>
          )}

          {project.invalidResolvedDateRange && (
            <DataPill tone="warning">
              Invalid lifecycle dates
            </DataPill>
          )}

          {project.missingEstimatorBidLink && (
            <DataPill tone="warning">
              No historical bid link
            </DataPill>
          )}
        </div>


        <div className="completed-drawer-scroll">
          <section className="completed-kpi-grid">
            <DetailValue
              label="Contract"
              value={
                currency(
                  project.contractAmount
                )
              }
            />

            <DetailValue
              label="Foundation Billed"
              value={
                currency(
                  project.foundationActualTotal
                )
              }
              subtext={
                (
                  project.foundationBillingMonthCount
                  || 0
                )
                + ' billing months'
              }
            />

            <DetailValue
              label="Actual vs Contract"
              value={
                currency(
                  project.contractVsActualVariance
                )
              }
              subtext={
                (
                  toNumber(
                    project.contractVsActualVariance
                  ) > 0
                )
                  ? 'Actual billing above contract'
                  : (
                    toNumber(
                      project.contractVsActualVariance
                    ) < 0
                  )
                    ? 'Actual billing below contract'
                    : 'Actual equals contract'
              }
            />

            <DetailValue
              label="Resolved Duration"
              value={
                project.resolvedDurationDays
                  ? (
                    `${project.resolvedDurationDays.toLocaleString(
                      'en-US'
                    )} days`
                  )
                  : '—'
              }
              subtext={
                project.resolvedDurationMonthsApprox
                  ? (
                    `${Number(
                      project.resolvedDurationMonthsApprox
                    ).toFixed(1)} months`
                  )
                  : null
              }
              source={
                project.resolvedDurationSource
              }
            />
          </section>


          <section className="completed-drawer-section completed-benchmark-section">
            <div className="completed-section-heading">
              <div>
                <span className="section-kicker">
                  STANDARD BENCHMARK
                </span>

                <h3>
                  Standard Benchmark Curve
                </h3>
              </div>

              <span className="section-note">
                Retrospective Riggs standard
              </span>
            </div>

            <div className="completed-benchmark-card">
              <div className="completed-benchmark-heading">
                <div>
                  <strong>
                    {project.benchmarkCurveDisplayName
                      || 'Benchmark unavailable'}

                    {project.benchmarkCurveVersion && (
                      <span className="billing-curve-version">
                        {' · '}
                        v{project.benchmarkCurveVersion}
                      </span>
                    )}
                  </strong>

                  <span>
                    {project.benchmarkDistributionMethod
                      || 'NOT_CONFIGURED'}
                  </span>
                </div>

                <DataPill
                  tone={
                    project.benchmarkCurveSource
                    === 'PROJECT_TYPE_DEFAULT'
                      ? 'derived'
                      : 'neutral'
                  }
                >
                  {project.benchmarkCurveSource
                   === 'PROJECT_TYPE_DEFAULT'
                    ? `${project.projectType} standard`
                    : 'Straight Line fallback'}
                </DataPill>
              </div>

              <p>
                {project.benchmarkCurveDescription
                 || 'No benchmark description is available.'}
              </p>

              <small>
                This is the current Riggs standard benchmark
                for comparison. It is not being presented as
                the historical estimator forecast for this
                completed project.
              </small>
            </div>
          </section>


          <section className="completed-drawer-section">
            <div className="completed-section-heading">
              <div>
                <span className="section-kicker">
                  ACTUAL LIFECYCLE
                </span>

                <h3>
                  Project dates
                </h3>
              </div>

              <span className="section-note">
                Operations first · Foundation fallback
              </span>
            </div>

            <div className="completed-detail-grid">
              <DetailValue
                label="Resolved Start"
                value={
                  dateLabel(
                    project.resolvedStartDate
                  )
                }
                source={
                  project.resolvedStartSource
                }
              />

              <DetailValue
                label="Resolved End"
                value={
                  dateLabel(
                    project.resolvedEndDate
                  )
                }
                source={
                  project.resolvedEndSource
                }
              />

              <DetailValue
                label="First Foundation Billing"
                value={
                  dateLabel(
                    project.firstBillingActivityDate
                  )
                }
              />

              <DetailValue
                label="Last Foundation Billing"
                value={
                  dateLabel(
                    project.lastBillingActivityDate
                  )
                }
              />
            </div>

            {project.invalidResolvedDateRange && (
              <div className="completed-inline-warning">
                <strong>
                  Date review required.
                </strong>

                <span>
                  The resolved start occurs after the
                  recorded completion date. Billing data is
                  still shown, but duration is not calculated.
                </span>
              </div>
            )}
          </section>


          <section className="completed-drawer-section">
            <div className="completed-section-heading">
              <div>
                <span className="section-kicker">
                  ESTIMATOR ACCOUNTABILITY
                </span>

                <h3>
                  Historical estimate
                </h3>
              </div>

              <span className="section-note">
                Missing historical fields stay flagged
              </span>
            </div>

            {hasEstimatorData ? (
              <>
                <div className="completed-detail-grid">
                  <DetailValue
                    label="Estimator"
                    value={
                      estimatorNames
                      || 'Missing'
                    }
                  />

                  <DetailValue
                    label="Estimated Amount"
                    value={
                      currency(
                        project.estimatorEstimatedAmount
                      )
                    }
                    source={
                      project.estimatorAmountSource
                    }
                  />

                  <DetailValue
                    label="Estimator Start"
                    value={
                      dateLabel(
                        project.estimatorAnticipatedStartDate
                      )
                    }
                    source={
                      project.estimatorStartSource
                    }
                  />

                  <DetailValue
                    label="Estimator Duration"
                    value={
                      project.estimatorDurationMonths
                        ? (
                          `${project.estimatorDurationMonths} months`
                        )
                        : 'Missing'
                    }
                  />

                  <DetailValue
                    label="Actual vs Estimate"
                    value={
                      actualVsEstimate === null
                        ? '—'
                        : currency(
                            actualVsEstimate
                          )
                    }
                  />

                  <DetailValue
                    label="Awarded Bid"
                    value={
                      displayValue(
                        project.bidName
                      )
                    }
                    subtext={
                      project.bidDateAwarded
                        ? (
                          `Awarded ${dateLabel(
                            project.bidDateAwarded
                          )}`
                        )
                        : null
                    }
                  />
                </div>

                <div className="completed-estimator-flags">
                  {project.missingEstimatorIdentity && (
                    <DataPill tone="warning">
                      Estimator identity missing
                    </DataPill>
                  )}

                  {project.missingEstimatorAmount && (
                    <DataPill tone="warning">
                      Estimated amount missing
                    </DataPill>
                  )}

                  {project.missingEstimatorStart && (
                    <DataPill tone="warning">
                      Estimator start missing
                    </DataPill>
                  )}

                  {project.missingEstimatorDuration && (
                    <DataPill tone="warning">
                      Estimator duration missing
                    </DataPill>
                  )}
                </div>

                <div className="completed-derived-note">
                  <strong>
                    Historical timeline fallback
                  </strong>

                  <span>
                    When estimator timing is missing, this
                    project is ready to use the resolved
                    Operations/Foundation lifecycle for
                    comparison. The source remains visibly
                    labeled as derived.
                  </span>
                </div>
              </>
            ) : (
              <div className="completed-empty-panel">
                <strong>
                  Historical estimator snapshot unavailable
                </strong>

                <span>
                  No confirmed historical Bid Log relationship
                  exists for this completed project. Foundation
                  billing and the resolved project lifecycle
                  remain available for review.
                </span>
              </div>
            )}
          </section>


          <section className="completed-drawer-section">
            <div className="completed-section-heading">
              <div>
                <span className="section-kicker">
                  MONTHLY BILLING
                </span>

                <h3>
                  Foundation actuals
                </h3>
              </div>

              <span className="section-note">
                {monthly.length.toLocaleString(
                  'en-US'
                )} months
              </span>
            </div>

            {error && (
              <div
                className="page-alert"
                role="alert"
              >
                <strong>
                  Monthly billing could not be loaded.
                </strong>

                <span>
                  {error}
                </span>
              </div>
            )}

            {loading ? (
              <div className="completed-empty-panel">
                <strong>
                  Loading monthly billing…
                </strong>
              </div>
            ) : (
              <div className="completed-monthly-wrap">
                <table className="completed-monthly-table">
                  <thead>
                    <tr>
                      <th>
                        Month
                      </th>

                      <th className="numeric">
                        Foundation Actual
                      </th>

                      <th className="numeric">
                        Cumulative Actual
                      </th>

                      <th>
                        Timing
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {monthly.map(
                      row => (
                        <tr
                          key={
                            row.monthStart
                          }
                        >
                          <td>
                            <strong>
                              {monthLabel(
                                row.monthStart
                              )}
                            </strong>
                          </td>

                          <td className="numeric strong-cell">
                            {currency(
                              row.actualAmount
                            )}
                          </td>

                          <td className="numeric">
                            {currency(
                              row.cumulativeActualAmount
                            )}
                          </td>

                          <td>
                            {row.isAfterResolvedEnd ? (
                              <DataPill tone="warning">
                                After resolved completion
                              </DataPill>
                            ) : row.isBeforeResolvedStart ? (
                              <DataPill tone="derived">
                                Before resolved start
                              </DataPill>
                            ) : (
                              <span className="muted-value">
                                Active lifecycle
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    )}

                    {!monthly.length && (
                      <tr>
                        <td
                          colSpan="4"
                          className="empty-cell"
                        >
                          No monthly Foundation billing
                          timeline is available.
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {!!monthly.length && (
                    <tfoot>
                      <tr>
                        <td>
                          <strong>
                            Total
                          </strong>
                        </td>

                        <td className="numeric strong-cell">
                          {currency(
                            actualTotal
                          )}
                        </td>

                        <td className="numeric">
                          {currency(
                            monthly[
                              monthly.length - 1
                            ]?.cumulativeActualAmount
                          )}
                        </td>

                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
