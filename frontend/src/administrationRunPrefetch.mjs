import {flowDirectoryPage} from './administrationPowerAutomateEvidence.mjs';
import {checkedFlowKey, selectedFlowInspection, verifiedRunObservation} from './administrationFlowInspection.mjs';

export const RUN_BATCH_SIZE = 4;
export const PAGE_RUN_CHECK_LIMIT = 25;
export const RUN_CACHE_TTL_MS = 2 * 60 * 1000;

export const HALT_RUN_PREFETCH = new Set([
  'THROTTLED', 'RUNTIME_TOKEN_REJECTED', 'RUNTIME_TOKEN_GRANT_REJECTED',
  'RUNTIME_CONSENT_REQUIRED', 'RUNTIME_REAUTH_REQUIRED', 'RUNTIME_INTERACTION_REQUIRED',
  'RUNTIME_INVALID_SCOPE', 'RUNTIME_RESOURCE_NOT_FOUND', 'RUNTIME_CLIENT_AUTH_FAILED',
  'RUNTIME_CREDENTIAL_UNAVAILABLE',
  'NETWORK_UNAVAILABLE', 'UPSTREAM_UNAVAILABLE', 'READ_UNAVAILABLE',
]);

// Take one stable snapshot. Never drive this from the changing checked-run
// sort; otherwise checked flows can migrate between pages and cause a loop.
export function pageRunCandidates(flows, view, observations, cache, now = Date.now()) {
  const page = flowDirectoryPage(flows, {...view, observations});
  return page.rows.slice(0, PAGE_RUN_CHECK_LIMIT).filter(flow => {
    const item = cache.get(checkedFlowKey(flow));
    return !item || !Number.isFinite(item.checkedAt) || now - item.checkedAt >= RUN_CACHE_TTL_MS;
  });
}

export function batchRunQuery(flows) {
  if (!Array.isArray(flows) || !flows.length || flows.length > RUN_BATCH_SIZE) return null;
  const query = new URLSearchParams();
  for (const flow of flows) {
    if (!/^[a-z0-9][a-z0-9-]{0,95}$/i.test(flow?.environmentId || '') ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(flow?.workflowId || '')) return null;
    query.append('flow', `${flow.environmentId}:${flow.workflowId}`);
  }
  return query.toString();
}

// Validate every identity and response before publishing anything. A partial,
// mismatched batch must not attribute another workflow's run to this row.
export function validateRunBatch(flows, payload) {
  if (!Array.isArray(flows) || !Array.isArray(payload?.results) ||
    flows.length !== payload.results.length || flows.length > RUN_BATCH_SIZE) return null;
  const results = [];
  for (let index = 0; index < flows.length; index++) {
    const flow = flows[index];
    const result = payload.results[index];
    if (result?.environmentId?.toLowerCase() !== flow.environmentId.toLowerCase() ||
      result?.resourceId?.toLowerCase() !== flow.workflowId.toLowerCase()) return null;
    const inspection = selectedFlowInspection(result);
    if (!inspection.valid) return null;
    const observation = verifiedRunObservation(inspection);
    if (['AVAILABLE', 'PARTIAL'].includes(inspection.runAvailability) &&
      (!inspection.runs.length || inspection.runIdentitySource !== 'RUNTIME_EXACT_RESOURCE_ENDPOINT')) return null;
    results.push({key:checkedFlowKey(flow), payload:result,
      observation, availability:inspection.runAvailability});
  }
  return results;
}
