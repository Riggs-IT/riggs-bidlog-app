import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {completedAmount, completedContractSourceLabel} from './completedCommercial.js';
import {billingQuantityLabel, completedQuantitySourceNote} from './billingQuantities.js';
import {
  commercialSourceLabel,
  ComparisonDetails,
  money as currency,
  moneyDifference,
  MoneyValue,
  retentionLabel,
  retentionNumber,
} from './BillingDisplay.jsx';
import {
  GeneralContractorDisplay,
  generalContractorDisplayText,
} from './GeneralContractors.jsx';


function toNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
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
  moneyValue,
  subtext,
  source,
  children,
}) {
  return (
    <div className="completed-detail-value">
      <span>{label}</span>

      <strong>
        {moneyValue !== undefined
          ? (
              <MoneyValue
                value={
                  moneyValue
                }
              />
            )
          : value}
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

      {children}
    </div>
  );
}


export default function CompletedProjectBillingDrawer({
  project,
  user,
  onClose,
  onEditProject,
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


  const isAdmin =
    String(
      user?.appRole
      || ''
    ).toUpperCase()
    === 'ADMIN'
    || String(user?.appRole || '').trim().toUpperCase() === 'MANAGEMENT_ADMIN';


  // A genuine Foundation $0 is not missing. Flag the source conflict
  // without substituting Cognito for the financial contract.
  const zeroOriginalWithCognito =
    completedAmount(project.foundationOriginalContractAmount) === 0
    && completedAmount(project.cognitoContractAmount) > 0;

  const foundationVsCognito =
    moneyDifference(
      project.foundationOriginalContractAmount,
      project.cognitoContractAmount,
    );


  const foundationVsEstimator =
    moneyDifference(
      project.foundationOriginalContractAmount,
      project.estimatorEstimatedAmount,
    );


  const foundationRetention =
    retentionNumber(
      project.foundationRetentionPercent
    );


  const cognitoRetention =
    retentionNumber(
      project.cognitoRetention
    );


  const canOpenEditor = [
    'ADMIN',
    'OPERATIONS',
  ].includes(
    String(user?.appRole || '').trim().toUpperCase(),
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
                ? ` · ${generalContractorDisplayText(project.generalContractor)}`
                : ''}
            </p>
          </div>

          <div className="billing-drawer-header-actions">
            {canOpenEditor && onEditProject && (
              <button
                type="button"
                className="secondary-button billing-drawer-edit-button"
                onClick={() => onEditProject()}
              >
                Edit Project
              </button>
            )}

            <button
              type="button"
              className="completed-drawer-close"
              onClick={onClose}
              aria-label="Close completed project detail"
            >
              ×
            </button>
          </div>
        </header>


        <div className="completed-drawer-meta billing-drawer-meta-five">
          <article className="billing-meta-card">
            <small className="billing-meta-label">
              PM
            </small>

            <strong>
              {displayValue(
                project.projectManager,
                'No PM assigned',
              )}
            </strong>
          </article>


          <article className="billing-meta-card">
            <small className="billing-meta-label">
              Estimator
            </small>

            <strong>
              {estimatorNames
                || (project.missingEstimatorBidLink ? 'No linked bid' : 'Not recorded')}
            </strong>
          </article>


          <article className="billing-meta-card">
            <small className="billing-meta-label">
              Purpose
            </small>

            <strong>
              {displayValue(
                project.purpose
              )}
            </strong>
          </article>


          <article className="billing-meta-card">
            <small className="billing-meta-label">
              GC
            </small>

            <GeneralContractorDisplay
              value={project.generalContractor}
              fallback="Not recorded"
              compact
            />
          </article>


          <article className="billing-meta-card billing-location-card">
            <small className="billing-meta-label">
              Location
            </small>

            <strong>
              {displayValue(
                project.streetAddress,
                'Not recorded',
              )}
            </strong>

            {project.cityStateZip && (
              <small>
                {project.cityStateZip}
              </small>
            )}
          </article>
        </div>


        <div className="completed-drawer-scroll">
          <section className="billing-characteristics-grid">
            <article>
              <span>
                Retention
              </span>

              <strong>
                {retentionLabel(
                  project.retention,
                  'Not recorded'
                )}
              </strong>

              <small className="commercial-source-note">
                {
                  commercialSourceLabel(
                    project.retentionSource
                  )
                }
              </small>

              {isAdmin && (
                <ComparisonDetails
                  rows={[
                    {
                      label:
                        'Foundation',

                      display:
                        retentionLabel(
                          project.foundationRetentionPercent
                        ),
                    },

                    {
                      label:
                        'Cognito',

                      display:
                        retentionLabel(
                          project.cognitoRetention
                        ),
                    },

                    {
                      label:
                        'Difference',

                      display:
                        (
                          foundationRetention !== null
                          && cognitoRetention !== null
                            ? `${
                                (
                                  foundationRetention
                                  - cognitoRetention
                                ).toFixed(2)
                              } pts`
                            : '—'
                        ),
                    },
                  ]}
                />
              )}
            </article>


            {isAdmin && (
              <article>
                <span>
                  Historical Margin
                </span>

                {project.marginDataComplete ? (
                  <>
                    <strong>
                      {retentionLabel(
                        project.weightedHistoricalMarginPercent
                      )}
                    </strong>

                    <small className="commercial-source-note">
                      Weighted from Foundation billings
                    </small>
                  </>
                ) : (
                  <>
                    <strong className="drawer-tbd-value">
                      —
                    </strong>

                    <DataPill tone="warning">
                      Margin incomplete
                    </DataPill>
                  </>
                )}
              </article>
            )}


            <article>
              <span>
                CY
              </span>

              <strong>
                {billingQuantityLabel(project.cubicYards)}
              </strong>

              <small className="commercial-source-note">
                {completedQuantitySourceNote(project.cubicYards, project.missingEstimatorBidLink)}
              </small>
            </article>


            <article>
              <span>
                SF
              </span>

              <strong>
                {billingQuantityLabel(project.squareFootage)}
              </strong>

              <small className="commercial-source-note">
                {completedQuantitySourceNote(project.squareFootage, project.missingEstimatorBidLink)}
              </small>
            </article>
          </section>
          <section className="completed-kpi-grid completed-commercial-grid">
            <div className="completed-detail-value">
              <span>
                Original Contract
              </span>

              <strong>
                <MoneyValue
                  value={
                    project.contractAmount
                  }
                />
              </strong>

              <small className="commercial-source-note">
                {
                  commercialSourceLabel(
                    project.contractAmountSource
                  )
                }
              </small>

              {isAdmin && (
                <ComparisonDetails
                  showZeroAmounts
                  rows={[
                    {
                      label:
                        'Foundation Original',

                      value:
                        project.foundationOriginalContractAmount,

                      money: true,

                      display:
                        currency(
                          project.foundationOriginalContractAmount
                        ),
                    },

                    {
                      label:
                        'Cognito Job Contract',

                      value:
                        project.cognitoContractAmount,

                      money: true,

                      display:
                        currency(
                          project.cognitoContractAmount
                        ),
                    },

                    {
                      label:
                        'Historical Bid Estimate',

                      value:
                        project.estimatorEstimatedAmount,

                      money: true,

                      display:
                        currency(
                          project.estimatorEstimatedAmount
                        ),
                    },

                    {
                      label:
                        'Foundation Original vs Cognito',

                      value:
                        foundationVsCognito,

                      money: true,

                      display:
                        currency(
                          foundationVsCognito
                        ),
                    },

                    {
                      label:
                        'Foundation Original vs Estimate',

                      value:
                        foundationVsEstimator,

                      money: true,

                      display:
                        currency(
                          foundationVsEstimator
                        ),
                    },
                  ]}
                />
              )}

              {isAdmin && zeroOriginalWithCognito && (
                <DataPill tone="warning">
                  Foundation original is $0 · verify against Cognito
                </DataPill>
              )}
            </div>


            <DetailValue
              label="Approved Change Orders"
              moneyValue={project.approvedChangeOrderAmount}
              subtext={project.approvedChangeOrderAmount === null || project.approvedChangeOrderAmount === undefined
                ? 'Foundation CO evidence unavailable'
                : `Foundation · ${project.approvedChangeOrderCount ?? 0} approved CO${project.approvedChangeOrderCount === 1 ? '' : 's'}`}
            />

            <DetailValue
              label="Total Contract"
              moneyValue={project.totalContractAmount}
              subtext={completedContractSourceLabel(project.totalContractSource)}
            >
              {isAdmin && (
                <ComparisonDetails
                  showZeroAmounts
                  rows={[
                    {
                      label: 'Foundation Original',
                      value: project.foundationOriginalContractAmount,
                      money: true,
                      display: currency(project.foundationOriginalContractAmount),
                    },
                    {
                      label: 'Approved CO Income',
                      value: project.approvedChangeOrderAmount,
                      money: project.approvedChangeOrderAmount != null,
                      display: project.approvedChangeOrderAmount == null
                        ? 'Unavailable · no Foundation CO evidence'
                        : currency(project.approvedChangeOrderAmount),
                    },
                    {
                      label: 'Foundation Revised',
                      value: project.foundationRevisedContractAmount,
                      money: project.foundationRevisedContractAmount != null,
                      display: project.foundationRevisedContractAmount == null
                        ? 'Unavailable · no Foundation revised contract'
                        : currency(project.foundationRevisedContractAmount),
                    },
                    {
                      label: 'Cognito Job Contract',
                      value: project.cognitoContractAmount,
                      money: true,
                      display: currency(project.cognitoContractAmount),
                    },
                    {
                      label: 'Selected Total Contract',
                      value: project.totalContractAmount,
                      money: true,
                      display: currency(project.totalContractAmount),
                    },
                    {
                      label: 'Selected Source',
                      display: completedContractSourceLabel(project.totalContractSource),
                    },
                  ]}
                />
              )}
            </DetailValue>

            <DetailValue
              label="Contract Remaining"
              moneyValue={project.contractRemainingAmount}
              subtext="Total Contract − lifetime Actual Billings"
            />

            <DetailValue
              label="Actual Billings"
              moneyValue={project.foundationActualTotal}
              subtext={`${project.foundationBillingMonthCount || 0} billing months · Foundation`}
            />
          </section>

          <section className="completed-kpi-grid completed-financial-secondary-grid">
            {isAdmin && (
              <div className="completed-detail-value">
                <span>Margin Collected</span>
                <strong>
                  <MoneyValue value={project.marginCollectedTotal} />
                </strong>
                {project.marginDataComplete ? (
                  <small>
                    {retentionLabel(project.weightedHistoricalMarginPercent)} weighted historical margin
                  </small>
                ) : (
                  <DataPill tone="warning">Margin incomplete</DataPill>
                )}
              </div>
            )}

            <DetailValue
              label="Actual vs Total Contract"
              moneyValue={project.actualVsTotalContractVariance}
              subtext={project.actualVsTotalContractVariance === null || project.actualVsTotalContractVariance === undefined
                ? 'Revised-contract comparison unavailable'
                : toNumber(project.actualVsTotalContractVariance) > 0
                ? 'Actual billings above Total Contract'
                : toNumber(project.actualVsTotalContractVariance) < 0
                ? 'Actual billings below Total Contract'
                : 'Actual equals Total Contract'}
            />
          </section>


          <section className="completed-kpi-grid completed-lifecycle-summary-grid">
            <DetailValue
              label="Project Duration"
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
            />


            <DetailValue
              label="Project Start"
              value={
                dateLabel(
                  project.resolvedStartDate
                )
              }
            />


            <DetailValue
              label="Project Completion"
              value={
                dateLabel(
                  project.resolvedEndDate
                )
              }
            />


            <DetailValue
              label="Billing History"
              value={
                `${
                  project.foundationBillingMonthCount
                  || 0
                } months`
              }
            />
          </section>


          <section className="completed-drawer-section completed-benchmark-section">
            <div className="completed-section-heading">
              <div>
                <span className="section-kicker">
                  BILLING CURVE
                </span>

                <h3>
                  Standard billing benchmark
                </h3>
              </div>
            </div>


            <div className="billing-curve-summary completed-curve-summary">
              <div>
                <span className="billing-detail-label">
                  Billing Curve
                </span>

                <strong className="billing-curve-tag">
                  {project.benchmarkCurveDisplayName
                    || 'Not configured'}
                </strong>
              </div>


              <details className="billing-curve-help">
                <summary
                  aria-label="What the completed project billing curve means"
                  title="What the billing curve means"
                >
                  ⓘ
                </summary>

                <div className="billing-curve-help-popover">
                  <strong>
                    What does this curve mean?
                  </strong>

                  <p>
                    This is the current Riggs standard used to
                    compare a completed project's billing shape.
                    It is a retrospective benchmark, not a claim
                    about the projection used when this project
                    was originally estimated.
                  </p>

                  {project.benchmarkCurveDescription && (
                    <p>
                      {project.benchmarkCurveDescription}
                    </p>
                  )}
                </div>
              </details>
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
                  ESTIMATOR HISTORY
                </span>

                <h3>
                  Original estimate
                </h3>
              </div>

              <span className="section-note">
                Available historical Bid Log information
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
                    moneyValue={
                      project.estimatorEstimatedAmount
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
                    moneyValue={
                      actualVsEstimate
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
                  MONTHLY BILLINGS
                </span>

                <h3>
                  Actual Billings
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
                        Actual Billings
                      </th>

                      {isAdmin && (
                        <th className="numeric">
                          Margin Collected
                        </th>
                      )}

                      <th className="numeric">
                        Running Total
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
                            <MoneyValue
                              value={
                                row.actualAmount
                              }
                            />
                          </td>

                          {isAdmin && (
                            <td className="numeric strong-cell">
                              <MoneyValue
                                value={
                                  row.marginCollected
                                }
                              />

                              {row.marginDataComplete ? (
                                <small className="cell-subtext">
                                  {retentionLabel(
                                    row.weightedHistoricalMarginPercent
                                  )}
                                </small>
                              ) : (
                                <small className="cell-subtext">
                                  <span className="completed-data-pill warning">
                                    Margin incomplete
                                  </span>
                                </small>
                              )}
                            </td>
                          )}

                          <td className="numeric">
                            <MoneyValue
                              value={
                                row.cumulativeActualAmount
                              }
                            />
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
                          colSpan={isAdmin ? 5 : 4}
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
                          <MoneyValue
                            value={
                              actualTotal
                            }
                          />
                        </td>

                        {isAdmin && (
                          <td className="numeric strong-cell">
                            <MoneyValue
                              value={
                                project.marginCollectedTotal
                              }
                            />
                          </td>
                        )}

                        <td className="numeric">
                          <MoneyValue
                            value={
                              monthly[
                                monthly.length - 1
                              ]?.cumulativeActualAmount
                            }
                          />
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
