import {
  useEffect,
  useMemo,
} from 'react';

import PMForecastPanel from './PMForecastPanel.jsx';


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


function monthLabel(value) {
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
    return text(value);
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
}


function sourceLabel(value) {
  const labels = {
    OVERRIDE:
      'Forecast override',

    CONTRACT:
      'Job contract',

    JOB_PLANNED_START:
      'Planned start',

    JOB_ANTICIPATED_START:
      'Anticipated start',

    BID_ANTICIPATED_START_FALLBACK:
      'Bid start fallback',

    JOB_PLANNED_END:
      'Planned end',

    ESTIMATED_DURATION:
      'Estimated duration',

    MISSING:
      'Missing',
  };

  return (
    labels[value]
    || text(value)
  );
}


function retentionLabel(value) {
  if (
    value === null
    || value === undefined
    || String(value).trim() === ''
  ) {
    return 'TBT';
  }


  const raw =
    String(value).trim();


  if (raw.includes('%')) {
    return raw;
  }


  const number =
    Number(raw);


  if (!Number.isFinite(number)) {
    return raw;
  }


  const percent =
    number > 0
    && number <= 1
      ? number * 100
      : number;


  return `${
    new Intl.NumberFormat(
      'en-US',
      {
        maximumFractionDigits: 2,
      },
    ).format(percent)
  }%`;
}


function pmBadgeTextColor(
  hexColor,
) {
  const match =
    String(
      hexColor || ''
    )
      .trim()
      .match(
        /^#?([0-9a-f]{6})$/i
      );


  if (!match) {
    return '#ffffff';
  }


  const value =
    match[1];

  const red =
    parseInt(
      value.slice(0, 2),
      16,
    );

  const green =
    parseInt(
      value.slice(2, 4),
      16,
    );

  const blue =
    parseInt(
      value.slice(4, 6),
      16,
    );


  const luminance =
    (
      red * 299
      + green * 587
      + blue * 114
    ) / 1000;


  return luminance > 160
    ? '#111111'
    : '#ffffff';
}


function PMInitialsBadge({
  initials,
  hexColor,
}) {
  const value =
    String(
      initials || ''
    ).trim();


  if (!value) {
    return (
      <strong className="drawer-tbt-value">
        TBT
      </strong>
    );
  }


  const background =
    /^#[0-9a-f]{6}$/i.test(
      String(
        hexColor || ''
      ).trim()
    )
      ? String(
          hexColor
        ).trim()
      : '#4b5563';


  return (
    <span
      className="drawer-pm-badge"
      title="Project Manager"
      style={{
        backgroundColor:
          background,

        color:
          pmBadgeTextColor(
            background
          ),
      }}
    >
      {value}
    </span>
  );
}


