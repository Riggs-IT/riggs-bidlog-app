// AP4F: SQL draft-only workflow. No Cognito, bid-write, numbering or staffing calls.
export const EDITABLE_ROOTS = new Set([
  'jobName','numberOfBuildings','jobType','purpose','streetAddress','city','state',
  'postalCode','contractAmount','retentionPercent','anticipatedStartDate',
  'estimatedDurationMonths','gcContactInfo','projectOwnerInfo','bond','parcel',
  'scope','leed','ndaRequired','keywords','comments','buildingNames',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validId(value) {return typeof value === 'string' && UUID.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value);}
export function mayAuthor(user) {return String(user?.appRole || '').trim().toUpperCase() === 'ADMIN';}
export function awardCompleted(result) {
  return result?.action === 'Awarded' && result?.finalStatus === 'Awarded'
    && result?.transitionApplied === true && result?.cloneCreationComplete === true
    && Number.isInteger(result.expectedCloneCount) && result.expectedCloneCount >= 0
    && result.createdCloneCount === result.expectedCloneCount
    && Number.isInteger(result.sharePointItemId) && result.sharePointItemId > 0;
}
export function validateDraft(result) {
  const d = result?.setup;
  if (result?.persistence !== 'SQL_DRAFT_ONLY' || result?.externalState !== 'NOT_CONNECTED'
    || !d || !validId(d.setupId) || !validId(d.childId)
    || !Number.isInteger(d.originalBidLogId) || d.originalBidLogId <= 0
    || !Number.isInteger(d.revision) || d.revision <= 0
    || ['jobNumber','cognitoEntryId','jobListId'].some(k => d[k] !== null)
    || !d.values || Array.isArray(d.values) || !d.originatingBid
    || d.originatingBid.originalBidLogId !== d.originalBidLogId) throw new Error('Invalid draft response.');
  return d;
}
export function setupError(error) {
  const code = error?.code;
  if (error?.status === 401) return 'Your session expired. Sign in again; the last saved draft is retained.';
  if (error?.status === 403) return 'Draft editing currently requires an authorized Bid Log administrator.';
  if (code === 'project_setup_writes_disabled') return 'Project setup editing is not enabled yet. The bid award is not undone.';
  if (code === 'project_setup_reads_disabled') return 'Project setup reads are disabled. This is not an empty draft.';
  if (code === 'project_setup_award_sync_pending') return 'The awarded bid is still awaiting its existing mirror update. Retry setup only; do not award the bid again.';
  if (code === 'project_setup_award_version_changed') return 'The bid changed while setup was opening. Retry setup to load its current starting values.';
  if (code === 'project_setup_child_selection_required') return 'An existing child or job needs to be selected. Reload setup; do not create another child automatically.';
  if (error?.status === 409) return 'This draft or source changed. Your entries remain here. Reload the saved draft before making a new edit.';
  if (error?.status === 422) return 'Check the entered values and building count. The draft was not accepted.';
  return 'The result could not be verified. Retry setup, or retry the exact save; do not repeat the award.';
}
export async function requestSetup(path, {method='GET', body, signal, fetcher=fetch}={}) {
  const headers = {'Accept':'application/json'};
  if (method === 'GET') headers['X-Riggs-Passive-Read'] = '1';
  else {headers['Content-Type']='application/json';headers['X-Riggs-Setup-Write']='1';}
  const response = await fetcher(path, {method,headers,credentials:'same-origin',cache:'no-store',
    ...(body ? {body:JSON.stringify(body)} : {}), ...(signal ? {signal} : {})});
  let value;
  try {value = await response.json();} catch {value = null;}
  if (!response.ok) {
    const error = new Error('Setup request failed.');
    error.status = response.status;
    error.code = typeof value?.detail === 'string' ? value.detail : 'project_setup_invalid_response';
    throw error;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid setup response.');
  return value;
}
export async function openSetup(intent, {operationId,signal,request=requestSetup}={}) {
  if (validId(intent?.setupId)) {
    const response = await request(`/api/project-setups/drafts/${intent.setupId}`, {signal});
    const setup = validateDraft(response);
    if (setup.setupId !== intent.setupId) throw new Error('Invalid setup identity.');
    return {setup};
  }
  const bidId = intent?.originalBidLogId;
  if (!Number.isInteger(bidId) || bidId < 1 || !validId(operationId)) throw new Error('Invalid bid identity.');
  const path = `/api/project-setups/authoring/awards/${bidId}`;
  const context = await request(path,{signal});
  if (context.persistence !== 'SQL_DRAFT_ONLY' || context.originalBidLogId !== bidId
    || context.externalState !== 'NOT_CONNECTED'
    || !Array.isArray(context.choices) || context.choices.length > 50) throw new Error('Invalid source context.');
  if (context.choices.some(c=>!validId(c.setupId)||!validId(c.childId))) throw new Error('Invalid child identity.');
  if (context.mode === 'RESUME' && context.choices.length === 1) {
    return openSetup({setupId:context.choices[0].setupId},{signal,request});
  }
  if (context.mode === 'CHOOSE_CHILD' || context.mode === 'EXISTING_JOB_REVIEW') return {context};
  if (context.mode !== 'CREATE_INITIAL' || !/^[0-9a-f]{64}$/.test(context.sourceVersion)) throw new Error('Invalid source version.');
  const response = await request(`${path}/start`,{method:'POST',signal,
    body:{expectedSourceVersion:context.sourceVersion,operationId}});
  const setup = validateDraft(response);
  if (setup.originalBidLogId !== bidId || response.externalWrites !== 0) throw new Error('Invalid saved setup.');
  return {setup,reference:context};
}
export function readPath(object,path) {return path.split('.').reduce((o,k)=>o?.[k],object);}
export function setPath(object,path,value) {
  const keys = path.split('.');
  if (keys.some(k=>['__proto__','prototype','constructor'].includes(k))) throw new Error('Invalid field.');
  const result = structuredClone(object);
  let node = result;
  for (const key of keys.slice(0,-1)) node = node[key] ||= {};
  node[keys.at(-1)] = value;
  return result;
}
function normalized(path,value) {
  if (path === 'buildingNames') return value.map(v=>({cognitoRowId:v.cognitoRowId ?? null,name:v.name === '' ? null : v.name}));
  if (path === 'leed' || path === 'ndaRequired') {
    if (value === '' || value === null || value === undefined) return null;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    throw new Error('Choose Yes, No, or Not supplied.');
  }
  if (value === '' || value === undefined || value === null) return null;
  if (['numberOfBuildings','estimatedDurationMonths'].includes(path)) {
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw new Error('Enter a whole building count or duration.');
    const number = Number(value);
    if ((path === 'estimatedDurationMonths' && (number < 1 || number > 120)) || number > 2147483647)
      throw new Error('Duration must be 1–120 months and building count must be a supported whole number.');
    return number;
  }
  if (path === 'contractAmount' || path === 'retentionPercent') {
    const digits = path === 'retentionPercent' ? 6 : 4;
    if (!new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`).test(String(value))) throw new Error('Enter a nonnegative decimal amount or percent.');
    if (path === 'retentionPercent' && Number(value) > 100) throw new Error('Retention must be 0–100%.');
    // Decimal stays a string; never round operational money through binary floats.
    return String(value).replace(/^0+(?=\d)/,'').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
  }
  return value;
}
export function buildDraftChanges(base,form,touched) {
  let result = {};
  for (const path of touched) {
    if (!EDITABLE_ROOTS.has(path.split('.')[0])) throw new Error('Unsupported draft field.');
    const desired = normalized(path,readPath(form,path));
    const previous = normalized(path,readPath(base,path));
    if (JSON.stringify(desired) !== JSON.stringify(previous)) result = setPath(result,path,desired);
  }
  return result;
}
export function applyDraftChanges(base,changes) {
  const result = structuredClone(base);
  for (const [key,value] of Object.entries(changes)) {
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? applyDraftChanges(base[key] || {},value) : structuredClone(value);
  }
  return result;
}
export function validateEditReceipt(value,setupId,body) {
  if (value?.setupId !== setupId || value?.operationId !== body.operationId
    || value?.persisted !== true || value?.externalWrites !== 0
    || value?.persistence !== 'SQL_DRAFT_ONLY' || value?.sharedChangesState !== 'NOT_DISPATCHED'
    || !['UPDATED','UNCHANGED'].includes(value.action) || typeof value.replayed !== 'boolean'
    || value.revision !== body.expectedRevision + (value.action === 'UPDATED' ? 1 : 0))
    throw new Error('Save receipt could not be verified.');
  return value;
}

// Existing authorized Awarded reader, on demand; never a source of write identities.
export async function currentAwardReference(bidId,{request=requestSetup,signal}={}) {
  if (!Number.isInteger(bidId) || bidId<=0) throw new Error('Invalid bid identity.');
  const value=await request(`/api/bid-log/outcomes/${bidId}?status=Awarded`,{signal});
  if (value.originalBidLogId!==bidId || value.status!=='Awarded'
      || (value.notes!==null && (typeof value.notes!=='string'||value.notes.length>20000))
      || (value.generalContractors!==null && (typeof value.generalContractors!=='string'||value.generalContractors.length>1000)))
    throw new Error('Invalid awarded reference.');
  return {bidNotes:value.notes,gcSourceLabel:value.generalContractors};
}
