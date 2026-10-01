// Presentation/read adapter only. No allocations, write payloads, lock rules,
// fallback by month, business-recipient rules or persistent storage live here.
export const PRIMARY_PROJECTION_PATH = '/api/projected-billings/current-projects/primary-projection';
export const PM_SOURCE = 'PM_FORECAST';
export const SYSTEM_SOURCE = 'SYSTEM_BASELINE';
const ym = value => String(value || '').slice(0, 7);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const fail = () => { throw new Error('Project reads are incomplete or changed during refresh. Last loaded values were retained; use Refresh to read them together.'); };
const id = value => { if (!Number.isSafeInteger(value) || value < 1) fail(); return value; };
const validMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value);

export function nullableAmount(value) {
  if (value === null || value === undefined) return null;
  if ((typeof value !== 'number' && typeof value !== 'string') || value === ''
      || (typeof value === 'string' && !/^-?\d+(?:\.\d+)?$/.test(value))) fail();
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isSafeInteger(Math.round(number * 100))) fail();
  return number;
}
export function sumAmounts(values, empty = null) {
  let cents = 0, count = 0;
  for (const value of values) {
    const number = nullableAmount(value);
    if (number === null) continue;
    cents += Math.round(number * 100); count += 1;
    if (!Number.isSafeInteger(cents)) fail();
  }
  return count ? cents / 100 : empty;
}
export function amountDifference(actual, projected) {
  if (actual === null || actual === undefined || projected === null || projected === undefined) return null;
  return sumAmounts([actual, -projected]);
}
function sameAmount(a, b) {
  a = nullableAmount(a); b = nullableAmount(b);
  return a === null || b === null ? a === b : Math.round(a * 100) === Math.round(b * 100);
}
function indexUnique(rows, key) {
  const map = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object') fail();
    const k = key(row); if (map.has(k)) fail(); map.set(k, row);
  }
  return map;
}
function arizonaMonth(iso) {
  const date = new Date(iso);
  if (typeof iso !== 'string' || !/[zZ]$|[+-]\d\d:\d\d$/.test(iso) || Number.isNaN(+date)) fail();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
}

export function validatePrimaryProjection(payload) {
  if (!payload || payload.contractVersion !== 1 || !Array.isArray(payload.projects) || !Array.isArray(payload.items)) fail();
  const asOfMonth = arizonaMonth(payload.readCompletedAtUTC);
  const projects = indexUnique(payload.projects, p => id(p.jobListId));
  const counts = new Map();
  for (const p of projects.values()) {
    if (typeof p.hasPmForecast !== 'boolean') fail();
    if (p.hasPmForecast) {
      id(p.latestForecastVersionId); id(p.latestForecastVersionNumber);
      if (!Number.isSafeInteger(p.latestForecastMonthCount) || p.latestForecastMonthCount < 0
          || !['PM_SUBMISSION', 'ADMIN_CORRECTION'].includes(p.latestForecastVersionType)
          || p.primaryProjectionSource !== PM_SOURCE) fail();
    } else if (p.latestForecastVersionId !== null || p.latestForecastVersionNumber !== null
        || p.latestForecastVersionType !== null || p.latestForecastMonthCount !== null
        || p.primaryProjectionSource !== SYSTEM_SOURCE) fail();
  }
  const months = indexUnique(payload.items, m => {
    if (!validMonth(m.monthStart)) fail();
    return `${id(m.jobListId)}:${m.monthStart}`;
  });
  for (const m of months.values()) {
    const p = projects.get(m.jobListId);
    if (!p || m.primaryProjectionSource !== p.primaryProjectionSource
        || m.latestForecastVersionId !== p.latestForecastVersionId || typeof m.isEditable !== 'boolean'
        || !['LOCKED_PAST', 'LOCKED_CURRENT', 'EDITABLE_CURRENT', 'EDITABLE_FUTURE'].includes(m.monthEditState)) fail();
    for (const k of ['primaryProjectedAmount', 'pmForecastAmount', 'systemBaselineAmount', 'foundationActualAmount']) {
      if (!own(m, k)) fail(); nullableAmount(m[k]);
    }
    if (!sameAmount(m.primaryProjectedAmount, p.hasPmForecast ? m.pmForecastAmount : m.systemBaselineAmount)) fail();
    if (!p.hasPmForecast && m.pmForecastAmount !== null) fail();
    if (m.pmForecastAmount !== null) counts.set(m.jobListId, (counts.get(m.jobListId) || 0) + 1);
  }
  for (const p of projects.values()) {
    if (p.hasPmForecast && (counts.get(p.jobListId) || 0) !== p.latestForecastMonthCount) fail();
  }
  return { projects, months, asOfMonth };
}

