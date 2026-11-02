// Temporary, broad BUSINESS-data exports. Deliberate explicit column maps:
// never dump raw API objects (which may grow technical or restricted fields).
// The caller supplies the already-filtered, already-authorized table rows.

const column = (label, field = label) => [
  label,
  typeof field === 'function' ? field : row => row?.[field],
];

const date = value => value == null ? '' : String(value).slice(0, 10);
const percent = value => {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number * 100 : '';
};
const percentageAsShown = value => {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(String(value).replace('%', ''));
  return Number.isFinite(number) ? (number > 0 && number <= 1 ? number * 100 : number) : '';
};
const yesNo = value => value === null || value === undefined
  ? '' : value ? 'Yes' : 'No';
const flat = value => Array.isArray(value) ? value.filter(Boolean).join('; ')
  : value ?? '';

function fromColumns(rows, columns) {
  const headers = columns.map(([label]) => label);
  return {
    headers,
    rows: rows.map(row => Object.fromEntries(
      columns.map(([label, get]) => [label, flat(get(row))]),
    )),
  };
}

export function buildBidLogDataDump(rows, {canSeeMargin = false} = {}) {
  const columns = [
    column('Bid Log ID', 'originalBidLogId'),
    column('SharePoint Item ID', 'sharePointItemId'),
    column('Bid Name', 'bidName'),
    column('Status', 'status'),
    column('PM', 'pm'),
    column('Project Type', 'projectType'),
    column('Purpose', 'purpose'),
    column('General Contractors', 'generalContractors'),
    column('Developer', 'developer'),
    column('Street Address', 'streetAddress'),
    column('City', 'city'),
    column('State', 'state'),
    column('Due Date', row => date(row.dueDate)),
    column('Anticipated Start Date', row => date(row.anticipatedStartDate)),
    column('Date Awarded', row => date(row.dateAwarded)),
    column('Last Contact Date', row => date(row.lastContactDate)),
    column('Estimated Price', 'estimatedPrice'),
    column('Last Estimate', 'lastEstimate'),
    column('Probability (%)', row => percent(row.probability)),
    ...(canSeeMargin ? [column('Bid Margin', 'margin')] : []),
    column('Retention', 'retention'),
    column('Buildings', 'numberOfBuildings'),
    column('Panels', 'numberOfPanels'),
    column('Square Footage (SF)', 'squareFootage'),
    column('Cubic Yards (CY)', 'cubicYards'),
    column('Paving Footage (SF)', 'pavingFootage'),
    column('Man Hours (MH)', 'manHours'),
    column('Redimix Footing Price', 'redimixFootingPrice'),
    column('Rebar Price', 'rebarPrice'),
    column('Primary Estimator', 'primaryEstimator'),
    column('Secondary Estimator', 'secondaryEstimator'),
    column('Real Estimate', row => yesNo(row.realEstimate)),
    column('Bid Complete', row => yesNo(row.bidComplete)),
    column('Snoozed', row => yesNo(row.snoozed)),
    column('Snoozed Until', 'snoozedUntil'),
    column('Bid Count', 'bidCount'),
    column('Created', 'created'),
    column('Modified', 'modified'),
    column('Current SharePoint List', 'currentSharePointList'),
    column('Current SharePoint Item ID', 'currentSharePointItemId'),
  ];
  return fromColumns(rows, columns);
}

