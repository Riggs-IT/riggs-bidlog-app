// Historical-only adapter for the existing ProjectBillingPivot. All amounts
// come from the authorized completed monthly API; no PM forecast is invented.
import {nullableAmount, sumAmounts} from './primaryProjection.js';

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const monthNumber = value => {
  const match = String(value || '').match(MONTH);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
};
const monthFromNumber = n =>
  `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}`;

export function addCompletedMonths(month, delta) {
  const index = monthNumber(month);
  if (index === null || !Number.isSafeInteger(delta)) return null;
  return monthFromNumber(index + delta);
}

export function defaultCompletedMonths(now = new Date()) {
  // Local browser month; the values are date-only, never UTC timestamps.
  const through = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {from: addCompletedMonths(through, -23), through};
}

export function completedMonthRange(from, through) {
  const start = monthNumber(from);
  const end = monthNumber(through);
  if (start === null || end === null || start > end || end - start >= 36) {
    return [];
  }
  return Array.from({length: end - start + 1}, (_, i) => monthFromNumber(start + i));
}

export function completedMonthLabel(month) {
  const index = monthNumber(month);
  if (index === null) return month;
  return new Intl.DateTimeFormat('en-US', {month: 'short', year: 'numeric', timeZone: 'UTC'})
    .format(new Date(Date.UTC(Math.floor(index / 12), index % 12, 1, 12)));
}

export function normalizeCompletedMonthly(payload, months) {
  if (!payload || !Array.isArray(payload.items) || !Array.isArray(months) || !months.length ||
      payload.startMonth !== `${months[0]}-01` ||
      payload.endMonth !== `${months[months.length - 1]}-01` ||
      payload.monthRowCount !== payload.items.length) {
    throw new Error('Completed monthly response does not match the selected range.');
  }
  const byId = new Map();
  const seen = new Set();
  for (const item of payload.items) {
    const id = item?.jobListId;
    const date = item?.monthStart;
    const month = typeof date === 'string' ? date.slice(0, 7) : '';
    if (!Number.isSafeInteger(id) || id < 1 || date !== `${month}-01` ||
        !months.includes(month) || !own(item, 'actualAmount')) {
      throw new Error('Completed monthly history contains an invalid record.');
    }
    // Numeric validation must not conflate NULL with zero.
    nullableAmount(item.actualAmount);
    if (own(item, 'marginCollected')) nullableAmount(item.marginCollected);
    const key = `${id}:${month}`;
    if (seen.has(key)) throw new Error('Completed monthly history contains duplicate months.');
    seen.add(key);
    const rows = byId.get(id) || [];
    rows.push(item);
    byId.set(id, rows);
  }
  if (payload.projectCount !== byId.size) {
    throw new Error('Completed monthly history project count is inconsistent.');
  }
  return byId;
}

function approvedMargin(rows, canViewMargin) {
  if (!canViewMargin || !rows.length) return null;
  if (rows.some(row =>
    row.marginDataComplete === false || Number(row.missingMarginRows || 0) > 0 ||
    (nullableAmount(row.actualAmount) !== null && nullableAmount(row.actualAmount) !== 0
      && (row.marginCollected === null || row.marginCollected === undefined))
  )) return null;
  return sumAmounts(rows.map(row => row.marginCollected ?? null));
}

export function completedHistoryView(projects, byId, months, {canViewMargin = false, pmIdentityByName = new Map()} = {}) {
  // A project without rows stays in the directory/pivot, with NULL cells.
  const currentMonthly = new Map();
  const currentProjects = [];
  const projectIds = new Set(projects.map(project => Number(project.jobListId)));
  let withoutRows = 0;
  for (const row of projects) {
    const id = Number(row.jobListId);
    const periodRows = byId.get(id) || [];
    if (!periodRows.length) withoutRows += 1;
    currentMonthly.set(id, periodRows);
    const actual = periodRows.filter(month => month.actualAmount != null);
    const pm = pmIdentityByName.get(String(row.projectManager || '').trim().toLowerCase());
    currentProjects.push({
      ...row,
      pm: row.projectManager,
      pe: row.projectEngineer,
      gc: row.generalContractor,
      generalContractors: row.generalContractor,
      pmInitials: pm?.initials,
      pmHexColor: pm?.hexColor,
      projectCompleted: true,
      selectedActual: sumAmounts(actual.map(item => item.actualAmount)),
      selectedActualValueCount: actual.length,
      selectedMarginCollected: approvedMargin(periodRows, canViewMargin),
    });
  }

  const monthlySummary = months.map(month => {
    const records = [];
    for (const [id, rows] of byId) {
      if (!projectIds.has(id)) continue;
      const record = rows.find(row => row.monthStart === `${month}-01`);
      if (record) records.push(record);
    }
    return {
      month,
      projectsWithRecords: records.length,
      billedProjects: records.filter(row => nullableAmount(row.actualAmount) !== 0 && row.actualAmount != null).length,
      actual: sumAmounts(records.map(row => row.actualAmount)),
      marginCollected: approvedMargin(records, canViewMargin),
      billedAfterEnd: records.filter(row => row.isAfterResolvedEnd === true &&
        row.actualAmount != null && nullableAmount(row.actualAmount) !== 0).length,
    };
  });

  return {currentProjects, currentMonthly, monthlySummary, projectsWithoutRows: withoutRows};
}
