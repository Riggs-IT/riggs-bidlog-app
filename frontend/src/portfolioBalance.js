// A portfolio-wide read is separate from employee notification recipients.
// Fail closed on invalid result shapes rather than displaying a false zero.
export function indexPortfolioRebalance(items) {
  if (!Array.isArray(items)) {
    throw new Error('Portfolio balance response was not a list.');
  }
  const index = new Map();
  for (const item of items) {
    const id = Number(item?.jobListId);
    const variance = item?.rebalanceVarianceAmount;
    if (!Number.isSafeInteger(id) || id <= 0
        || item?.needsRebalance !== true
        || variance === null || variance === undefined
        || !Number.isFinite(Number(variance)) || Number(variance) === 0
        || index.has(String(id))) {
      throw new Error('Portfolio balance response had invalid or duplicate rows.');
    }
    index.set(String(id), item);
  }
  return index;
}
