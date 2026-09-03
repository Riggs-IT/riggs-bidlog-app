import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  commercialSourceLabel,
  ComparisonDetails,
  money,
  moneyDifference,
  MoneyValue,
  retentionLabel,
  retentionNumber,
} from './BillingDisplay.jsx';
import PMForecastPanel from './PMForecastPanel.jsx';
import OriginatingBidPanel from './OriginatingBidPanel.jsx';
import ChangeOrdersPanel from './ChangeOrdersPanel.jsx';


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


function projectionStatusMessage(
  state,
) {
  const messages = {
    EXCLUDED:
      'This project is not included in projected billings.',

    MISSING_AMOUNT:
      'Projection needs a project value.',

    MISSING_START_DATE:
      'Projection needs a projected start date.',

    MISSING_DURATION_OR_END:
      'Projection needs an estimated duration.',

    INVALID_DATE_RANGE:
      'Projected start and completion dates need review.',

    NOT_CONFIGURED:
      'Projection details have not been configured yet.',
  };


  return (
    messages[state]
    || null
  );
}


function varianceClass(value) {
  if (
    value === null
    || value === undefined
  ) {
    return '';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '';
  }

  if (number > 0) {
    return 'variance-positive';
  }

  if (number < 0) {
    return 'variance-negative';
  }

  return '';
}


function drawerBidEstimatorLabel(bid) {
  if (!bid) {
    return '—';
  }

  const names = [
    bid.primaryEstimator,
    bid.secondaryEstimator,
  ].filter(Boolean);

  return names.length
    ? names.join(' / ')
    : '—';
}


function drawerQuantityLabel(value) {
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
      maximumFractionDigits: 0,
    },
  ).format(number);
}


