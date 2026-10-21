// Historical project quantities are sourced from a linked originating bid.
// Do not coerce null, blank, invalid, or unavailable data into an invented 0.
export function billingQuantityLabel(value) {
  if (typeof value === 'boolean') return '—';
  if (value === null || value === undefined || String(value).trim() === '') {
    return '—';
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en-US', {maximumFractionDigits: 0}).format(number);
}

export function completedQuantitySourceNote(value, missingBidLink) {
  if (billingQuantityLabel(value) !== '—') return 'Originating bid';
  return missingBidLink ? 'No linked originating bid' : 'Not recorded on originating bid';
}