// Active Projects directory includes the optional completed-project toggle.
export function buildProjectDirectoryDataDump(rows, {canViewMargin = false} = {}) {
  const columns = [
    column('Job Number', 'jobNumber'),
    column('Job List ID', 'jobListId'),
    column('Project Name', 'jobName'),
    column('Project Completed', row => yesNo(row.projectCompleted)),
    column('Project Type', 'projectType'),
    column('Purpose', 'purpose'),
    column('General Contractor', row => row.generalContractors ?? row.generalContractor),
    column('Street Address', 'streetAddress'),
    column('City / State / Zip', 'cityStateZip'),
    column('PM', row => row.pm ?? row.projectManager),
    column('PE', row => row.pe ?? row.projectEngineer),
    column('Superintendent', 'superintendent'),
    column('APM', 'apm'),
    column('Original Contract', row => row.originalContractAmount ?? row.contractAmount),
    column('Original Contract Source', 'originalContractSource'),
    column('Total Contract', 'totalContractAmount'),
    column('Total Contract Source', 'totalContractSource'),
    column('Approved Change Order Income', 'approvedChangeOrderAmount'),
    column('Approved Change Order Count', 'approvedChangeOrderCount'),
    column('Contract Remaining', 'contractRemainingAmount'),
    column('Foundation Original Contract', 'foundationOriginalContractAmount'),
    column('Ops Contract', 'cognitoContractAmount'),
    column('Bid Estimated Price', 'bidEstimatedPrice'),
    column('Effective Project Amount', 'effectiveAmount'),
    column('Amount Source', 'amountSource'),
    column('Retention', 'retention'),
    column('Retention Source', 'retentionSource'),
    column('Square Footage (SF)', 'squareFootage'),
    column('Cubic Yards (CY)', 'cubicYards'),
    column('Forecast State', 'forecastState'),
    column('Forecast Ready', row => yesNo(row.forecastReady)),
    column('Distribution Method', 'distributionMethod'),
    column('Curve', 'curveDisplayName'),
    column('Effective Start Date', row => date(row.effectiveStartDate)),
    column('Start Date Source', 'startDateSource'),
    column('Estimated Duration (Months)', 'estimatedDurationMonths'),
    column('Projected Completion Date', row => date(row.projectedCompletionDate)),
    column('End Date Source', 'endDateSource'),
    column('Foundation Billing History', row => yesNo(row.hasFoundationBillingHistory)),
    column('Foundation Billing Months', 'foundationBillingMonthCount'),
    column('Projected Total', 'projectedTotal'),
    ...(canViewMargin ? [column('Estimated Margin (%)', row => percentageAsShown(row.estimatedMarginPercent))] : []),
  ];
  return fromColumns(rows, columns);
}

// The directory export is lifetime, matching the existing Directory table.
export function buildCompletedDirectoryDataDump(rows, {canViewMargin = false} = {}) {
  const columns = [
    column('Job Number', 'jobNumber'),
    column('Job List ID', 'jobListId'),
    column('Project Name', 'jobName'),
    column('Project Type', 'projectType'),
    column('Purpose', 'purpose'),
    column('General Contractor', 'generalContractor'),
    column('Street Address', 'streetAddress'),
    column('City / State / Zip', 'cityStateZip'),
    column('PM', 'projectManager'),
    column('PE', 'projectEngineer'),
    column('Superintendent', 'superintendent'),
    column('APM', 'apm'),
    column('Total Contract', 'totalContractAmount'),
    column('Total Contract Source', 'totalContractSource'),
    column('Foundation Original Contract', 'foundationOriginalContractAmount'),
    column('Approved Change Order Income', 'approvedChangeOrderAmount'),
    column('Approved Change Order Count', 'approvedChangeOrderCount'),
    column('Foundation Revised Contract', 'foundationRevisedContractAmount'),
    column('Ops Contract Amount', 'cognitoContractAmount'),
    column('Actual Billings', 'foundationActualTotal'),
    column('Actual vs Total Contract', 'actualVsTotalContractVariance'),
    column('Contract Remaining', 'contractRemainingAmount'),
    ...(canViewMargin ? [
      column('Margin Collected', row => row.marginDataComplete ? row.marginCollectedTotal : null),
      column('Weighted Historical Margin (%)', row => row.marginDataComplete
        ? percentageAsShown(row.weightedHistoricalMarginPercent) : null),
      column('Margin Data Complete', row => yesNo(row.marginDataComplete)),
      column('Missing Margin Rows', 'missingMarginRows'),
    ] : []),
    column('Retention', 'retention'),
    column('Retention Source', 'retentionSource'),
    column('Foundation Retention (%)', row => percentageAsShown(row.foundationRetentionPercent)),
    column('Square Footage (SF)', 'squareFootage'),
    column('Cubic Yards (CY)', 'cubicYards'),
    column('Resolved Start Date', row => date(row.resolvedStartDate)),
    column('Start Date Source', 'resolvedStartSource'),
    column('Resolved End Date', row => date(row.resolvedEndDate)),
    column('End Date Source', 'resolvedEndSource'),
    column('Resolved Duration (Days)', 'resolvedDurationDays'),
    column('Duration Source', 'resolvedDurationSource'),
    column('Ops Planned Start', row => date(row.operationsPlannedStartDate)),
    column('Ops Anticipated Start', row => date(row.operationsAnticipatedStartDate)),
    column('Ops Completion', row => date(row.operationsCompletionDate)),
    column('First Billing Date', row => date(row.firstBillingActivityDate)),
    column('Last Billing Date', row => date(row.lastBillingActivityDate)),
    column('Foundation Billing Months', 'foundationBillingMonthCount'),
    column('Foundation Billing Transactions', 'foundationBillingTransactionCount'),
    column('Originating Bid ID', 'awardOriginalBidLogId'),
    column('Originating Bid Name', 'bidName'),
    column('Bid Date Awarded', row => date(row.bidDateAwarded)),
    column('Primary Estimator', 'primaryEstimator'),
    column('Secondary Estimator', 'secondaryEstimator'),
    column('Estimator Amount', 'estimatorEstimatedAmount'),
    column('Estimator Amount Source', 'estimatorAmountSource'),
    column('Estimator Anticipated Start', row => date(row.estimatorAnticipatedStartDate)),
    column('Estimator Duration (Months)', 'estimatorDurationMonths'),
    column('Estimator Data State', 'estimatorDataState'),
    column('Benchmark Curve', 'benchmarkCurveDisplayName'),
    column('Benchmark Distribution', 'benchmarkDistributionMethod'),
    column('Invalid Date Range', row => yesNo(row.invalidResolvedDateRange)),
  ];
  return fromColumns(rows, columns);
}

