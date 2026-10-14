// Power Apps IsBlank semantics: 0 is a real estimate, whitespace isn't.
export function hasMissingEstimate(row) {
  const price = row?.estimatedPrice;
  return price === null || price === undefined
    || (typeof price === 'string' && price.trim() === '');
}

// The active-workspace wrapper supplies its existing daysFromToday result.
// Status, assigned PM and snoozed state are not overdue conditions.
export function isOverdueForDays(row, days) {
  return days !== null && days < 0 && hasMissingEstimate(row);
}
