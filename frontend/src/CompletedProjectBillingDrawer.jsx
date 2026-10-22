import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {completedAmount, completedContractSourceLabel} from './completedCommercial.js';
import CompletedBillingProgressChart from './CompletedBillingProgressChart.jsx';
import OriginatingBidPanel from './OriginatingBidPanel.jsx';
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
      'Ops',

    OPERATIONS_ANTICIPATED_START:
      'Ops',

    OPERATIONS_COMPLETION:
      'Ops',

    FOUNDATION_BILLING_DERIVED:
      'Foundation',

    OPERATIONS:
      'Ops',

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
  onBidLinked,
}) {
  const [monthly, setMonthly] =
    useState([]);

  const [monthlyForJobId, setMonthlyForJobId] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);

  // The originating-bid network read is needed only when historical context
  // is opened. The closed closeout report makes no additional link request.
  const [historicalContextOpen, setHistoricalContextOpen] = useState(false);


  useEffect(() => {
    if (!project) {
      return undefined;
    }

    let cancelled = false;

    async function loadMonthly() {
      setLoading(true);
      setError(null);
      setMonthlyForJobId(null);
      setMonthly([]);

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
          setMonthlyForJobId(project.jobListId);
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
    project?.jobListId,
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
              COMPLETED PROJECT · CLOSEOUT
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


        <div className="completed-closeout-context" aria-label="Project context">
          <div>
            <span>Project manager</span>
            <strong>{displayValue(project.projectManager, 'No PM assigned')}</strong>
          </div>
          <div>
            <span>Estimator</span>
            <strong>{estimatorNames || (project.missingEstimatorBidLink ? 'No linked bid' : 'Not recorded')}</strong>
          </div>
          <div>
            <span>Purpose</span>
            <strong>{displayValue(project.purpose)}</strong>
          </div>
          <div>
            <span>GC</span>
            <GeneralContractorDisplay
              value={project.generalContractor}
              fallback="Not recorded"
              compact
            />
          </div>
          <div className="completed-closeout-location">
            <span>Location</span>
            <strong>{displayValue(project.streetAddress, 'Not recorded')}</strong>
            {project.cityStateZip && <small>{project.cityStateZip}</small>}
          </div>
        </div>

        <div className="completed-drawer-scroll completed-closeout-report">
          <section className="completed-closeout-section completed-closeout-financial" aria-labelledby="closeout-contract-heading">
            <div className="completed-section-heading">
              <div>
                <span className="section-kicker">FINANCIAL CLOSEOUT</span>
                <h3 id="closeout-contract-heading">Contract reconciliation</h3>
              </div>
            </div>
            <div className="completed-closeout-contract-ledger">
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
                    project.contractAmountSource === 'COGNITO'
                      ? 'Ops'
                      : commercialSourceLabel(project.contractAmountSource)
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
                          'Ops Job Contract',

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
                          'Foundation Original vs Ops',

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
                    Foundation original is $0 · verify against Ops
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
                subtext={project.totalContractSource === 'COGNITO_FALLBACK'
                  ? completedContractSourceLabel(project.totalContractSource)
                  : null}
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
                        label: 'Ops Job Contract',
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
            </div>
            <div className="completed-closeout-financial-outcome">
              <DetailValue
                label="Actual Billings"
                moneyValue={project.foundationActualTotal}
                subtext={`${project.foundationBillingMonthCount || 0} billing months · Foundation`}
              />
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
            </div>
            <details className="completed-closeout-extra">
              <summary>Additional contract measure</summary>
              <DetailValue
                label="Contract Remaining"
                moneyValue={project.contractRemainingAmount}
                subtext="Total Contract − lifetime Actual Billings"
              />
            </details>
          </section>

          <section className="completed-drawer-section">
            <div className="completed-section-heading">
              <div>
                <span className="section-kicker">
                  MONTHLY BILLINGS
                </span>

                <h3>
                  Billing progression
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

            {monthlyForJobId === project.jobListId && !loading && !error && (
              <CompletedBillingProgressChart
                monthly={monthly}
                totalContract={project.totalContractAmount}
                expectedActual={project.foundationActualTotal}
              />
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
          <section className="completed-closeout-section completed-closeout-timing" aria-labelledby="closeout-timeline-heading">
            <div className="completed-section-heading">
              <div>
                <span className="section-kicker">PROJECT LIFECYCLE</span>
                <h3 id="closeout-timeline-heading">Timeline and billing dates</h3>
              </div>
              <span className="section-note">Ops first · Foundation fallback</span>
            </div>
            <div className="completed-closeout-duration">
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

          <section className="completed-closeout-section completed-closeout-terms" aria-labelledby="closeout-terms-heading">
            <div className="completed-section-heading">
              <div>
                <span className="section-kicker">TERMS &amp; QUANTITIES</span>
                <h3 id="closeout-terms-heading">Project reference</h3>
              </div>
            </div>
            <div className="completed-closeout-terms-list">
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
                    project.retentionSource === 'COGNITO'
                      ? 'Ops'
                      : commercialSourceLabel(project.retentionSource)
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
                          'Ops',

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
            </div>
          </section>

          <details
            className="completed-closeout-evidence"
            onToggle={event => setHistoricalContextOpen(event.currentTarget.open)}
          >
            <summary>
              <span>
                <strong>Supporting historical context</strong>
                <small>Benchmark curve and original bid record</small>
              </span>
              <span className="completed-closeout-evidence-caret" aria-hidden="true">⌄</span>
            </summary>
            <section className="completed-drawer-section completed-originating-bid-section">
              <div className="completed-section-heading">
                <div>
                  <span className="section-kicker">ORIGINAL BID RECORD</span>
                  <h3>Originating bid</h3>
                </div>
              </div>
              {historicalContextOpen && (
                <OriginatingBidPanel
                  project={project}
                  user={user}
                  projectKind="completed"
                  onLinked={onBidLinked}
                />
              )}
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
                      Ops/Foundation lifecycle for
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
          </details>
        </div>
      </aside>
    </div>
  );
}
