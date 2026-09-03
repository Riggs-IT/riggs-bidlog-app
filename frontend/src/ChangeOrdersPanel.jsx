import {
  useEffect,
  useMemo,
  useState,
} from 'react';


function money(
  value,
  signed = false,
) {
  if (
    value === null
    || value === undefined
    || value === ''
  ) {
    return '—';
  }

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  const formatted =
    new Intl.NumberFormat(
      'en-US',
      {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    ).format(number);

  if (
    signed
    && number > 0
  ) {
    return `+${formatted}`;
  }

  return formatted;
}


function dateLabel(value) {
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
    },
  ).format(parsed);
}


function requestErrorText(
  detail,
) {
  const messages = {
    bid_log_current_project_not_found:
      'The current project could not be found.',

    projected_billing_resource_not_found:
      'The current project could not be found.',

    missing_authenticated_user:
      'Your Bid Log session could not be verified.',

    data_api_unavailable:
      'Foundation change orders are temporarily unavailable.',

    sql_unavailable:
      'Foundation change orders are temporarily unavailable.',

    sql_capacity_unavailable:
      'Riggs data services are busy right now.',
  };

  return (
    messages[detail]
    || (
      detail
        ? String(
            detail
          ).replaceAll(
            '_',
            ' ',
          )
        : 'Unable to load Foundation change orders.'
    )
  );
}


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
    const error =
      new Error(
        requestErrorText(
          payload?.detail
        )
      );

    error.detail =
      payload?.detail;

    error.status =
      response.status;

    throw error;
  }

  return payload;
}


function itemNumber(item) {
  const preferred =
    item?.changeOrderNo
    ?? item?.changeOrderId;

  return preferred
    ? String(preferred)
    : '—';
}


function itemCostClass(value) {
  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return '';
  }

  if (number < 0) {
    return 'negative';
  }

  if (number > 0) {
    return 'positive';
  }

  return 'neutral';
}


function sortValue(item) {
  const value =
    Number(
      item?.changeOrderNo
    );

  return Number.isFinite(value)
    ? value
    : -1;
}


export default function ChangeOrdersPanel({
  project,
  onLoaded,
  infoOpen = false,
  onInfoOpenChange,
}) {
  const [
    data,
    setData,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState(null);

  useEffect(
    () => {
      if (!project?.jobListId) {
        setData(null);
        setError(null);
        setLoading(false);
        onLoaded?.(null);
        onInfoOpenChange?.(false);

        return undefined;
      }

      const controller =
        new AbortController();

      let cancelled = false;


      async function loadChangeOrders() {
        setLoading(true);
        setError(null);
        setData(null);
        onLoaded?.(null);
        onInfoOpenChange?.(false);

        try {
          const payload =
            await fetchJson(
              (
                '/api/current-projects/'
                + `${project.jobListId}`
                + '/change-orders'
              ),
              {
                signal:
                  controller.signal,
              },
            );

          if (!cancelled) {
            setData(payload);
            onLoaded?.(payload);
          }
        } catch (requestError) {
          if (
            !cancelled
            && requestError?.name
              !== 'AbortError'
          ) {
            setError(
              requestError?.message
              || 'Unable to load Foundation change orders.'
            );

            onLoaded?.(null);
          }
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      }


      loadChangeOrders();


      return () => {
        cancelled = true;

        controller.abort();
      };
    },
    [
      project?.jobListId,
    ],
  );


  const items =
    useMemo(
      () => {
        const source =
          Array.isArray(
            data?.items
          )
            ? data.items
            : [];

        return [
          ...source,
        ].sort(
          (
            left,
            right,
          ) => {
            const numberDifference =
              sortValue(right)
              - sortValue(left);

            if (numberDifference !== 0) {
              return numberDifference;
            }

            return itemNumber(
              right
            ).localeCompare(
              itemNumber(left)
            );
          },
        );
      },
      [
        data?.items,
      ],
    );


  let tagText =
    '0 COs';

  let tagClass =
    'neutral';


  if (loading) {
    tagText =
      'Loading…';
  } else if (error) {
    tagText =
      'Unavailable';

    tagClass =
      'error';
  } else if (
    data?.changeOrderCount > 0
  ) {
    tagText =
      `${data.changeOrderCount} CO${
        data.changeOrderCount === 1
          ? ''
          : 's'
      }`;

    tagClass =
      'change-orders-present';
  }


  return (
    <div className="project-setup-flag">
      <span className="billing-detail-label">
        Change Orders
      </span>

      <details
        className="change-orders-help"
        data-project-control="change-orders"
        open={infoOpen}
        onToggle={
          event => {
            onInfoOpenChange?.(
              event.currentTarget.open
            );
          }
        }
      >
        <summary
          className="change-orders-summary"
          aria-label="View Foundation change orders"
          title="View Foundation change orders"
        >
          <strong
            className={
              `project-setup-tag ${tagClass}`
            }
          >
            {tagText}
          </strong>

          <span
            className="project-setup-info-button"
            aria-hidden="true"
          >
            ⓘ
          </span>
        </summary>


        <div className="change-orders-popover">
          <div className="change-orders-popover-head">
            <div>
              <span>
                Foundation
              </span>

              <strong>
                Change Orders
              </strong>

              <small>
                Job {
                  data?.jobNumber
                  || project?.jobNumber
                  || '—'
                }
              </small>
            </div>
          </div>


          {loading && (
            <div className="change-orders-message">
              Loading Foundation change orders…
            </div>
          )}


          {!loading && error && (
            <div className="change-orders-message error">
              {error}
            </div>
          )}


          {
            !loading
            && !error
            && data
            && (
              <>
                <div className="change-orders-summary-grid">
                  <div>
                    <span>
                      Foundation COs
                    </span>

                    <strong>
                      {
                        data.changeOrderCount
                        || 0
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Net Cost Adjustment
                    </span>

                    <strong
                      className={
                        itemCostClass(
                          data.netCostAdjustment
                        )
                      }
                    >
                      {money(
                        data.netCostAdjustment,
                        true,
                      )}
                    </strong>
                  </div>
                </div>


                <p className="change-orders-context">
                  Foundation cost-budget adjustments tied to this job.
                  These values are not being treated as customer contract revenue.
                </p>


                {items.length > 0 ? (
                  <div className="change-orders-list">
                    {items.map(
                      (
                        item,
                        index,
                      ) => (
                        <article
                          className="change-orders-item"
                          key={
                            [
                              item.companyNo,
                              item.changeOrderId,
                              item.changeOrderNo,
                              index,
                            ].join('-')
                          }
                        >
                          <div className="change-orders-item-main">
                            <strong>
                              CO #{itemNumber(
                                item
                              )}
                            </strong>

                            <span
                              className={
                                itemCostClass(
                                  item.costAdjustment
                                )
                              }
                            >
                              {money(
                                item.costAdjustment,
                                true,
                              )}
                            </span>
                          </div>

                          <div className="change-orders-item-meta">
                            <span>
                              {
                                item.lineCount
                                || 0
                              } budget {
                                item.lineCount === 1
                                  ? 'line'
                                  : 'lines'
                              }
                            </span>

                            <span>
                              Updated {
                                dateLabel(
                                  item.lastSourceModifiedOn
                                )
                              }
                            </span>
                          </div>
                        </article>
                      )
                    )}
                  </div>
                ) : (
                  <div className="change-orders-empty">
                    No Foundation change orders are currently tied to this job.
                  </div>
                )}
              </>
            )
          }
        </div>
      </details>
    </div>
  );
}
