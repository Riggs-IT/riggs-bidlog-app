/** Stage F0 presentation contract: no tokens, OAuth, network reads, or writes. */
const statuses = new Set(['AVAILABLE', 'PARTIAL', 'ACCESS_DENIED',
  'RECONNECT_REQUIRED', 'NO_DATAVERSE_OR_NOT_FOUND', 'THROTTLED',
  'NETWORK_UNAVAILABLE', 'UPSTREAM_UNAVAILABLE', 'INVALID_RESPONSE',
  'RESPONSE_TOO_LARGE', 'UNEXPECTED_STATUS', 'INVALID_CONTINUATION_URL']);
const states = new Set(['DRAFT', 'PUBLISHED', 'ACTIVATED', 'SUSPENDED', 'OFF', 'ON', 'UNKNOWN']);

function record(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value, max = 180) { return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null; }
export function flowInventoryEvidence(payload) {
  if (!record(payload) || !statuses.has(payload.availability)) {
    return {availability:'UNVERIFIED', flows:null, count:null, isComplete:false};
  }
  const base = {availability:payload.availability, flows:null, count:null, isComplete:false};
  if (!['AVAILABLE', 'PARTIAL'].includes(payload.availability)) return base;
  if (!Array.isArray(payload.flows) || !['SELECTED_ENVIRONMENT_ONLY'].includes(payload.coverage)
    || typeof payload.hasMore !== 'boolean') return {...base, availability:'UNVERIFIED'};
  const normalized = [];
  for (const row of payload.flows) {
    if (!record(row) || !text(row.workflowId, 36) || !text(row.environmentId, 96) || !text(row.name)
      || !states.has(row.platformState) || row.lastRunState !== 'NOT_COLLECTED') {
      return {...base, availability:'UNVERIFIED'};
    }
    normalized.push({workflowId:row.workflowId, environmentId:row.environmentId,
      name:row.name, platformState:row.platformState,
      modifiedAtUTC:row.modifiedAtUTC || null, lastRunState:'NOT_COLLECTED'});
  }
  return {availability:payload.availability, flows:normalized,
    count:normalized.length, isComplete:payload.availability === 'AVAILABLE' && !payload.hasMore};
}

export function flowRunEvidence(payload) {
  if (!record(payload) || !statuses.has(payload.availability) ||
    !['AVAILABLE', 'PARTIAL'].includes(payload.availability)) {
    return {availability:payload?.availability || 'UNVERIFIED', observedRuns:null,
      lastSuccessInReturnedSampleUTC:null};
  }
  if (!Array.isArray(payload.runs) || payload.coverage !== 'BOUNDED_SELECTED_FLOW_SAMPLE_ONLY') {
    return {availability:'UNVERIFIED', observedRuns:null, lastSuccessInReturnedSampleUTC:null};
  }
  return {availability:payload.availability, observedRuns:payload.runs.length,
    lastSuccessInReturnedSampleUTC:payload.lastSuccessInReturnedSampleUTC || null,
    caveat:'Only the returned sample; not full run history or a guaranteed last success'};
}