// Keep the current directory and historical margin source. Only ACTIVE project
// projections change source. No PM endpoint is fetched once per project.
export function mergePrimaryPortfolio(summary, legacyMonthly, primary) {
  if (!Array.isArray(summary) || !Array.isArray(legacyMonthly?.items)) fail();
  const { projects: primaryProjects, months: primaryMonths, asOfMonth } = validatePrimaryProjection(primary);
  const summaryIndex = indexUnique(summary, p => id(p.jobListId));
  const legacyIndex = indexUnique(legacyMonthly.items, p => id(p.jobListId));
  for (const p of primaryProjects.values()) {
    if (!summaryIndex.has(p.jobListId) || summaryIndex.get(p.jobListId).projectCompleted) fail();
  }
  for (const p of summary) {
    if (!p.projectCompleted && !primaryProjects.has(p.jobListId)) fail();
  }
  const byProject = new Map();
  for (const m of primaryMonths.values()) {
    if (!byProject.has(m.jobListId)) byProject.set(m.jobListId, []);
    byProject.get(m.jobListId).push(m);
  }
  const projects = [], items = [];
  for (const p of summary) {
    const old = legacyIndex.get(p.jobListId);
    if (old && !Array.isArray(old.items)) fail();
    const oldRows = old?.items || [];
    const indexed = indexUnique(oldRows, m => {
      if (!validMonth(String(m.monthStart).slice(0, 10))) fail();
      return String(m.monthStart).slice(0, 10);
    });
    if (p.projectCompleted) {
      projects.push(p); items.push(old || { jobListId: p.jobListId, items: [] }); continue;
    }
    const meta = primaryProjects.get(p.jobListId);
    const next = new Map();
    for (const m of byProject.get(p.jobListId) || []) {
      const previous = indexed.get(m.monthStart);
      // Do not display a margin from a different actual-billing snapshot. A
      // deliberate Refresh bypasses all three backend cached reads together.
      if (previous && !sameAmount(previous.actualAmount, m.foundationActualAmount)) fail();
      if (!previous && m.foundationActualAmount !== null && m.foundationActualAmount !== 0) fail();
      next.set(m.monthStart, {
        ...previous, ...m,
        projectedAmount: m.primaryProjectedAmount,
        actualAmount: previous ? previous.actualAmount : m.foundationActualAmount,
        monthlyVariance: m.actualVsPrimaryVariance,
        hasPmForecast: meta.hasPmForecast,
        missingPmMonths: meta.hasPmForecast && m.pmForecastAmount === null ? 1 : 0,
      });
    }
    // A calendar removed by a baseline/schedule change cannot be silently used
    // to fill a new PM plan. Retain any additional real actual/margin month.
    for (const [month, previous] of indexed) {
      if (next.has(month)) continue;
      if (previous.actualAmount !== null && previous.actualAmount !== undefined) fail();
      // An old baseline-only row outside the primary calendar is obsolete,
      // not a PM month. The new calendar remains authoritative for active jobs.
    }
    const rows = [...next.values()].sort((a, b) => a.monthStart.localeCompare(b.monthStart));
    const all = aggregateCurrentMonthly(rows, '0000-01', '9999-12');
    const toDate = aggregateCurrentMonthly(rows, '0000-01', asOfMonth);
    const future = aggregateCurrentMonthly(rows, nextMonth(asOfMonth), '9999-12');
    projects.push({ ...p, ...meta,
      baselineProjectedTotal: p.projectedTotal,
      baselineProjectedToDate: p.projectedToDate,
      baselineFutureProjectedAmount: p.futureProjectedAmount,
      baselineVarianceToDate: p.varianceToDate,
      projectedTotal: rows.length ? all.projected : null,
      projectedToDate: rows.length ? toDate.projected : null,
      futureProjectedAmount: rows.length ? future.projected : null,
      // Retain summary actual and all margin data; a to-date mismatch marks
      // comparison unavailable rather than mixing two reporting snapshots.
      varianceToDate: sameAmount(p.actualToDate, toDate.actual) ? toDate.variance : null,
      projectionMissingPmMonths: all.missingPmMonths,
      projectionToDateMissingPmMonths: toDate.missingPmMonths,
      projectionFutureMissingPmMonths: future.missingPmMonths,
      projectionAsOfMonth: asOfMonth,
    });
    items.push({ ...old, jobListId: p.jobListId, items: rows });
  }
  return { projects, monthly: { ...legacyMonthly, items }, asOfMonth };
}
function nextMonth(month) { const [y, m] = month.split('-').map(Number); return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`; }

export function projectionSourceLabel(project) {
  if (project?.projectCompleted) return 'Historical comparison';
  return project?.hasPmForecast ? 'PM Projection' : 'System Estimate';
}

// Known-amount sums carry their coverage explicitly. Blank PM entries are never
// converted into zero, baseline or a claim that a forecast is complete.
export function aggregateCurrentMonthly(rows, fromMonth, throughMonth) {
  const selected = (rows || []).filter(r => ym(r.monthStart) >= fromMonth && ym(r.monthStart) <= throughMonth);
  const missingPmMonths = selected.reduce((n, r) => n + (r.missingPmMonths || 0), 0);
  const estimateValueCount = selected.filter(r => r.primaryProjectionSource !== PM_SOURCE && nullableAmount(r.projectedAmount) !== null).length;
  const projectionValueCount = selected.filter(r => nullableAmount(r.projectedAmount) !== null).length;
  const actualValueCount = selected.filter(r => nullableAmount(r.actualAmount) !== null).length;
  const projected = sumAmounts(selected.map(r => r.projectedAmount), selected.length ? null : 0);
  const actual = sumAmounts(selected.map(r => r.actualAmount), 0);
  const baseline = sumAmounts(selected.map(r => own(r, 'systemBaselineAmount') ? r.systemBaselineAmount : r.projectedAmount), selected.length ? null : 0);
  const missingMarginRows = selected.reduce((n, r) => n + (Number(r.missingMarginRows) || 0), 0);
  const marginDataComplete = !selected.some(r => r.marginDataComplete === false || Number(r.missingMarginRows) > 0);
  const marginCollected = marginDataComplete ? sumAmounts(selected.map(r => r.marginCollected), 0) : null;
  return { projected, baseline, actual, missingPmMonths, projectionValueCount, actualValueCount, estimateValueCount,
    variance: missingPmMonths || !actualValueCount ? null : amountDifference(actual, projected),
    marginCollected, missingMarginRows, marginDataComplete,
    weightedHistoricalMarginPercent: marginDataComplete && Math.abs(actual) > 0.000001 ? (marginCollected / actual) * 100 : null,
  };
}

export function summarizePortfolioMonths(months, projects, currentMonthly, bids, bidMonthly) {
  const grouped = new Map(months.map(m => [m, []]));
  const weighted = new Map(months.map(m => [m, []]));
  for (const p of projects) for (const row of currentMonthly.get(p.jobListId) || []) grouped.get(ym(row.monthStart))?.push(row);
  for (const p of bids) for (const row of bidMonthly.get(p.sharePointItemId) || []) weighted.get(ym(row.monthStart))?.push(row.weightedMonthlyForecastAmount);
  return months.map(month => {
    const a = aggregateCurrentMonthly(grouped.get(month), month, month);
    const weightedBids = sumAmounts(weighted.get(month), 0);
    const combined = sumAmounts([a.projected, ...(weighted.get(month).length ? [weightedBids] : [])]);
    return { month, currentProjected: a.projected, currentBaseline: a.baseline, currentActual: a.actual,
      currentMarginCollected: a.marginCollected, currentWeightedHistoricalMarginPercent: a.weightedHistoricalMarginPercent,
      currentMissingMarginRows: a.missingMarginRows, currentMarginDataComplete: a.marginDataComplete,
      estimateValueCount:a.estimateValueCount, missingPmMonths: a.missingPmMonths, actualValueCount: a.actualValueCount, weightedBids,
      combinedExpected: combined,
      variance: a.missingPmMonths || !a.actualValueCount ? null : amountDifference(a.actual, combined),
    };
  });
}
export function summarizeMonthlyTotals(rows) {
  const sum = name => sumAmounts(rows.map(r => r[name]), rows.length ? null : 0);
  const missingPmMonths = rows.reduce((n, r) => n + r.missingPmMonths, 0);
  const actualValueCount = rows.reduce((n, r) => n + r.actualValueCount, 0);
  const currentActual = sum('currentActual'), combinedExpected = sum('combinedExpected');
  const currentMarginDataComplete = rows.every(r => r.currentMarginDataComplete);
  const currentMarginCollected = currentMarginDataComplete ? sum('currentMarginCollected') : null;
  return { currentProjected: sum('currentProjected'), currentBaseline: sum('currentBaseline'), weightedBids: sum('weightedBids'),
    currentActual, combinedExpected, missingPmMonths, estimateValueCount:rows.reduce((n,r)=>n+(r.estimateValueCount||0),0),
    variance: missingPmMonths || !actualValueCount ? null : amountDifference(currentActual, combinedExpected),
    currentMarginDataComplete, currentMarginCollected,
    currentMissingMarginRows: rows.reduce((n, r) => n + r.currentMissingMarginRows, 0),
    currentWeightedHistoricalMarginPercent: currentMarginDataComplete && Math.abs(currentActual) > 0.000001 ? currentMarginCollected / currentActual * 100 : null,
  };
}

export function pivotCurrentCell(row, month) {
  if (!row) return { month, hasActivity: false, projected: null, actual: null, variance: null, marginCollected: null, baseline: null, missingPmMonths: 0 };
  const projected = nullableAmount(row.projectedAmount), actual = nullableAmount(row.actualAmount);
  return { month, hasActivity: projected !== null || actual !== null || row.missingPmMonths > 0,
    projected, actual, variance: amountDifference(actual, projected), marginCollected: nullableAmount(row.marginCollected),
    baseline: nullableAmount(own(row, 'systemBaselineAmount') ? row.systemBaselineAmount : row.projectedAmount),
    missingPmMonths: row.missingPmMonths || 0,
    isSystemEstimate:row.primaryProjectionSource!==PM_SOURCE && !row.hasPmForecast,
  };
}
export function pivotTotals(rows, index, metric, includeBids) {
  const cells = rows.map(row => ({ source: row.source, c: index === null ? row.total : row.cells[index] }));
  const current = cells.filter(x => x.source !== 'bid').map(x => x.c);
  const bid = cells.filter(x => x.source === 'bid').map(x => x.c);
  const projectedValue = sumAmounts(current.map(c => c?.projected), current.length ? null : 0);
  const bidProjectedValue = includeBids ? sumAmounts(bid.map(c => c?.projected), bid.length ? null : 0) : null;
  const actualValue = sumAmounts(current.map(c => c?.actual));
  const missingPmMonths = current.reduce((n, c) => n + (c?.missingPmMonths || 0), 0);
  let value = sumAmounts(cells.map(x => x.c?.[metric]));
  if (metric === 'variance') value = missingPmMonths ? null : amountDifference(actualValue, sumAmounts([projectedValue, bidProjectedValue]));
  if (metric === 'marginCollected' && current.some(c => c?.marginCollected == null && c?.actual != null && c.actual !== 0)) value = null;
  return { value, projectedValue, bidProjectedValue, actualValue, missingPmMonths,
    hasSystemEstimate:current.some(c=>c?.isSystemEstimate && c?.projected!=null),
    baselineValue: sumAmounts(current.map(c => c?.baseline)),
    activeProjectsBilled: current.filter(c => c?.actual != null && c.actual !== 0).length,
    potentialBidsProjected: bid.filter(c => c?.projected != null && c.projected !== 0).length,
  };
}

export function buildMonthlyProjectionExport(projects, currentMonthly, bids, bidMonthly, from, through, canViewMargin = false) {
  const headers = ['Source', 'Projection Source', 'Job List ID', 'Job Number', 'Bid ID', 'Project / Bid', 'Month',
    'Primary Projected Amount', 'PM Projection Amount', 'System Baseline Amount', 'Actual Billings', 'Variance vs Primary',
    'PM Entry Present', 'Latest PM Version ID', 'Latest PM Version Number'];
  if (canViewMargin) headers.push('Margin Collected', 'Margin Data Complete');
  const rows = [];
  for (const p of projects) for (const m of currentMonthly.get(p.jobListId) || []) {
    if (ym(m.monthStart) < from || ym(m.monthStart) > through) continue;
    const row = { 'Source': 'Current Project', 'Projection Source': projectionSourceLabel(p), 'Job List ID': p.jobListId,
      'Job Number': p.jobNumber, 'Bid ID': '', 'Project / Bid': p.jobName, 'Month': ym(m.monthStart),
      'Primary Projected Amount': nullableAmount(m.projectedAmount), 'PM Projection Amount': m.pmForecastAmount ?? null,
      'System Baseline Amount': own(m, 'systemBaselineAmount') ? m.systemBaselineAmount : m.projectedAmount,
      'Actual Billings': m.actualAmount ?? null, 'Variance vs Primary': amountDifference(m.actualAmount, m.projectedAmount),
      'PM Entry Present': p.hasPmForecast ? (m.pmForecastAmount == null ? 'No' : 'Yes') : 'Not submitted',
      'Latest PM Version ID': p.latestForecastVersionId ?? '', 'Latest PM Version Number': p.latestForecastVersionNumber ?? '',
    };
    if (canViewMargin) { row['Margin Collected'] = m.marginCollected ?? null; row['Margin Data Complete'] = m.marginDataComplete === false ? 'No' : 'Yes'; }
    rows.push(row);
  }
  for (const p of bids) for (const m of bidMonthly.get(p.sharePointItemId) || []) {
    if (ym(m.monthStart) < from || ym(m.monthStart) > through) continue;
    rows.push({ 'Source': 'Active Bid', 'Projection Source': 'Probability-weighted Bid', 'Job List ID': '', 'Job Number': '',
      'Bid ID': p.sharePointItemId, 'Project / Bid': p.bidName, 'Month': ym(m.monthStart),
      'Primary Projected Amount': m.weightedMonthlyForecastAmount, 'PM Projection Amount': null,
      'System Baseline Amount': null, 'Actual Billings': null, 'Variance vs Primary': null,
      'PM Entry Present': 'Not applicable', 'Latest PM Version ID': '', 'Latest PM Version Number': '',
    });
  }
  return { headers, rows };
}
