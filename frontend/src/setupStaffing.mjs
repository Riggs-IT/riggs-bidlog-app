import {createSetupOperationId,requestSetup,validId} from './projectSetupAuthoring.mjs';
import {validWindow,dateOnly} from './fieldTeamAvailability.mjs';

export const PILOT_STAFFING_SETUP='b83c8aa6-558b-545e-8bf8-7779236745f8';
export const supportsSetupStaffing=id=>typeof id==='string'&&id.toLowerCase()===PILOT_STAFFING_SETUP;
const safeId=v=>Number.isSafeInteger(v)&&v>0;
const revision=v=>Number.isSafeInteger(v)&&v>=0;
const role=v=>['SUPER','FOREMAN'].includes(v);
const dated=(a,b)=>dateOnly(a)===a&&dateOnly(b)===b&&validWindow(a,b);
export function staffingPath(setupId){
  if(!supportsSetupStaffing(setupId))throw Error('Unsupported setup staffing identity');
  return `/api/project-setups/jis/${setupId.toLowerCase()}/field-team/plans`;
}
export function validateStaffing(body,setupId){
  if(!supportsSetupStaffing(setupId)||body?.setupId!==setupId.toLowerCase()||!revision(body.revision)||typeof body.canEdit!=='boolean'||!Array.isArray(body.plans)||body.plans.length>10000)throw Error('Invalid staffing response');
  const ids=new Set(),people=new Set();let supers=0;
  for(const p of body.plans){
    if(!p||!safeId(p.scheduleId)||!safeId(p.employeeEid)||p.employeeEid>2147483647||!role(p.resourceRole)||typeof p.employeeName!=='string'||!p.employeeName.trim()||p.status!=='PLANNED'||typeof p.eligible!=='boolean'||!dated(p.effectiveStartDate,p.effectiveEndDate)||ids.has(p.scheduleId)||people.has(`${p.resourceRole}:${p.employeeEid}`))throw Error('Invalid staffing plan');
    ids.add(p.scheduleId);people.add(`${p.resourceRole}:${p.employeeEid}`);if(p.resourceRole==='SUPER')supers++;
  }
  if(supers>1)throw Error('Multiple planned superintendents');
  return body;
}
export function staffingCommand({snapshot,resourceRole,plan,employeeEid,startDate,endDate,remove=false,operationId=createSetupOperationId()}){
  if(!snapshot?.canEdit||!revision(snapshot.revision)||!role(resourceRole)||!validId(operationId)||snapshot.revision===Number.MAX_SAFE_INTEGER)throw Error('Staffing not editable');
  if(plan&&(!safeId(plan.scheduleId)||!snapshot.plans.some(p=>p.scheduleId===plan.scheduleId&&p.resourceRole===resourceRole)))throw Error('Plan identity changed');
  const base={operationId,expectedRevision:snapshot.revision,resourceRole};
  if(remove){if(!plan)throw Error('Plan required');return {...base,action:'REMOVE',scheduleId:plan.scheduleId};}
  if(!safeId(employeeEid)||employeeEid>2147483647||!dated(startDate,endDate))throw Error('Select an eligible employee and valid dates');
  if(snapshot.plans.some(p=>p.resourceRole===resourceRole&&p.scheduleId!==plan?.scheduleId&&(resourceRole==='SUPER'||p.employeeEid===employeeEid)))throw Error('Employee already planned');
  return {...base,action:plan?'EDIT':'ADD',...(plan?{scheduleId:plan.scheduleId}:{}),employeeEid,startDate,endDate};
}
export function validateStaffingReceipt(receipt,setupId,body){
  if(receipt?.setupId!==setupId.toLowerCase()||receipt.operationId!==body.operationId||receipt.revision!==body.expectedRevision+1||!safeId(receipt.scheduleId)||typeof receipt.replayed!=='boolean'||body.scheduleId!=null&&receipt.scheduleId!==body.scheduleId)throw Error('Unverified staffing receipt');
  return receipt;
}
export function verifyStaffingReadback(snapshot,receipt,body){
  if(snapshot.revision<receipt.revision)throw Error('Staffing readback is stale');
  if(snapshot.revision>receipt.revision)return snapshot; // Another valid operation occurred; display the newer authoritative state.
  const p=snapshot.plans.find(p=>p.scheduleId===receipt.scheduleId);
  if(body.action==='REMOVE'?Boolean(p):!p||p.resourceRole!==body.resourceRole||p.employeeEid!==body.employeeEid||p.effectiveStartDate!==body.startDate||p.effectiveEndDate!==body.endDate)throw Error('Staffing readback mismatch');
  return snapshot;
}
export async function loadStaffing(setupId,{signal,request=requestSetup}={}){
  return validateStaffing(await request(staffingPath(setupId),{signal}),setupId);
}
export async function saveStaffing(setupId,body,{request=requestSetup}={}){
  const receipt=validateStaffingReceipt(await request(staffingPath(setupId),{method:'PATCH',body}),setupId,body);
  try{
    const snapshot=verifyStaffingReadback(await loadStaffing(setupId,{request}),receipt,body);
    return {snapshot,receipt};
  }catch{throw Error('Staffing receipt accepted; readback not confirmed');}
}
