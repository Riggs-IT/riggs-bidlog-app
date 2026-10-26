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

// Stage F1.1: merged accessible-environment inventory. API coverage is bounded;
// an upstream empty result must never become a verified tenant-wide zero.
export function unifiedFlowInventoryEvidence(payload) {
  const unverified = {availability:'UNVERIFIED', flows:null, environments:null,
    count:null, message:'Flow inventory has not been verified.'};
  if (!record(payload) || payload.coverage !== 'BOUNDED_ACCESSIBLE_ENVIRONMENTS_ONLY') return unverified;
  const availability = text(payload.availability, 40) || 'UNVERIFIED';
  if (!Array.isArray(payload.flows) || !Array.isArray(payload.environments)) {
    return {...unverified, availability};
  }
  const rows = [];
  for (const flow of payload.flows) {
    if (!record(flow) || !text(flow.workflowId,36) || !text(flow.environmentId,96)
      || !text(flow.environmentName,160) || !text(flow.name)
      || !states.has(flow.platformState) || flow.lastRunState !== 'NOT_COLLECTED') return unverified;
    rows.push({...flow});
  }
  if (typeof payload.hasMore !== 'boolean' || payload.coverageComplete !== false) return unverified;
  const envs = [];
  for (const env of payload.environments) {
    if (!record(env) || !text(env.environmentId,96) || !text(env.environmentName,160)
      || !text(env.availability,40)) return unverified;
    envs.push(env);
  }
  const zero = rows.length === 0;
  const providers = Array.isArray(payload.providerResults)
    ? payload.providerResults.filter(p => record(p) &&
      ['POWER_PLATFORM_TENANT_INVENTORY', 'DATAVERSE_ENVIRONMENT_API'].includes(p.provider) &&
      text(p.availability, 40) && Number.isInteger(p.rows) && p.rows >= 0)
      .map(p => ({provider: p.provider, availability: p.availability, rows: p.rows,
        hasMore: p.hasMore ?? null})) : [];
  const tenant = providers.find(p => p.provider === 'POWER_PLATFORM_TENANT_INVENTORY');
  const message = zero
    ? 'No flows returned by the checked Microsoft inventory sources. This does not verify that no Power Automate flows exist.'
    : `${rows.length} distinct flow identities returned. ${tenant?.availability === 'ACCESS_DENIED' ? 'Tenant inventory permission was denied; coverage remains incomplete.' : 'Tenant and environment API coverage are shown separately.'}`;
  return {availability, flows:rows, environments:envs, providers,
    count:zero ? null : rows.length, message};
}
