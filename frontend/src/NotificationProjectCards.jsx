import React from 'react';
import {scheduleReviewText} from './scheduleReview.js';
import {PENDING_FOUNDATION} from './portfolioBalance.js';

// Keep one list and one scroll owner. Each alert is an independent, accessible
// action; do not put buttons inside buttons or make a second scrolling group.
export default function NotificationProjectCards({
  forecastItems = [],
  originatingItems = [],
  scheduleItems = [],
  onOpenSchedule,
  onOpenForecast,
  onOpenOriginating,
  originatingStatus,
  currency,
}) {
  return (
    <>
      {forecastItems.map(item => (
        <button
          key={`rebalance-${item.jobListId}-${item.forecastVersionId ?? 'latest'}`}
          type="button"
          className="notification-item notification-action-card"
          onClick={() => onOpenForecast(item)}
        >
          <span className="notification-item-heading">
            <span className="notification-card-heading-copy">
              <span>{item.jobNumber} · {item.reviewStatus === PENDING_FOUNDATION ? 'PENDING FOUNDATION' : 'NEEDS REBALANCE'}</span>
              <strong>{item.jobName || 'Current Project'}</strong>
            </span>
            <span className={`notification-variance ${Number(item.rebalanceVarianceAmount) < 0 ? 'variance-negative' : ''}`}>
              {currency(item.rebalanceVarianceAmount)}
            </span>
          </span>
          <span className="notification-card-description">
            {item.reviewStatus === PENDING_FOUNDATION
              ? 'A recently locked billing month has not fully reconciled with Foundation. The balance gap remains tracked; review again as billings settle.'
              : item.attentionSource === 'ADMIN_CORRECTION'
                ? `${item.submittedByName || 'An administrator'} changed the projection total. Operations needs to bring the PM Projection back to the remaining contract.`
                : 'This PM Projection no longer covers the remaining contract and needs to be rebalanced.'}
          </span>
          {item.correctionReason && (
            <span className="notification-reason notification-card-reason">
              {item.correctionReason}
            </span>
          )}
          <span className="notification-view-project notification-card-action" aria-hidden="true">
            View Project
          </span>
        </button>
      ))}

      {scheduleItems.map(item => (
        <button
          key={`schedule-${item.jobListId}-${item.forecastVersionId}`}
          type="button" className="notification-item notification-action-card"
          onClick={() => onOpenSchedule(item)}
        >
          <span className="notification-item-heading">
            <span className="notification-card-heading-copy">
              <span>{item.jobNumber} · SCHEDULE NEEDS REVIEW</span>
              <strong>{item.jobName || 'Current Project'}</strong>
            </span>
          </span>
          <span className="notification-card-description">{scheduleReviewText(item)}</span>
          <span className="notification-view-project notification-card-action" aria-hidden="true">
            Review Project
          </span>
        </button>
      ))}

      {originatingItems.map(item => (
        <button
          key={`originating-${item.jobListId}`}
          type="button"
          className="notification-item notification-action-card"
          onClick={() => onOpenOriginating(item)}
        >
          <span className="notification-item-heading">
            <span className="notification-card-heading-copy">
              <span>{item.jobNumber} · {item.reviewRequired ? 'LINK REVIEW' : 'ORIGINATING BID NOT LINKED'}</span>
              <strong>{item.jobName || 'Current Project'}</strong>
            </span>
          </span>
          <span className="notification-card-description">
            {item.reviewRequired
              ? 'This project needs originating-bid relationship review.'
              : 'This project is not linked to its originating bid.'}
          </span>
          {originatingStatus(item) && (
            <span className="notification-card-context">{originatingStatus(item)}</span>
          )}
          <span className="notification-view-project notification-card-action" aria-hidden="true">
            {item.reviewRequired ? 'Review' : 'View Project'}
          </span>
        </button>
      ))}
    </>
  );
}
