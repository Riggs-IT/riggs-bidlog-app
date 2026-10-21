// Completed Billings consumes amounts already resolved by the Riggs Data API.
// Only aggregate the selected API values here; do not recreate Foundation CO
// eligibility, contract authority, historical margin, or variance arithmetic.
export function completedAmount(value) {
  if (value === null || value === undefined || value === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function completedContractSourceLabel(source) {
  if (source === 'FOUNDATION_REVISED') return 'Foundation · revised contract';
  if (source === 'COGNITO_FALLBACK') return 'Cognito fallback · Foundation CO evidence unavailable';
  return 'Contract source unavailable';
}

export function summarizeCompletedCommercial(rows) {
  const result = {
    total: rows.length,
    originalContract: 0,
    approvedChangeOrders: 0,
    approvedChangeOrderCount: 0,
    totalContract: 0,
    actualBillings: 0,
    contractRemaining: 0,
    actualVsTotalContract: 0,
    historicalEstimates: 0,
    missingApprovedChangeOrderEvidence: 0,
    missingTotalContracts: 0,
    missingOriginalContracts: 0,
    missingActualBillings: 0,
    missingContractRemaining: 0,
    missingVariance: 0,
  };

  for (const row of rows) {
    const original = completedAmount(row.contractAmount);
    const approvedCo = completedAmount(row.approvedChangeOrderAmount);
    const total = completedAmount(row.totalContractAmount);
    const actual = completedAmount(row.foundationActualTotal);
    const remaining = completedAmount(row.contractRemainingAmount);
    const variance = completedAmount(row.actualVsTotalContractVariance);

    if (original === null) result.missingOriginalContracts += 1;
    else result.originalContract += original;

    // Missing Foundation history is *unknown*, not an asserted zero CO total.
    if (approvedCo === null) result.missingApprovedChangeOrderEvidence += 1;
    else result.approvedChangeOrders += approvedCo;

    if (total === null) result.missingTotalContracts += 1;
    else result.totalContract += total;

    if (actual === null) result.missingActualBillings += 1;
    else result.actualBillings += actual;

    if (remaining === null) result.missingContractRemaining += 1;
    else result.contractRemaining += remaining;

    if (variance === null) result.missingVariance += 1;
    else result.actualVsTotalContract += variance;

    if (row.approvedChangeOrderCount !== null && row.approvedChangeOrderCount !== undefined) {
      result.approvedChangeOrderCount += Number(row.approvedChangeOrderCount) || 0;
    }
    if (completedAmount(row.estimatorEstimatedAmount) !== null) {
      result.historicalEstimates += 1;
    }
  }

  // Do not display a partial amount as the complete portfolio contract or
  // variance if a future response leaves any row unavailable.
  if (result.missingOriginalContracts) result.originalContract = null;
  if (result.missingTotalContracts) result.totalContract = null;
  if (result.missingActualBillings) result.actualBillings = null;
  if (result.missingContractRemaining) result.contractRemaining = null;
  if (result.missingVariance) result.actualVsTotalContract = null;

  return result;
}
