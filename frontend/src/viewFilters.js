/** Read-only population/facet rules shared by the overview and directories. */
export const ALL_FILTER = '__ALL__';
export function isCompleted(project) {
  const value = project?.projectCompleted;
  return value === true || value === 1 || String(value ?? '').trim().toLowerCase() === 'true' || value === '1';
}
export function projectDirectoryRows(active, completed = [], includeCompleted = false) {
  const unique = new Map();
  for (const row of active || []) if (!isCompleted(row)) unique.set(row.jobListId, row);
  if (includeCompleted) for (const row of [...(active || []), ...(completed || [])]) {
    if (isCompleted(row)) unique.set(row.jobListId, row);
  }
  return [...unique.values()];
}
export function hasMonthlyValues(rows, fromMonth, throughMonth, fields) {
  if (!/^\d{4}-\d{2}$/.test(fromMonth) || !/^\d{4}-\d{2}$/.test(throughMonth) || fromMonth > throughMonth) return false;
  return (rows || []).some(row => {
    const month = String(row.monthStart || '').slice(0, 7);
    return month >= fromMonth && month <= throughMonth && fields.some(field => {
      const v = row[field];
      return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
    });
  });
}
/** Each descriptor supplies represented values and optional special match logic.
 * Options honor every other active filter, but do not shrink to their own selected
 * value. Invalid selections disappear together with stale option values.
 */
export function facetRows(entries, selections, descriptors, all = ALL_FILTER) {
  const keys = Object.keys(descriptors);
  const matches = (entry, key, value) => value === all || value == null
    || (descriptors[key].matches ? descriptors[key].matches(entry, value)
      : descriptors[key].values(entry).includes(value));
  const select = (filters, skip) => entries.filter(entry => keys.every(key => key === skip || matches(entry, key, filters[key])));
  const represented = (rows, key) => [...new Set(rows.flatMap(entry => descriptors[key].values(entry))
    .filter(value => value !== null && value !== undefined && value !== ''))]
    .sort((a,b) => String(a).localeCompare(String(b), 'en', {numeric:true,sensitivity:'base'}));
  const effective = {...selections};
  for (const key of keys) if (effective[key] !== all && !represented(entries,key).includes(effective[key])) effective[key] = all;
  // A range/search/source change can invalidate a combination, even when each
  // individual value still exists elsewhere. No phantom selected option remains.
  const unavailable = keys.filter(key => effective[key] !== all && !represented(select(effective,key),key).includes(effective[key]));
  unavailable.forEach(key => { effective[key] = all; });
  const contexts = Object.fromEntries(keys.map(key => [key, select(effective,key)]));
  return { selections:effective, rows:select(effective), contexts,
    options:Object.fromEntries(keys.map(key => [key,represented(contexts[key],key)])) };
}
