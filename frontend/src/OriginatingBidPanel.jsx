import {
  useEffect,
  useState,
} from 'react';


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


function dateLabel(value) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(
    `${String(value).slice(0, 10)}T12:00:00`
  );

  if (Number.isNaN(parsed.getTime())) {
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


function quantity(value) {
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


function estimatorLabel(bid) {
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


function addressLabel(bid) {
  if (!bid) {
    return '—';
  }

  const locality = [
    bid.city,
    bid.state,
  ]
    .filter(Boolean)
    .join(', ');

  return [
    bid.streetAddress,
    locality,
  ]
    .filter(Boolean)
    .join(' · ')
    || '—';
}


function confidenceLabel(value) {
  const labels = {
    VERY_LIKELY:
      'Very likely',

    LIKELY:
      'Likely',

    POSSIBLE:
      'Possible',

    WEAK:
      'Weak',
  };

  return (
    labels[
      String(value || '').toUpperCase()
    ]
    || 'Suggested match'
  );
}


function confidenceClass(value) {
  const normalized =
    String(value || '')
      .toLowerCase()
      .replaceAll('_', '-');

  return normalized
    ? `originating-bid-confidence ${normalized}`
    : 'originating-bid-confidence';
}


function requestErrorText(detail) {
  const messages = {
    bid_log_bid_link_user_not_authorized:
      'Your account is not authorized to link originating bids.',

    missing_authenticated_user:
      'Your Bid Log session could not be verified. Sign in again and retry.',

    invalid_originating_bid_link_payload:
      'The selected bid could not be submitted.',

    projected_billing_resource_not_found:
      'The project or bid could not be found.',

    data_api_unavailable:
      'Riggs data services are temporarily unavailable.',

    sql_unavailable:
      'Riggs data services are temporarily unavailable.',

    sql_capacity_unavailable:
      'Riggs data services are busy right now. Try again in a moment.',
  };

  return (
    messages[detail]
    || (
      detail
        ? String(detail).replaceAll('_', ' ')
        : 'Unable to complete the originating bid request.'
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
    const error = new Error(
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


function CandidateFacts({
  candidate,
  comparisonAmount,
}) {
  return (
    <div className="originating-bid-candidate-facts">
      <div>
        <span>Bid Estimate</span>

        <strong>
          {money(
            candidate.estimatedPrice
          )}
        </strong>
      </div>

      <div>
        <span>Current Contract</span>

        <strong>
          {money(
            comparisonAmount
          )}
        </strong>
      </div>

      <div>
        <span>Estimator</span>

        <strong>
          {estimatorLabel(
            candidate
          )}
        </strong>
      </div>

      <div>
        <span>GC</span>

        <strong>
          {candidate.generalContractors
            || '—'}
        </strong>
      </div>

      <div className="originating-bid-wide-fact">
        <span>Address</span>

        <strong>
          {addressLabel(
            candidate
          )}
        </strong>
      </div>

      <div>
        <span>CY</span>

        <strong>
          {quantity(
            candidate.cubicYards
          )}
        </strong>
      </div>

      <div>
        <span>SF</span>

        <strong>
          {quantity(
            candidate.squareFootage
          )}
        </strong>
      </div>
    </div>
  );
}


export default function OriginatingBidPanel({
  project,
  user,
  onBidLoaded,
}) {
  const [
    relationship,
    setRelationship,
  ] = useState(null);

  const [
    relationshipLoading,
    setRelationshipLoading,
  ] = useState(false);

  const [
    relationshipError,
    setRelationshipError,
  ] = useState(null);

  const [
    finderOpen,
    setFinderOpen,
  ] = useState(false);

  const [
    search,
    setSearch,
  ] = useState('');

  const [
    candidates,
    setCandidates,
  ] = useState(null);

  const [
    candidateLoading,
    setCandidateLoading,
  ] = useState(false);

  const [
    candidateError,
    setCandidateError,
  ] = useState(null);

  const [
    selectedCandidate,
    setSelectedCandidate,
  ] = useState(null);

  const [
    linking,
    setLinking,
  ] = useState(false);

  const [
    linkNotice,
    setLinkNotice,
  ] = useState(null);


  const role =
    String(
      user?.appRole
      || ''
    ).toUpperCase();

  const canLink =
    role === 'ADMIN'
    || role === 'OPERATIONS';


  useEffect(
    () => {
      if (!project?.jobListId) {
        return undefined;
      }

      const controller =
        new AbortController();

      let cancelled = false;


      async function loadRelationship() {
        setRelationshipLoading(true);
        setRelationshipError(null);
        setRelationship(null);
        setFinderOpen(false);
        setCandidates(null);
        setCandidateError(null);
        setSelectedCandidate(null);
        setLinkNotice(null);

        onBidLoaded?.(null);

        try {
          const payload =
            await fetchJson(
              (
                '/api/current-projects/'
                + `${project.jobListId}`
                + '/originating-bid'
              ),
              {
                signal:
                  controller.signal,
              },
            );

          if (cancelled) {
            return;
          }

          setRelationship(
            payload
          );

          onBidLoaded?.(
            payload?.linked
              ? payload?.bid || null
              : null
          );

        } catch (error) {
          if (
            cancelled
            || error?.name === 'AbortError'
          ) {
            return;
          }

          setRelationshipError(
            error.message
            || 'Unable to load originating bid.'
          );

          onBidLoaded?.(null);

        } finally {
          if (!cancelled) {
            setRelationshipLoading(false);
          }
        }
      }


      loadRelationship();

      return () => {
        cancelled = true;
        controller.abort();
      };
    },
    [
      project?.jobListId,
      onBidLoaded,
    ],
  );


  async function loadCandidates(
    searchValue = '',
  ) {
    if (
      !project?.jobListId
      || !canLink
    ) {
      return;
    }

    setCandidateLoading(true);
    setCandidateError(null);
    setSelectedCandidate(null);

    try {
      const params =
        new URLSearchParams();

      params.set(
        'limit',
        '12',
      );

      const trimmed =
        String(searchValue || '')
          .trim();

      if (trimmed) {
        params.set(
          'search',
          trimmed,
        );
      }

      const payload =
        await fetchJson(
          (
            '/api/current-projects/'
            + `${project.jobListId}`
            + '/bid-candidates?'
            + params.toString()
          )
        );

      setCandidates(
        payload
      );

    } catch (error) {
      setCandidateError(
        error.message
        || 'Unable to load bid candidates.'
      );

    } finally {
      setCandidateLoading(false);
    }
  }


  async function openFinder() {
    if (!canLink) {
      return;
    }

    setFinderOpen(true);
    setLinkNotice(null);

    if (!candidates) {
      await loadCandidates('');
    }
  }


  async function confirmLink() {
    if (
      !selectedCandidate
      || !project?.jobListId
      || linking
    ) {
      return;
    }

    setLinking(true);
    setCandidateError(null);
    setLinkNotice(null);

    try {
      const payload =
        await fetchJson(
          (
            '/api/current-projects/'
            + `${project.jobListId}`
            + '/originating-bid'
          ),
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                originalBidLogId:
                  selectedCandidate.originalBidLogId,
              }),
          },
        );

      setRelationship(
        payload
      );

      onBidLoaded?.(
        payload?.bid
        || null
      );

      setFinderOpen(false);
      setCandidates(null);
      setSelectedCandidate(null);
      setSearch('');

      setLinkNotice(
        'Originating bid linked.'
      );

    } catch (error) {
      setCandidateError(
        error.message
        || 'Unable to link the selected bid.'
      );

    } finally {
      setLinking(false);
    }
  }


  const linkedBid =
    relationship?.linked
      ? relationship?.bid
      : null;

  const candidateItems =
    Array.isArray(
      candidates?.items
    )
      ? candidates.items
      : [];

  const comparisonAmount =
    candidates
      ?.project
      ?.comparisonAmount
    ?? project?.originalContractAmount
    ?? null;


  return (
    <>
      <div className="project-setup-flag originating-bid-control">
        <span className="billing-detail-label">
          Originating Bid
        </span>

        <div className="project-setup-flag-row">
          {relationshipLoading && (
            <strong className="project-setup-tag neutral">
              Checking…
            </strong>
          )}


          {!relationshipLoading
            && relationshipError && (
              <strong
                className="project-setup-tag error"
                title={relationshipError}
              >
                Unavailable
              </strong>
            )}


          {!relationshipLoading
            && !relationshipError
            && linkedBid && (
              <strong className="project-setup-tag linked">
                Linked
              </strong>
            )}


          {!relationshipLoading
            && !relationshipError
            && relationship
            && !relationship.linked
            && canLink && (
              <button
                type="button"
                className="project-setup-tag-button unlinked"
                onClick={openFinder}
              >
                Not linked
              </button>
            )}


          {!relationshipLoading
            && !relationshipError
            && relationship
            && !relationship.linked
            && !canLink && (
              <strong className="project-setup-tag unlinked">
                Not linked
              </strong>
            )}


          {linkedBid && (
            <details className="originating-bid-help">
              <summary
                aria-label="View originating bid details"
                title="View originating bid details"
              >
                ⓘ
              </summary>

              <div className="originating-bid-help-popover">
                <div className="originating-bid-help-title">
                  <div>
                    <span>
                      Linked originating bid
                    </span>

                    <strong>
                      {linkedBid.bidName
                        || 'Unnamed bid'}
                    </strong>

                    <small>
                      Bid #{linkedBid.originalBidLogId}
                      {' · '}
                      {linkedBid.bidStatus || 'Awarded'}
                    </small>
                  </div>
                </div>

                <div className="originating-bid-help-facts">
                  <div>
                    <span>Estimator</span>
                    <strong>
                      {estimatorLabel(
                        linkedBid
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>GC</span>
                    <strong>
                      {linkedBid.generalContractors
                        || '—'}
                    </strong>
                  </div>

                  <div>
                    <span>Bid Estimate</span>
                    <strong>
                      {money(
                        linkedBid.estimatedPrice
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Awarded</span>
                    <strong>
                      {dateLabel(
                        linkedBid.dateAwarded
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>CY</span>
                    <strong>
                      {quantity(
                        linkedBid.cubicYards
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>SF</span>
                    <strong>
                      {quantity(
                        linkedBid.squareFootage
                      )}
                    </strong>
                  </div>
                </div>

                <div className="originating-bid-help-address">
                  {addressLabel(
                    linkedBid
                  )}
                </div>
              </div>
            </details>
          )}


          {!relationshipLoading
            && !relationshipError
            && relationship
            && !relationship.linked
            && canLink && (
              <button
                type="button"
                className="project-setup-info-button"
                onClick={openFinder}
                aria-label="Find an originating bid to link"
                title="Find an originating bid to link"
              >
                ⓘ
              </button>
            )}


          {!relationshipLoading
            && !relationshipError
            && relationship
            && !relationship.linked
            && !canLink && (
              <span
                className="project-setup-info-button disabled"
                aria-label="No originating bid linked"
                title="No originating bid linked"
              >
                ⓘ
              </span>
            )}
        </div>


        {linkNotice && (
          <small className="originating-bid-inline-success">
            {linkNotice}
          </small>
        )}
      </div>


      {finderOpen
        && !linkedBid
        && canLink && (
          <div className="originating-bid-finder project-setup-finder">
            <div className="originating-bid-finder-head">
              <div>
                <strong>
                  Find awarded bid
                </strong>

                <small>
                  Suggestions are evidence only. Confirm the correct bid before linking.
                </small>
              </div>

              <button
                type="button"
                className="originating-bid-text-button"
                onClick={() => {
                  setFinderOpen(false);
                  setSelectedCandidate(null);
                  setCandidateError(null);
                }}
              >
                Close
              </button>
            </div>


            <form
              className="originating-bid-search"
              onSubmit={event => {
                event.preventDefault();
                loadCandidates(search);
              }}
            >
              <input
                type="search"
                value={search}
                onChange={event =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Search awarded bids..."
                aria-label="Search awarded bids"
              />

              <button
                type="submit"
                disabled={candidateLoading}
              >
                {candidateLoading
                  ? 'Searching…'
                  : 'Search'}
              </button>
            </form>


            {candidateError && (
              <div className="originating-bid-error">
                {candidateError}
              </div>
            )}


            {candidateLoading
              && !candidateItems.length && (
                <div className="originating-bid-status">
                  Loading awarded bid suggestions…
                </div>
              )}


            {!candidateLoading
              && candidates
              && !candidateItems.length && (
                <div className="originating-bid-empty">
                  No awarded bids matched this search.
                </div>
              )}


            {!!candidateItems.length && (
              <div className="originating-bid-candidate-list">
                <div className="originating-bid-results-summary">
                  <span>
                    {candidates.candidateCount}
                    {' '}
                    {candidates.candidateCount === 1
                      ? 'candidate'
                      : 'candidates'}
                  </span>

                  {candidates.search && (
                    <small>
                      Search: {candidates.search}
                    </small>
                  )}
                </div>


                {candidateItems.map(
                  candidate => {
                    const selected =
                      selectedCandidate
                        ?.originalBidLogId
                      === candidate.originalBidLogId;

                    return (
                      <article
                        className={
                          selected
                            ? 'originating-bid-candidate selected'
                            : 'originating-bid-candidate'
                        }
                        key={candidate.originalBidLogId}
                      >
                        <div className="originating-bid-candidate-head">
                          <div>
                            <div className="originating-bid-candidate-name-row">
                              <strong>
                                {candidate.bidName
                                  || 'Unnamed bid'}
                              </strong>

                              <span
                                className={
                                  confidenceClass(
                                    candidate.matchLevel
                                  )
                                }
                              >
                                {confidenceLabel(
                                  candidate.matchLevel
                                )}
                              </span>
                            </div>

                            <small>
                              Bid #{candidate.originalBidLogId}
                              {' · '}
                              {candidate.bidStatus || 'Awarded'}
                              {' · '}
                              {dateLabel(
                                candidate.dateAwarded
                              )}
                            </small>
                          </div>

                          {!selected && (
                            <button
                              type="button"
                              className="originating-bid-review-button"
                              onClick={() =>
                                setSelectedCandidate(
                                  candidate
                                )
                              }
                            >
                              Review Link
                            </button>
                          )}
                        </div>


                        <CandidateFacts
                          candidate={candidate}
                          comparisonAmount={comparisonAmount}
                        />


                        {!!candidate.matchReasons?.length && (
                          <div className="originating-bid-match-reasons">
                            {candidate.matchReasons.map(
                              reason => (
                                <span key={reason}>
                                  {reason}
                                </span>
                              )
                            )}
                          </div>
                        )}


                        {candidate.existingJobLinkCount > 0 && (
                          <div className="originating-bid-link-warning">
                            <strong>
                              Existing linked job
                              {candidate.existingJobLinkCount === 1
                                ? ''
                                : 's'}
                            </strong>

                            <span>
                              {candidate.existingLinkedJobs?.length
                                ? candidate.existingLinkedJobs.join(', ')
                                : `${candidate.existingJobLinkCount} existing relationship(s)`}
                            </span>
                          </div>
                        )}


                        {selected && (
                          <div className="originating-bid-confirmation">
                            <div>
                              <strong>
                                Link Bid #{candidate.originalBidLogId} to Job {project.jobNumber}?
                              </strong>

                              <p>
                                Confirm that this is the originating bid. This screen does not support changing the relationship after it is linked.
                              </p>
                            </div>

                            <div className="originating-bid-confirm-actions">
                              <button
                                type="button"
                                className="originating-bid-secondary-button"
                                disabled={linking}
                                onClick={() =>
                                  setSelectedCandidate(null)
                                }
                              >
                                Cancel
                              </button>

                              <button
                                type="button"
                                className="originating-bid-primary-button"
                                disabled={linking}
                                onClick={confirmLink}
                              >
                                {linking
                                  ? 'Linking…'
                                  : 'Confirm Link'}
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  }
                )}
              </div>
            )}
          </div>
        )}
    </>
  );
}
