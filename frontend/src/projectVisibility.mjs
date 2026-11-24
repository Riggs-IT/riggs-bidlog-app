// Business-display exclusions only. Do not delete jobs or filter the shared
// financial certification inputs, and do not treat a BidLog ID as a job ID.
const hiddenNames = new Set(['riggs yard', 'test - automation']);
const normalized = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const isHiddenProjectName = value => {
  const name = normalized(value);
  return hiddenNames.has(name) || /^riggs yard (?:19|20)\d{2}$/.test(name);
};
export function isHiddenProject(row) {
  if (!row) return false;
  return String(row.jobListId ?? '').trim() === '24'
    || String(row.jobNumber ?? '').trim() === '11111'
    || [row.jobName, row.projectName, row.controlProjectName].some(isHiddenProjectName);
}
export function visibleProjects(rows) {
  return (rows || []).filter(row => !isHiddenProject(row));
}
// Related notification rows may have only an ID. Scope their exclusions to
// known project identities, without hiding legitimate bid IDs or staff names.
export function visibleProjectRelated(rows, projects = []) {
  const hiddenIds = new Set(projects.filter(row => row?.jobListId != null && isHiddenProject(row)).map(row => String(row.jobListId)));
  return visibleProjects(rows).filter(row => !hiddenIds.has(String(row.jobListId)));
}
