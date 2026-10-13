import React from 'react';
import {scheduleReviewText} from './scheduleReview.js';

// The Projected Billings tables already make their rows clickable. There, a
// non-button span avoids nested interactive controls. Active Projects uses a
// real button to override its existing project-edit row click.
export default function ScheduleReviewFlag({review, onClick = null}) {
  if (!review) return null;
  const title = scheduleReviewText(review);
  if (onClick) {
    return <button type="button" className="schedule-review-flag schedule-review-action"
      data-schedule-review title={title} onClick={onClick}
      onKeyDown={event => event.stopPropagation()}>Schedule Needs Review</button>;
  }
  return <span className="schedule-review-flag" data-schedule-review
    title={title}>Schedule Needs Review</span>;
}
