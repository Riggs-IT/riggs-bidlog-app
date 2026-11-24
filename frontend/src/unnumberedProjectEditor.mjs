import {validId} from './projectSetupAuthoring.mjs';
export const GROUPS = [
  ['basics','PROJECT','Project basics'],['location','LOCATION','Location & schedule'],
  ['contract','CONTRACT','Contract & Administration'],['parties','PARTIES','Owner / Developer & General Contractor'],
  ['design','DESIGN','Design Team'],['riggs','TEAM','Riggs Team'],['gc','TEAM','GC Team'],
  ['scope','SCOPE','Scope & Notes'],['buildings','BUILDINGS','Buildings'],
  ['suppliers','SUPPLIERS','Authorized Suppliers & Contracts'],['concrete','CONCRETE','Concrete & Mix Designs'],
  ['detailing','DETAILING','Detailing & Submittals'],['closeout','CLOSEOUT','Closeout'],
  ['accounting','ACCOUNTING','Accounting Details'],['services','INFORMATION','Project Information']
];
export const SUPPLIERS = [
  ['primaryConcrete','Primary concrete'],['secondaryConcrete','Secondary concrete'],
  ['primaryAggregate','Primary aggregate'],['secondaryAggregate','Secondary aggregate'],
  ['rebar','Rebar'],['sitework','Sitework'],['patching','Patching']
];
export const REFERENCE_FIELDS=new Set(['gcLookupId','architectLookupId','structuralEngineerLookupId','pmITUserId','apmITUserId','peITUserId','surveyorITUserId','superintendentEid']);
export const referenceValue=f=>f?.kind==='lookup'?f.selectionId??null:f?.value;
const validOptionId=(key,id)=>['gcLookupId','architectLookupId','structuralEngineerLookupId'].includes(key)?typeof id==='string'&&new RegExp(key==='gcLookupId'?'^140-[1-9][0-9]*$':'^206-[1-9][0-9]*$').test(id):Number.isSafeInteger(id)&&id>0&&id<=2147483647;
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
    !Array.isArray(body.fields)||body.fields.length!==95||(body.cognitoEntryId===1199&&body.writeEnabled&&body.baselineAccepted!==true))throw Error('Invalid unnumbered project identity');
  return validateFields(body);
}
export function validateNumberedJisDetail(body,jobListId){
  if(!record(body)||body.externalState!=='NUMBERED'||body.setupId!==null||body.jobListId!==Number(jobListId)||Number(jobListId)===24||body.jobNumber==='11111'||typeof body.jobNumber!=='string'||!body.jobNumber.trim()||body.revision!==1||!positive(body.entryVersion)||!positive(body.cognitoEntryId)||[966,1199].includes(body.cognitoEntryId)||typeof body.jobName!=='string'||typeof body.writeEnabled!=='boolean'||!Array.isArray(body.fields)||body.fields.length!==95)throw Error('Invalid numbered project identity');
  return validateFields(body);
}
function validateFields(body){
  const keys=new Set(),groups=new Set(GROUPS.map(g=>g[0]));
  for(const f of body.fields){
    if(!record(f)||typeof f.key!=='string'||!/^\w+$/.test(f.key)||['__proto__','constructor','prototype'].includes(f.key)||keys.has(f.key)||
      !groups.has(f.section)||typeof f.label!=='string'||!kinds.has(f.kind)||typeof f.lane!=='string'||typeof f.mappedEdit!=='boolean'||
      typeof f.editable!=='boolean'||(f.allowClear!==undefined&&typeof f.allowClear!=='boolean')||(f.editable&&(!body.writeEnabled||!f.mappedEdit||!['ordinary','later','core','gcRoster','reference'].includes(f.lane)))||
      !Array.isArray(f.choices)||!f.choices.every(v=>typeof v==='string')||!Object.hasOwn(f,'value'))throw Error('Invalid project field');
    if(f.kind==='lookup'){
      const opts=f.options??[];
      if(!REFERENCE_FIELDS.has(f.key)||!Array.isArray(opts)||opts.length>10000||
        opts.some(o=>!record(o)||!validOptionId(f.key,o.id)||typeof o.label!=='string'||!o.label.trim()||o.label.length>255)||
        new Set(opts.map(o=>String(o.id))).size!==opts.length||
        (f.selectionId!=null&&!opts.some(o=>o.id===f.selectionId))||
        (f.editable&&(!opts.length||f.lane!=='reference')))throw Error('Invalid project lookup');
    }
    keys.add(f.key);
  }
  if(SUPPLIERS.some(([key])=>['Supplier','Amount','Files'].some(s=>!keys.has(key+s))))throw Error('Incomplete supplier fields');
  return body;
}
export function buildJisChanges(detail,values){
  const changes={};
  if(Object.hasOwn(values,'numberOfBuildings'))throw Error('Building count is calculated from the list.');
  for(const field of detail.fields){
    if(!field.editable||!Object.hasOwn(values,field.key))continue;
    let value=values[field.key];
    const original=referenceValue(field);
    if(JSON.stringify(value)===JSON.stringify(original))continue;
    if(field.kind==='lookup'){
      if(!REFERENCE_FIELDS.has(field.key)||!(value===null&&field.allowClear===true)&&!(field.options||[]).some(o=>o.id===value))throw Error(`Select a valid ${field.label}.`);
      changes[field.key]=value;continue;
    }
    if(field.kind==='number'||field.kind==='integer'){
      if(value===''||value===null||!Number.isFinite(Number(value))||Number(value)<0||field.kind==='integer'&&!Number.isSafeInteger(Number(value)))throw Error(`Check ${field.label}.`);
      value=Number(value);
    }
    if(field.kind==='boolean'&&typeof value!=='boolean')throw Error(`Select Yes or No for ${field.label}.`);
    if(field.kind==='rows'){
      if(!Array.isArray(value)||value.length<1||value.length>100||value.some(r=>!r||typeof r.name!=='string'||!r.name.trim()||r.name.length>1000||!(r.id===null||typeof r.id==='string')))throw Error('Enter 1–100 building names.');
      changes[field.key]=value;continue;
    }
    if((value===null||typeof value==='string'&&!value.trim()&&(value!==''||field.allowClear!==true)||Array.isArray(value)&&!value.length&&field.allowClear!==true))throw Error(`Check ${field.label}.`);
    if(field.kind==='choice'&&!field.choices.includes(value)||field.kind==='multiChoice'&&(!Array.isArray(value)||value.some(v=>!field.choices.includes(v))))throw Error(`Select a valid ${field.label}.`);
    if(JSON.stringify(value)!==JSON.stringify(field.value))changes[field.key]=value;
  }
  return changes;
}
