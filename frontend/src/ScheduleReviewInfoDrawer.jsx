import React, {useEffect} from 'react';
import {scheduleReviewText} from './scheduleReview.js';

// Read-only notification detail for authorized Bid Log users who cannot open
// the restricted Projected Billings workspace (e.g., project engineers).
export default function ScheduleReviewInfoDrawer({review, onClose}) {
  useEffect(() => {
    if (!review) return undefined;
    const onKeyDown = event => {if (event.key === 'Escape') onClose();};
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [review, onClose]);
  if (!review) return null;
  return <div className="billing-drawer-backdrop" role="presentation"
    onMouseDown={event => {if (event.target === event.currentTarget) onClose();}}>
    <aside className="billing-drawer schedule-review-info-drawer" role="dialog"
      aria-modal="true" aria-labelledby="schedule-review-info-title">
      <header className="billing-drawer-header">
        <div>
          <span className="section-kicker">PROJECT SCHEDULE · NOTICE</span>
          <h2 id="schedule-review-info-title">{review.jobName || 'Current Project'}</h2>
          <p>Job {review.jobNumber}</p>
        </div>
        <button type="button" className="billing-drawer-close"
          onClick={onClose} aria-label="Close schedule review notice">×</button>
      </header>
      <div className="billing-drawer-body">
        <p className="schedule-review-info-message">{scheduleReviewText(review)}</p>
        <p>Your account can view this assigned-project notification, but PM forecast editing requires Projected Billings access. Contact your project manager to revise the schedule.</p>
      </div>
    </aside>
  </div>;
}
