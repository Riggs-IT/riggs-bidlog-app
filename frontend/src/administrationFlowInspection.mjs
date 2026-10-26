/** Strict, presentation-only mapping of fixed provider evidence. No API calls. */
const STATE_NAMES = Object.freeze({
  DRAFT: 'Draft', PUBLISHED: 'Published', ACTIVATED: 'Activated',
  SUSPENDED: 'Suspended', OFF: 'Off', ON: 'On',
  UNKNOWN: 'Not reported',
});
const RUN_NAMES = Object.freeze({
  SUCCEEDED: 'Succeeded', FAILED: 'Failed', RUNNING: 'Running',
  CANCELLED: 'Cancelled', TIMEDOUT: 'Timed out', SKIPPED: 'Skipped',
  WAITING: 'Waiting', UNKNOWN: 'Not reported',
});
const safeGuid = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const safeEnvironmentId = value => typeof value === 'string' &&
  /^[a-z0-9][a-z0-9-]{0,95}$/i.test(value);

export function isRiggsDefaultEnvironment(flow) {
  if (!flow || typeof flow !== 'object') return false;
  return (typeof flow.environmentId === 'string' && /^default-[0-9a-f-]{36}$/i.test(flow.environmentId)) ||
    (typeof flow.environmentName === 'string' && /^riggs companies\s*\(default\)$/i.test(flow.environmentName.trim()));
}

export function flowStateLabel(code) { return STATE_NAMES[code] || 'Not reported'; }
export function runStatusLabel(code) { return RUN_NAMES[code] || 'Not reported'; }

export function powerAutomateFlowUrl(flow) {
  if (!safeEnvironmentId(flow?.environmentId) || !safeGuid(flow?.workflowId)) return null;
  return `https://make.powerautomate.com/environments/${encodeURIComponent(flow.environmentId)}/flows/${encodeURIComponent(flow.workflowId)}/details`;
}

export function powerAutomateRunUrl(flow, runId) {
  if (!safeEnvironmentId(flow?.environmentId) || !safeGuid(flow?.workflowId) ||
    typeof runId !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(runId)) return null;
  return `https://make.powerautomate.com/environments/${encodeURIComponent(flow.environmentId)}/flows/${encodeURIComponent(flow.workflowId)}/runs/${encodeURIComponent(runId)}`;
}

// Normalize unknown Microsoft states without turning absence/error into zero.
export function selectedFlowInspection(payload) {
  const invalid = {valid:false, detailAvailability:'UNVERIFIED', platformState:'UNKNOWN',
    stateSource:'NOT_VERIFIED', runAvailability:'UNVERIFIED', runs:[],
    lastSuccess:null, lastFailure:null, lastReturnedRun:null, hasMore:null, runIdentitySource:'NOT_CHECKED'};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
    !payload.details || !payload.runHistory ||
    typeof payload.details.availability !== 'string' ||
    typeof payload.runHistory.availability !== 'string' ||
    !Array.isArray(payload.runHistory.runs) || payload.runHistory.runs.length > 20) return invalid;
  const runs = payload.runHistory.runs;
  if (!runs.every(r => r && typeof r === 'object' &&
    typeof r.runId === 'string' && r.runId.length <= 180)) return invalid;
  const normalized = [...runs].sort((a, b) =>
    String(b.startedAtUTC || '').localeCompare(String(a.startedAtUTC || '')));
  const latest = normalized.find(r => r.startedAtUTC || r.endedAtUTC) || null;
  const failed = normalized.filter(r => r.status === 'FAILED')
    .map(r => r.endedAtUTC || r.startedAtUTC).filter(Boolean).sort().reverse();
  return {valid:true, detailAvailability:payload.details.availability,
    platformState:payload.details.platformState || 'UNKNOWN',
    stateSource:payload.details.stateSource || 'NOT_VERIFIED',
    runAvailability:payload.runHistory.availability, runs:normalized,
    lastSuccess:payload.runHistory.lastSuccessInReturnedSampleUTC || null,
    lastFailure:failed[0] || null, lastReturnedRun:latest,
    hasMore:payload.runHistory.hasMore ?? null,
    runIdentitySource:payload.runIdentitySource || 'NOT_CHECKED',
    reasonCode:payload.runHistory.reasonCode || null};
}

export function inspectionMessage(evidence) {
  switch (evidence.runAvailability) {
    case 'IDENTITY_NOT_VERIFIED': return 'Microsoft has not verified this flow’s run-history identity. Open it in Power Automate to see recent runs.';
    case 'NO_RUNS_REPORTED': return 'Microsoft returned no recent runs for the verified workflow ID. This does not prove the flow has never run.';
    case 'AVAILABLE': return evidence.runs.length ?
      'Recent execution records returned by Microsoft.' : 'No recent runs returned.';
    case 'PARTIAL': return 'Only part of the available run history was returned.';
    case 'NO_DATAVERSE_OR_NOT_FOUND': return 'This Microsoft API could not retrieve runs for this environment or flow. Try opening it in Power Automate.';
    case 'ACCESS_DENIED': return 'Microsoft did not grant this account permission to read these runs.';
    case 'THROTTLED': return 'Microsoft throttled this lookup. Try again later.';
    case 'RECONNECT_REQUIRED': return 'Your delegated Microsoft connection needs to be renewed.';
    case 'NOT_CHECKED': return evidence.detailAvailability === 'NO_DATAVERSE_OR_NOT_FOUND'
      ? 'Microsoft could not access this flow through the environment API, so no runs were checked. Use Open in Power Automate to inspect it there.'
      : evidence.detailAvailability === 'ACCESS_DENIED'
        ? 'Microsoft denied this account access to the selected flow. No run lookup was attempted.'
        : `Flow lookup: ${evidence.detailAvailability}. Run retrieval was not attempted.`;
    case 'INVALID_RESPONSE': return 'Microsoft returned a run response the app could not verify.';
    default: return `Run history unavailable: ${evidence.runAvailability}.`;
  }
}

// Only bound, verified inspection results can produce green/red health markers.
const VERIFIED_ID_SOURCES = new Set(['DIRECT_CLOUD_FLOW_READ', 'TENANT_WORKFLOW_ENTITY_ID']);
export function checkedFlowKey(flow) {
  return `${flow?.environmentId || ''}:${flow?.workflowId || ''}`;
}
export function verifiedRunObservation(evidence) {
  if (!evidence?.valid || !VERIFIED_ID_SOURCES.has(evidence.runIdentitySource) ||
    !['AVAILABLE', 'PARTIAL'].includes(evidence.runAvailability)) return null;
  const run = evidence.lastReturnedRun;
  if (!run || !['SUCCEEDED', 'FAILED', 'RUNNING', 'CANCELLED', 'TIMEDOUT', 'SKIPPED', 'WAITING'].includes(run.status) ||
    typeof run.startedAtUTC !== 'string' || !Number.isFinite(Date.parse(run.startedAtUTC))) return null;
  return {status:run.status, startedAtUTC:run.startedAtUTC,
    lastSuccessUTC:evidence.lastSuccess, lastFailureUTC:evidence.lastFailure};
}
