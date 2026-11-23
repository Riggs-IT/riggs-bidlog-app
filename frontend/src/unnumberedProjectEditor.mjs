import {validId} from './projectSetupAuthoring.mjs';
export const GROUPS = [
  ['basics','PROJECT','Project basics'],['location','LOCATION','Location & schedule'],
  ['contract','CONTRACT','Contract & Administration'],['parties','PARTIES','Owner / Developer & General Contractor'],
  ['design','DESIGN','Design Team'],['riggs','TEAM','Riggs Team'],['gc','TEAM','GC Team'],
  ['scope','SCOPE','Scope & Notes'],['buildings','BUILDINGS','Buildings'],
  ['suppliers','SUPPLIERS','Authorized Suppliers & Contracts'],['concrete','CONCRETE','Concrete & Mix Designs'],
  ['detailing','DETAILING','Detailing & Submittals'],['closeout','CLOSEOUT','Closeout'],
  ['accounting','ACCOUNTING','Accounting Details'],['services','PROJECT SERVICES','Project Services']
];
export const SUPPLIERS = [
  ['primaryConcrete','Primary concrete'],['secondaryConcrete','Secondary concrete'],
  ['primaryAggregate','Primary aggregate'],['secondaryAggregate','Secondary aggregate'],
  ['rebar','Rebar'],['sitework','Sitework'],['patching','Patching']
];
const kinds=new Set(['text','choice','number','date','textarea','integer','moneyText','percentText','boolean','email','lookup','roster','rows','files','multiChoice']);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function validateJisList(body){
  if(body?.externalState!=='CREATED_UNNUMBERED'||!Array.isArray(body.items)||body.items.length>100)throw Error('Invalid created project list');
  const seen=new Set();
  for(const item of body.items){
    if(!validId(item.setupId)||seen.has(item.setupId.toLowerCase())||!positive(item.originalBidLogId)||!positive(item.revision)||!positive(item.cognitoEntryId)||item.cognitoEntryId===966||typeof item.jobName!=='string')throw Error('Invalid created project row');
    seen.add(item.setupId.toLowerCase());
  }
  return body.items;
}
export function validateJisDetail(body,setupId){
  if(!record(body)||body.externalState!=='CREATED_UNNUMBERED'||!validId(body.setupId)||body.setupId.toLowerCase()!==setupId.toLowerCase()||
    !positive(body.originalBidLogId)||!positive(body.revision)||!positive(body.entryVersion)||!positive(body.cognitoEntryId)||body.cognitoEntryId===966||
    body.jobListId!==null||body.jobNumber!==null||typeof body.jobName!=='string'||typeof body.writeEnabled!=='boolean'||
    !Array.isArray(body.fields)||body.fields.length!==95||(body.cognitoEntryId===1199&&body.writeEnabled))throw Error('Invalid unnumbered project identity');
  const keys=new Set(),groups=new Set(GROUPS.map(g=>g[0]));
  for(const f of body.fields){
    if(!record(f)||typeof f.key!=='string'||!/^\w+$/.test(f.key)||['__proto__','constructor','prototype'].includes(f.key)||keys.has(f.key)||
      !groups.has(f.section)||typeof f.label!=='string'||!kinds.has(f.kind)||typeof f.lane!=='string'||typeof f.mappedEdit!=='boolean'||
      typeof f.editable!=='boolean'||(f.editable&&(!body.writeEnabled||!f.mappedEdit||!['ordinary','later'].includes(f.lane)))||
      !Array.isArray(f.choices)||!f.choices.every(v=>typeof v==='string')||!Object.hasOwn(f,'value'))throw Error('Invalid project field');
    keys.add(f.key);
  }
  if(SUPPLIERS.some(([key])=>['Supplier','Amount','Files'].some(s=>!keys.has(key+s))))throw Error('Incomplete supplier fields');
  return body;
}
export function buildJisChanges(detail,values){
  const changes={};
  for(const field of detail.fields){
    if(!field.editable||!Object.hasOwn(values,field.key))continue;
    let value=values[field.key];
    if(JSON.stringify(value)===JSON.stringify(field.value))continue;
    if(field.kind==='number'||field.kind==='integer'){
      if(value===''||value===null||!Number.isFinite(Number(value))||Number(value)<0||field.kind==='integer'&&!Number.isSafeInteger(Number(value)))throw Error(`Check ${field.label}.`);
      value=Number(value);
    }
    if(typeof value==='string'&&!value.trim()||value===null||Array.isArray(value)&&!value.length)throw Error(`Clearing ${field.label} is not yet supported.`);
    if(field.kind==='choice'&&!field.choices.includes(value)||field.kind==='multiChoice'&&(!Array.isArray(value)||value.some(v=>!field.choices.includes(v))))throw Error(`Select a valid ${field.label}.`);
    if(JSON.stringify(value)!==JSON.stringify(field.value))changes[field.key]=value;
  }
  return changes;
}
