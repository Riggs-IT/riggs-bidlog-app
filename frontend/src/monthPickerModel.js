// The app stores billing filter months as YYYY-MM. Keep Firefox's fallback
// controls and Chromium's native month input on that same exact contract.
export const MONTH_NAMES = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);
export const MONTH_ABBREVIATIONS = Object.freeze(MONTH_NAMES.map(name => name.slice(0, 3)));

const MONTH_PATTERN = /^([1-9]\d{3})-(0[1-9]|1[0-2])$/;

export function isValidBillingMonth(value) {
  return typeof value === 'string' && MONTH_PATTERN.test(value);
}

export function displayBillingMonth(value) {
  if (!isValidBillingMonth(value)) return 'Choose month';
  return `${MONTH_NAMES[Number(value.slice(5)) - 1]} ${value.slice(0, 4)}`;
}

export function yearForBillingMonth(value, fallbackYear) {
  return isValidBillingMonth(value) ? Number(value.slice(0, 4)) : fallbackYear;
}

export function billingMonthForYearAndIndex(year, monthIndex) {
  if (!Number.isSafeInteger(year) || year < 1000 || year > 9999 ||
      !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function acceptedBillingMonth(currentValue, proposedValue) {
  // Clearing a month must not poison a live financial range or trigger a blank view.
  return isValidBillingMonth(proposedValue) ? proposedValue : currentValue;
}

export function monthPopoverPosition(rect, viewportWidth, viewportHeight) {
  const width = 254;
  const height = 250;
  const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
  const down = rect.bottom + 6;
  const up = rect.top - height - 6;
  const top = down + height <= viewportHeight - 8 ? down :
    up >= 8 ? up : Math.max(8, viewportHeight - height - 8);
  return {left, top};
}
