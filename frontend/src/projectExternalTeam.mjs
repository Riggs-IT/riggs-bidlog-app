import {validId} from './projectSetupAuthoring.mjs';
export function externalTeamScope(setupId,jobListId){
  if(validId(setupId)&&jobListId==null)return {setupId:setupId.toLowerCase(),jobListId:null,url:`/api/project-setups/jis/${setupId}/external-team`};
  if(setupId==null&&Number.isSafeInteger(Number(jobListId))&&Number(jobListId)>0&&Number(jobListId)<=2147483647&&Number(jobListId)!==24)return {setupId:null,jobListId:Number(jobListId),url:`/api/project-setups/jis/numbered/${Number(jobListId)}/external-team`};
  return null;
}
export function normalizeExternalContacts(rows){
  if(!Array.isArray(rows)||rows.length>100)throw Error('A project can have up to 100 external contacts.');
  const seen=new Set();
  return rows.map((row,i)=>{
    if(!row||typeof row.name!=='string'||typeof row.email!=='string')throw Error(`Check contact ${i+1}.`);
    const name=row.name.trim(),email=row.email.trim().toLowerCase();
    if(!name||name.length>200||/\p{C}/u.test(name))throw Error(`Enter a valid name for contact ${i+1}.`);
    const parts=email.split('@'),local=parts[0],domain=parts[1];
    if(email.length>254||parts.length!==2||local.length>64||! /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)||local.startsWith('.')||local.endsWith('.')||local.includes('..')||!domain.includes('.')||!domain.split('.').every(p=>/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(p)))throw Error(`Enter a valid email for contact ${i+1}.`);
    if(seen.has(email))throw Error(`Email ${i+1} is already in the list.`);
    seen.add(email);return {name,email};
  });
}
export function validExternalTeam(value,scope,operation=null){
  if(!scope||!value||value.jobListId!==scope.jobListId||(scope.setupId===null?value.setupId!==null:typeof value.setupId!=='string'||value.setupId.toLowerCase()!==scope.setupId)||!Number.isSafeInteger(value.revision)||value.revision<0||!Number.isSafeInteger(value.currentRevision)||value.currentRevision<value.revision||typeof value.canEdit!=='boolean'||typeof value.replayed!=='boolean')return false;
  try{
    if(JSON.stringify(normalizeExternalContacts(value.contacts))!==JSON.stringify(value.contacts))return false;
  }catch{return false;}
  if(operation===null)return value.operationId===null&&!value.replayed&&value.revision===value.currentRevision;
  return value.operationId===operation.operationId&&value.canEdit&&value.revision===operation.expectedRevision+1&&JSON.stringify(value.contacts)===JSON.stringify(operation.contacts)&&(value.replayed||value.currentRevision===value.revision);
}
export function verifiedServiceDisplay(detail){
  const services=detail?.projectServices;
  const field=key=>detail?.fields?.find(f=>f.key===key)?.value;
  const validMode=v=>['PROVISIONED','ADOPTED_READ_ONLY'].includes(v?.bindingMode)&&typeof v?.verifiedAt==='string'&&v.verifiedAt.endsWith('Z')&&Number.isFinite(Date.parse(v.verifiedAt));
  const email=services?.email,folder=services?.folder;
  const emailOK=validMode(email)&&typeof email.address==='string'&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@riggscompanies\.com$/i.test(email.address);
  const folderOK=validMode(folder)&&typeof folder.path==='string'&&folder.path.startsWith('/')&&folder.path.slice(1).split('/').every(p=>p&&p!=='.'&&p!=='..')&&!/[\u0000-\u001f\u007f]/.test(folder.path);
  return {
    email:emailOK?{value:email.address,verified:true,href:`mailto:${encodeURIComponent(email.address).replace('%40','@')}`}:{value:typeof field('teamDistributionList')==='string'&&field('teamDistributionList').trim()?field('teamDistributionList'):null,verified:false,href:null},
    folder:folderOK?{value:folder.path,verified:true,href:'https://www.dropbox.com/home'+folder.path.split('/').map(encodeURIComponent).join('/')}:{value:typeof field('dropboxFolderName')==='string'&&field('dropboxFolderName').trim()?field('dropboxFolderName'):null,verified:false,href:null},
    available:services!=null
  };
}
