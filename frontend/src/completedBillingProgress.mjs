/* Display-only model for historical completed-project billing progression.
 * Amounts come from the existing authenticated monthly and summary APIs.
 * Never interpolate, fabricate a missing monthly value, or substitute 0.
 */
function finiteMoney(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function completedBillingProgress(monthly, totalContract, expectedActual) {
  if (!Array.isArray(monthly) || monthly.length === 0) {
    return {status: 'empty', points: [], contract: finiteMoney(totalContract)};
  }

  const points = [];
  const seen = new Set();
  for (const row of monthly) {
    const month = typeof row?.monthStart === 'string' ? row.monthStart.slice(0, 10) : '';
    const amount = finiteMoney(row?.cumulativeActualAmount);
    if (!/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(month)
        || amount === null || seen.has(month)) {
      return {status: 'unavailable', points: [], contract: finiteMoney(totalContract)};
    }
    seen.add(month);
    points.push({month, amount});
  }
  points.sort((left, right) => left.month.localeCompare(right.month));

  const expected = finiteMoney(expectedActual);
  if (expected !== null && Math.abs(points[points.length - 1].amount - expected) > 0.011) {
    // Do not put a nonmatching monthly snapshot next to a summary as though they agree.
    return {status: 'unavailable', points: [], contract: finiteMoney(totalContract)};
  }

  return {status: 'ready', points, contract: finiteMoney(totalContract)};
}
