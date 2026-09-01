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
              ACTIVE PROJECT · BILLING ACCOUNTABILITY
            </span>

            <h2 id="billing-drawer-title">
              {text(
                project.jobName
              )}
            </h2>

            <p>
              Job {text(project.jobNumber)}
              {' · '}
              {text(
                project.generalContractors,
                'No GC listed',
              )}
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
          <section className="billing-drawer-meta">
            <span>
              <strong>PM</strong>
              {text(
                project.pm,
                'No PM assigned',
              )}
            </span>

            <span>
              <strong>Type</strong>
              {text(
                project.projectType
              )}
            </span>

            <span>
              <strong>Purpose</strong>
              {text(
                project.purpose
              )}
            </span>

            <span>
              <strong>Location</strong>
              {text(
                project.cityStateZip
              )}
            </span>
          </section>


          <section className="billing-kpi-grid">
            <article>
              <span>
                Contract / Forecast Amount
              </span>

              <strong>
                {money(
                  project.effectiveAmount
                )}
              </strong>
            </article>

            <article>
              <span>
                Expected To Date
              </span>

              <strong>
                {money(
                  project.projectedToDate
                )}
              </strong>
            </article>

            <article>
              <span>
                Foundation Actual To Date
              </span>

              <strong>
                {money(
                  project.actualToDate
                )}
              </strong>
            </article>

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


          <section className="billing-assumptions">
            <div className="section-heading compact">
              <div>
                <span className="section-kicker">
                  FORECAST ASSUMPTIONS
                </span>

                <h3>
                  What drives the baseline
                </h3>
              </div>

              <span
                className={
                  (
                    'billing-state '
                    + (
                      project.forecastReady
                        ? 'ready'
                        : ''
                    )
                  )
                }
              >
                {text(
                  project.forecastState,
                  'NOT_CONFIGURED',
                )}
              </span>
            </div>


            <div className="billing-assumption-grid">
              <div className="billing-assumption-curve">
                <span>
                  System Billing Curve
                </span>

                <strong>
                  {project.curveDisplayName
                    || 'Not configured'}

                  {project.curveVersion && (
                    <>
                      {' · '}
                      v{project.curveVersion}
                    </>
                  )}
                </strong>

                <small>
                  {project.distributionMethod
                    || 'NOT_CONFIGURED'}
                </small>

                {project.curveDescription && (
                  <p className="billing-assumption-curve-description">
                    {project.curveDescription}
                  </p>
                )}
              </div>

              <div>
                <span>Effective amount</span>

                <strong>
                  {money(
                    project.effectiveAmount
                  )}
                </strong>

                <small>
                  {sourceLabel(
                    project.amountSource
                  )}
                </small>
              </div>

              <div>
                <span>Effective start</span>

                <strong>
                  {dateLabel(
                    project.effectiveStartDate
                  )}
                </strong>

                <small>
                  {sourceLabel(
                    project.startDateSource
                  )}
                </small>
              </div>

              <div>
                <span>Duration</span>

                <strong>
                  {
                    project.estimatedDurationMonths
                      ? (
                          `${project.estimatedDurationMonths} months`
                        )
                      : '—'
                  }
                </strong>

                <small>
                  Forecast duration
                </small>
              </div>

              <div>
                <span>Completion</span>

                <strong>
                  {dateLabel(
                    project.projectedCompletionDate
                  )}
                </strong>

                <small>
                  {sourceLabel(
                    project.endDateSource
                  )}
                </small>
              </div>

              <div>
                <span>Foundation history</span>

                <strong>
                  {
                    project.foundationBillingMonthCount
                    || 0
                  } months
                </strong>

                <small>
                  {
                    project.hasFoundationBillingHistory
                      ? 'Billing history found'
                      : 'No billing history'
                  }
                </small>
              </div>

              <div>
                <span>Future expected</span>

                <strong>
                  {money(
                    project.futureProjectedAmount
                  )}
                </strong>

                <small>
                  After current month
                </small>
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
