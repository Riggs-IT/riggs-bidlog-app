// Validate the independent, portfolio-wide schedule-review result. A missing
// response is not equivalent to "zero schedule changes".
export function indexScheduleReview(items) {
  if (!Array.isArray(items)) {
    throw new Error('Schedule review returned an invalid result.');
  }
  const index = new Map();
  for (const item of items) {
    const id = Number(item?.jobListId);
    const saved = Number(item?.durationAtPmSave);
    const current = Number(item?.currentDuration);
    if (!Number.isInteger(id) || id < 1 || index.has(String(id))
      || !Number.isInteger(saved) || !Number.isInteger(current)
      || current <= saved || item?.needsScheduleReview !== true
      || !/^\d{4}-\d{2}-\d{2}/.test(String(item?.currentExpectedEnd ?? ''))
      || !/^\d{4}-\d{2}-\d{2}/.test(String(item?.expectedEndAtPmSave ?? ''))
      || !/^\d{4}-\d{2}-\d{2}/.test(String(item?.lastPositivePmBillingMonth ?? ''))
      || !Number.isInteger(Number(item?.forecastVersionId))) {
      throw new Error('Schedule review contained invalid or duplicate project status.');
    }
    index.set(String(id), item);
  }
  return index;
}

export function scheduleReviewText(item) {
  if (!item) return '';
  return `Estimated duration increased from ${item.durationAtPmSave} to ${item.currentDuration} months after the last saved PM Projection. Expected completion is now ${item.currentExpectedEnd}. Review the billing schedule; existing PM monthly amounts have not been changed.`;
}
