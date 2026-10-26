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

// Client-side directory navigation only. The server's sample/coverage limits
// remain authoritative; paging here must never imply a complete tenant total.
export function flowDirectoryEnvironments(flows) {
  if (!Array.isArray(flows)) return [];
  const seen = new Map();
  for (const flow of flows) {
    if (text(flow?.environmentId, 96) && !seen.has(flow.environmentId)) {
      seen.set(flow.environmentId, text(flow.environmentName, 160) || 'Unnamed environment');
    }
  }
  return [...seen.entries()]
    .map(([id, name]) => ({id, name}))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function flowDirectoryPage(flows, {search = '', environmentId = 'ALL', page = 1, pageSize = 25,
  sortBy = 'MODIFIED', observations = {}} = {}) {
  if (!Array.isArray(flows)) return {rows: [], matched: 0, pages: 1, page: 1, start: 0, end: 0};
  const needle = typeof search === 'string' ? search.trim().toLocaleLowerCase() : '';
  const filtered = flows.filter(flow => {
    if (environmentId !== 'ALL' && flow.environmentId !== environmentId) return false;
    return !needle || [flow.name, flow.environmentName]
      .some(value => typeof value === 'string' && value.toLocaleLowerCase().includes(needle));
  });
  // Verified failures are prioritized, followed by other verified executions
  // in last-run order. All unchecked flows fall back to last modification.
  // NEVER infer a run timestamp from an edited flow's modified date.
  if (sortBy === 'RUNS') filtered.sort((a, b) => {
    const ao = observations?.[`${a.environmentId}:${a.workflowId}`];
    const bo = observations?.[`${b.environmentId}:${b.workflowId}`];
    const aKnown = !!ao?.startedAtUTC;
    const bKnown = !!bo?.startedAtUTC;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (aKnown && bKnown) {
      const aFailed = ao.status === 'FAILED', bFailed = bo.status === 'FAILED';
      if (aFailed !== bFailed) return aFailed ? -1 : 1;
      const time = String(bo.startedAtUTC).localeCompare(String(ao.startedAtUTC));
      if (time) return time;
    }
    const modified = String(b.modifiedAtUTC || '').localeCompare(String(a.modifiedAtUTC || ''));
    return modified || String(a.name || '').localeCompare(String(b.name || ''));
  });
  const size = [25, 50].includes(pageSize) ? pageSize : 25;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Number.isSafeInteger(page) ? Math.max(1, Math.min(page, pages)) : 1;
  const offset = (safePage - 1) * size;
  return {
    rows: filtered.slice(offset, offset + size), matched: filtered.length,
    pages, page: safePage,
    start: filtered.length ? offset + 1 : 0,
    end: Math.min(offset + size, filtered.length),
  };
}