function projectionAmountSourceLabel(
  source,
) {
  const labels = {
    JOB_CONTRACT_AMOUNT:
      'Contract Amount',

    CONTRACT:
      'Contract Amount',

    BID_ESTIMATED_PRICE_FALLBACK:
      'Bid Estimate',

    BID:
      'Bid Estimate',

    OVERRIDE:
      'Projection Override',
  };


  return (
    labels[
      String(
        source || ''
      ).trim().toUpperCase()
    ]
    || 'Projection Source'
  );
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


export default function CurrentProjectBillingDrawer({
  project,
  monthlyRows,
  user,
  onClose,
}) {
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
    ],
  );


  const rows =
    useMemo(
      () => {
        let cumulativeExpected = 0;
        let cumulativeActual = 0;

        return (
          monthlyRows || []
        ).map(
          row => {
            const expected =
              row.projectedAmount
                === null
                || row.projectedAmount
                  === undefined
                ? null
                : Number(
                    row.projectedAmount
                  );

            const actual =
              row.actualAmount
                === null
                || row.actualAmount
                  === undefined
                ? null
                : Number(
                    row.actualAmount
                  );

            if (
              Number.isFinite(
                expected
              )
            ) {
              cumulativeExpected +=
                expected;
            }

            if (
              Number.isFinite(
                actual
              )
            ) {
              cumulativeActual +=
                actual;
            }

            return {
              ...row,

              cumulativeExpected,
              cumulativeActual,

              cumulativeVariance:
                actual === null
                  ? null
                  : (
                      cumulativeActual
                      - cumulativeExpected
                    ),
            };
          }
        );
      },
      [
        monthlyRows,
      ],
    );


  if (!project) {
    return null;
  }


  const hasOriginalContract =
    project.originalContractAmount !== null
    && project.originalContractAmount !== undefined
    && String(
         project.originalContractAmount
       ).trim() !== '';


  const hasProjectionAmount =
    project.effectiveAmount !== null
    && project.effectiveAmount !== undefined
    && String(
         project.effectiveAmount
       ).trim() !== '';


  const originalContract =
    hasOriginalContract
      ? Number(
          project.originalContractAmount
        )
      : null;


  const projectionAmount =
    hasProjectionAmount
      ? Number(
          project.effectiveAmount
        )
      : null;


  const projectionBasisDiffers =
    originalContract !== null
    && projectionAmount !== null
    && Number.isFinite(
         originalContract
       )
    && Number.isFinite(
         projectionAmount
       )
    && Math.abs(
         originalContract
         - projectionAmount
       ) >= 0.005;


  const projectionMessage =
    projectionStatusMessage(
      project.forecastState
    );


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
                  'TBT',
                )}
              </strong>
            </article>


            <article className="billing-meta-card">
              <small className="billing-meta-label">
                Estimator
              </small>

              <strong className="drawer-tbt-value">
                TBT
              </strong>
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
            </article>


            <article>
              <span>
                CY
              </span>

              <strong className="drawer-tbt-value">
                TBT
              </strong>
            </article>


            <article>
              <span>
                SF
              </span>

              <strong className="drawer-tbt-value">
                TBT
              </strong>
            </article>
          </section>


          <section className="billing-kpi-grid billing-kpi-primary-grid">
            <article
              className={
                projectionBasisDiffers
                  ? 'projection-basis-warning'
                  : undefined
              }
            >
              <span>
                Original Contract
              </span>

              <strong>
                {hasOriginalContract
                  ? money(
                      project.originalContractAmount
                    )
                  : (
                      hasProjectionAmount
                        ? money(
                            project.effectiveAmount
                          )
                        : 'TBT'
                    )}
              </strong>


              {!hasOriginalContract
                && hasProjectionAmount
                && (
                  <small className="projection-source-note">
                    {
                      projectionAmountSourceLabel(
                        project.amountSource
                      )
                    }
                    {' · '}
                    used until contract amount is available
                  </small>
                )}


              {projectionBasisDiffers && (
                <small className="projection-source-note">
                  Projection uses {
                    money(
                      project.effectiveAmount
                    )
                  }
                  {' · '}
                  {
                    projectionAmountSourceLabel(
                      project.amountSource
                    )
                  }
                </small>
              )}
            </article>


            <article>
              <span>
                Approved Change Orders
              </span>

              <strong className="drawer-tbt-value">
                TBT
              </strong>
            </article>


            <article>
              <span>
                Projected To Date
              </span>

              <strong>
                {money(
                  project.projectedToDate
                )}
              </strong>
            </article>


            <article>
              <span>
                Actual To Date
              </span>

              <strong>
                {money(
                  project.actualToDate
                )}
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
                {money(
                  project.varianceToDate
                )}
              </strong>
            </article>


            <article>
              <span>
                Remaining Amount
              </span>

              <strong>
                {money(
                  project.remainingAmount
                )}
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
                  PROJECTION DETAILS
                </span>

                <h3>
                  Billing projection setup
                </h3>
              </div>
            </div>


            <div className="billing-curve-summary">
              <div>
                <span className="billing-detail-label">
                  Billing Curve
                </span>

                <strong className="billing-curve-tag">
                  {project.curveDisplayName
                    || 'Not configured'}
                </strong>
              </div>


              <details className="billing-curve-help">
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
