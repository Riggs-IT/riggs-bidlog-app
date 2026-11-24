// One roster component, two real project identity scopes. Never synthesize JobListID.
export function additionalMemberScope({jobListId, setupId}) {
  if (setupId != null) {
    if (jobListId != null || typeof setupId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(setupId)) return null;
    const id = setupId.toLowerCase();
    return {url:`/api/project-setups/jis/${id}/additional-members`, setupId:id, jobListId:null};
  }
  const id = Number(jobListId);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647
    ? {url:`/api/active-projects/${id}/additional-members`, jobListId:id} : null;
}
export function validRosterIdentity(value, scope) {
  return !!scope && value?.jobListId === scope.jobListId && value.persistence === 'SQL_ROSTER_ONLY'
    && value.externalWrites === 0 && Number.isSafeInteger(value.rosterRevision) && value.rosterRevision >= 0
    && (!scope.setupId || value.setupId === scope.setupId);
}
export function validRoster(value, scope) {
  if (!validRosterIdentity(value,scope) || !Array.isArray(value.members) || !Array.isArray(value.directory)
      || !Array.isArray(value.timeline) || (scope.setupId && (typeof value.canEdit !== 'boolean' || value.canDistribute !== false))) return false;
  const id = n => Number.isSafeInteger(n) && n>0 && n<=2147483647;
  return value.members.every(m=>id(m.itUserId)&&typeof m.label==='string')
    && new Set(value.members.map(m=>m.itUserId)).size===value.members.length
    && value.directory.every(m=>id(m.id)&&typeof m.label==='string')
    && new Set(value.directory.map(m=>m.id)).size===value.directory.length;
}
export function rosterCanEdit(author, data, scope) {
  return author===true && !!data && !!scope && (!scope.setupId || data.canEdit===true);
}