export function buildCompletedHistoryDataDump({
  view, projects, byId, months, monthlySummary = null, focusedMonth = null, canViewMargin = false,
}) {
  if (view !== 'month' && view !== 'project') {
    throw new Error('Unknown completed history export view.');
  }
  if (!(byId instanceof Map) || !months.length) {
    throw new Error('Completed history is not ready for export.');
  }
  const monthSet = focusedMonth && months.includes(focusedMonth)
    ? [focusedMonth] : months;

  if (view === 'month') {
    // Use the exact monthly summary already used by the table; do not
    // introduce a second billing or margin aggregation formula in the CSV.
    if (!Array.isArray(monthlySummary)) {
      throw new Error('Completed month summary is not ready for export.');
    }
    const columns = [
      column('Month', 'month'),
      column('Billed Projects', 'billedProjects'),
      column('Projects With Records', 'projectsWithRecords'),
      column('Actual Billings', 'actual'),
      ...(canViewMargin ? [column('Margin Collected', 'marginCollected')] : []),
      column('Billed After End', 'billedAfterEnd'),
    ];
    const items = [...monthlySummary].reverse().map(row => ({
      ...row,
      // A calendar month with NO source record is not an observed $0 month.
      actual: row.projectsWithRecords ? row.actual : null,
    }));
    return fromColumns(items, columns);
  }

  // Project pivot: one project per row, with months as separate columns.
  // A missing monthly record is blank; a genuine SQL zero is exactly zero.
  const columns = [
    column('Job Number', 'jobNumber'),
    column('Job List ID', 'jobListId'),
    column('Project', 'jobName'),
    column('PM', 'projectManager'),
    column('General Contractor', 'generalContractor'),
    column('Type', 'projectType'),
    column('Purpose', 'purpose'),
    column('Total Contract', 'totalContractAmount'),
    column('Months With History', row => (byId.get(Number(row.jobListId)) || [])
      .filter(value => monthSet.includes(String(value.monthStart).slice(0, 7))).length),
    ...monthSet.flatMap(month => [
      column(`${month} Actual Billings`, row => (byId.get(Number(row.jobListId)) || [])
        .find(value => value.monthStart === `${month}-01`)?.actualAmount ?? null),
      ...(canViewMargin ? [column(`${month} Margin Collected`, row => {
        const value = (byId.get(Number(row.jobListId)) || [])
          .find(value => value.monthStart === `${month}-01`);
        return value && value.marginDataComplete === true
          && Number(value.missingMarginRows || 0) === 0
          ? value.marginCollected ?? null : null;
      })] : []),
    ]),
  ];
  // A drilldown month hides projects without records for that focused month.
  const visible = focusedMonth && months.includes(focusedMonth)
    ? projects.filter(row => (byId.get(Number(row.jobListId)) || [])
      .some(value => value.monthStart === `${focusedMonth}-01`))
    : projects;
  return fromColumns(visible, columns);
}