export default function CurrentProjectBillingDrawer({
  project,
  monthlyRows,
  user,
  onClose,
}) {
  const [
    originatingBidDetail,
    setOriginatingBidDetail,
  ] = useState(null);

  const [
    changeOrderDetail,
    setChangeOrderDetail,
  ] = useState(null);

  const [
    openProjectControl,
    setOpenProjectControl,
  ] = useState(null);

  const projectControlsRef =
    useRef(null);


  useEffect(
    () => {
      setOriginatingBidDetail(null);
      setChangeOrderDetail(null);
      setOpenProjectControl(null);
    },
    [project?.jobListId],
  );


  useEffect(
    () => {
      if (!openProjectControl) {
        return undefined;
      }

      const onPointerDown =
        event => {
          const activeControl =
            projectControlsRef.current
              ?.querySelector(
                `[data-project-control="${openProjectControl}"]`
              );

          if (
            activeControl
            && !activeControl.contains(
              event.target
            )
          ) {
            setOpenProjectControl(null);
          }
        };

      document.addEventListener(
        'pointerdown',
        onPointerDown,
      );

      return () => {
        document.removeEventListener(
          'pointerdown',
          onPointerDown,
        );
      };
    },
    [openProjectControl],
  );


  useEffect(
    () => {
      if (!project) {
        return undefined;
      }

      const onKeyDown =
        event => {
          if (
            event.key === 'Escape'
          ) {
            if (openProjectControl) {
              setOpenProjectControl(null);
              return;
            }

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
        document.body.style.overflow =
          previousOverflow;

        window.removeEventListener(
          'keydown',
          onKeyDown,
        );
      };
    },
    [
      project,
      onClose,
      openProjectControl,
    ],
  );

  if (!project) {
    return null;
  }


  const projectionMessage =
    projectionStatusMessage(
      project.forecastState
    );


  const isAdmin =
    String(
      user?.appRole
      || ''
    ).toUpperCase()
    === 'ADMIN';


  const effectiveBidEstimate =
    originatingBidDetail?.estimatedPrice
    ?? project.bidEstimatedPrice;


  const foundationVsCognito =
    moneyDifference(
      project.foundationOriginalContractAmount,
      project.cognitoContractAmount,
    );


  const foundationVsBid =
    moneyDifference(
      project.foundationOriginalContractAmount,
      effectiveBidEstimate,
    );


  const foundationVsProjection =
    moneyDifference(
      project.foundationOriginalContractAmount,
      project.projectionAmount,
    );


  const foundationRetention =
    retentionNumber(
      project.foundationRetentionPercent
    );


  const cognitoRetention =
    retentionNumber(
      project.cognitoRetention
    );


  const retentionDifference =
    (
      foundationRetention !== null
      && foundationRetention !== 0
      && cognitoRetention !== null
      && cognitoRetention !== 0
    )
      ? foundationRetention
        - cognitoRetention
      : null;


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
        className="billing-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-drawer-title"
      >
        <header className="billing-drawer-header">
          <div>
            <span className="section-kicker">
              ACTIVE PROJECT · PROJECTED BILLINGS
            </span>

            <h2 id="billing-drawer-title">
              {text(
                project.jobName
              )}
            </h2>

            <p>
              Job {text(project.jobNumber)}
            </p>
          </div>

          <button
            type="button"
            className="billing-drawer-close"
            onClick={onClose}
            aria-label="Close project billing detail"
          >
            ×
          </button>
        </header>


        <div className="billing-drawer-body">
          <section className="billing-drawer-meta billing-drawer-meta-five">
            <article className="billing-meta-card">
              <small className="billing-meta-label">
                PM
              </small>

              <strong>
                {text(
                  project.pm,
                  'TBD',
                )}
              </strong>
            </article>


            <article className="billing-meta-card">
              <small className="billing-meta-label">
                Estimator
              </small>

              {originatingBidDetail ? (
                <>
                  <strong>
                    {drawerBidEstimatorLabel(
                      originatingBidDetail
                    )}
                  </strong>

                  <small className="commercial-source-note">
                    Originating bid
                  </small>
                </>
              ) : (
                <strong className="drawer-tbd-value">
                  TBD
                </strong>
              )}
            </article>


            <article className="billing-meta-card">
              <small className="billing-meta-label">
                Purpose
              </small>

              <strong>
                {text(
                  project.purpose
                )}
              </strong>
            </article>


            <article className="billing-meta-card">
              <small className="billing-meta-label">
                GC
              </small>

              <strong>
                {text(
                  project.generalContractors
                )}
              </strong>
            </article>


            <article className="billing-meta-card billing-location-card">
              <small className="billing-meta-label">
                Location
              </small>

              <strong>
                {text(
                  project.streetAddress
                )}
              </strong>

              {project.cityStateZip && (
                <small>
                  {project.cityStateZip}
                </small>
              )}
            </article>
          </section>


          <section className="billing-characteristics-grid">
            <article>
              <span>
                Retention
              </span>

              <strong>
                {retentionLabel(
                  project.retention
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

                      value:
                        foundationRetention,

                      display:
                        retentionLabel(
                          project.foundationRetentionPercent
                        ),
                    },

                    {
                      label:
                        'Cognito',

                      value:
                        cognitoRetention,

                      display:
                        retentionLabel(
                          project.cognitoRetention
                        ),
                    },

                    {
                      label:
                        'Difference',

                      value:
                        retentionDifference,

                      display:
                        (
                          retentionDifference !== null
                            ? `${
                                retentionDifference.toFixed(2)
                              } pts`
                            : '—'
                        ),
                    },
                  ]}
                />
              )}
            </article>


            <article>
              <span>
                Estimated Margin
              </span>

              <strong>
                {retentionLabel(
                  project.estimatedMarginPercent
                )}
              </strong>

              <small className="commercial-source-note">
                Foundation revised
              </small>
            </article>


            <article>
              <span>
                CY
              </span>

              {originatingBidDetail ? (
                <>
                  <strong>
                    {drawerQuantityLabel(
                      originatingBidDetail.cubicYards
                    )}
                  </strong>

                  <small className="commercial-source-note">
                    Originating bid
                  </small>
                </>
              ) : (
                <strong className="drawer-tbd-value">
                  TBD
                </strong>
              )}
            </article>


            <article>
              <span>
                SF
              </span>

              {originatingBidDetail ? (
                <>
                  <strong>
                    {drawerQuantityLabel(
                      originatingBidDetail.squareFootage
                    )}
                  </strong>

                  <small className="commercial-source-note">
                    Originating bid
                  </small>
                </>
              ) : (
                <strong className="drawer-tbd-value">
                  TBD
                </strong>
              )}
            </article>
          </section>


          <section className="billing-kpi-grid billing-kpi-primary-grid">
            <article>
              <span>
                Original Contract
              </span>

              <strong>
                <MoneyValue
                  value={
                    project.originalContractAmount
                  }
                />
              </strong>

              <small className="commercial-source-note">
                {
                  commercialSourceLabel(
                    project.originalContractSource
                  )
                }
              </small>

              {isAdmin && (
                <ComparisonDetails
                  rows={[
                    {
                      label:
                        'Foundation',

                      value:
                        project.foundationOriginalContractAmount,

                      money: true,

                      display:
                        money(
                          project.foundationOriginalContractAmount
                        ),
                    },

                    {
                      label:
                        'Cognito',

                      value:
                        project.cognitoContractAmount,

                      money: true,

                      display:
                        money(
                          project.cognitoContractAmount
                        ),
                    },

                    {
                      label:
                        'Bid Estimate',

                      value:
                        effectiveBidEstimate,

                      money: true,

                      display:
                        money(
                          effectiveBidEstimate
                        ),
                    },

                    {
                      label:
                        'Projection Amount',

                      value:
                        project.projectionAmount,

                      money: true,

                      display:
                        money(
                          project.projectionAmount
                        ),
                    },

                    {
                      label:
                        'Foundation vs Cognito',

                      value:
                        foundationVsCognito,

                      money: true,

                      display:
                        money(
                          foundationVsCognito
                        ),
                    },

                    {
                      label:
                        'Foundation vs Bid',

                      value:
                        foundationVsBid,

                      money: true,

                      display:
                        money(
                          foundationVsBid
                        ),
                    },

                    {
                      label:
                        'Foundation vs Projection',

                      value:
                        foundationVsProjection,

                      money: true,

                      display:
                        money(
                          foundationVsProjection
                        ),
                    },
                  ]}
                />
              )}
            </article>


            <article>
              <span>
                Approved Change Orders
              </span>

              {changeOrderDetail ? (
                <>
                  <strong>
                    <MoneyValue
                      value={
                        changeOrderDetail.netCostAdjustment
                      }
                    />
                  </strong>

                  <small className="commercial-source-note">
                    Foundation · Net Cost Adjustment
                  </small>
                </>
              ) : (
                <strong className="drawer-tbd-value">
                  TBD
                </strong>
              )}
            </article>


            <article>
              <span>
                Projected To Date
              </span>

              <strong>
                <MoneyValue
                  value={
                    project.projectedToDate
                  }
                />
              </strong>
            </article>


            <article>
              <span>
                Actual To Date
              </span>

              <strong>
                <MoneyValue
                  value={
                    project.actualToDate
                  }
                />
              </strong>
            </article>
          </section>


          <section className="billing-kpi-grid billing-kpi-secondary-grid">
            <article
              className={
                varianceClass(
                  project.varianceToDate
                )
              }
            >
              <span>
                Variance To Date
              </span>

              <strong>
                <MoneyValue
                  value={
                    project.varianceToDate
                  }
                />
              </strong>
            </article>


            <article>
              <span>
                Remaining Amount
              </span>

              <strong>
                <MoneyValue
                  value={
                    project.remainingAmount
                  }
                />
              </strong>
            </article>


            <article>
              <span>
                Projected Completion
              </span>

              <strong className="date-kpi">
                {dateLabel(
                  project.projectedCompletionDate
                )}
              </strong>
            </article>
          </section>


          <section className="billing-assumptions projection-details-section">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">
                  PROJECT CONTROLS
                </span>

                <h3>
                  Forecast Configuration
                </h3>
              </div>
            </div>


            <div
              className="project-setup-flags"
              ref={projectControlsRef}
            >
              <div className="project-setup-flag">
                <span className="billing-detail-label">
                  Billing Curve
                </span>

                <div className="project-setup-flag-row">
                  <strong className="project-setup-tag">
                    {project.curveDisplayName
                      || 'Not configured'}
                  </strong>

                  <details
                    className="billing-curve-help project-setup-help"
                    data-project-control="curve"
                    open={
                      openProjectControl
                      === 'curve'
                    }
                    onToggle={
                      event => {
                        if (
                          event.currentTarget.open
                        ) {
                          setOpenProjectControl(
                            'curve'
                          );
                        } else if (
                          openProjectControl
                          === 'curve'
                        ) {
                          setOpenProjectControl(null);
                        }
                      }
                    }
                  >
                    <summary
                      aria-label="What the billing curve means"
                      title="What the billing curve means"
                    >
                      ⓘ
                    </summary>

                    <div className="billing-curve-help-popover">
                      <strong>
                        What does the billing curve mean?
                      </strong>

                      <p>
                        The billing curve controls how the System Baseline distributes the project value across the expected project duration.
                      </p>

                      {project.curveDescription && (
                        <p>
                          {project.curveDescription}
                        </p>
                      )}
                    </div>
                  </details>
                </div>
              </div>


              <OriginatingBidPanel
                project={project}
                user={user}
                onBidLoaded={setOriginatingBidDetail}
                infoOpen={
                  openProjectControl
                  === 'originating-bid'
                }
                onInfoOpenChange={
                  open => {
                    setOpenProjectControl(
                      current => {
                        if (open) {
                          return 'originating-bid';
                        }

                        return (
                          current
                          === 'originating-bid'
                            ? null
                            : current
                        );
                      }
                    );
                  }
                }
              />


              <ChangeOrdersPanel
                project={project}
                onLoaded={setChangeOrderDetail}
                infoOpen={
                  openProjectControl
                  === 'change-orders'
                }
                onInfoOpenChange={
                  open => {
                    setOpenProjectControl(
                      current => {
                        if (open) {
                          return 'change-orders';
                        }

                        return (
                          current
                          === 'change-orders'
                            ? null
                            : current
                        );
                      }
                    );
                  }
                }
              />
            </div>


            {projectionMessage && (
              <div className="projection-attention-message">
                {projectionMessage}
              </div>
            )}


            <div className="billing-assumption-grid projection-detail-grid">
              <div>
                <span>
                  Projected Start Date
                </span>

                <strong>
                  {dateLabel(
                    project.effectiveStartDate
                  )}
                </strong>
              </div>


              <div>
                <span>
                  Estimated Duration
                </span>

                <strong>
                  {project.estimatedDurationMonths
                    ? (
                        `${project.estimatedDurationMonths} months`
                      )
                    : '—'}
                </strong>
              </div>


              <div>
                <span>
                  Projected Completion Date
                </span>

                <strong>
                  {dateLabel(
                    project.projectedCompletionDate
                  )}
                </strong>
              </div>


              <div>
                <span>
                  Foundation Billing History
                </span>

                <strong>
                  {
                    project.foundationBillingMonthCount
                    || 0
                  } months
                </strong>
              </div>


              <div>
                <span>
                  Future Projected Billings
                </span>

                <strong>
                  {money(
                    project.futureProjectedAmount
                  )}
                </strong>
              </div>
            </div>
          </section>


          
          <PMForecastPanel
            project={project}
            monthlyRows={monthlyRows}
            user={user}
          />

        </div>
      </aside>
    </div>
  );
}
