import {isHiddenProject} from './projectVisibility.mjs';
const isId = v => Number.isSafeInteger(v) && v > 0 && v <= 2147483647;
const validRole = v => v === 'SUPER' || v === 'FOREMAN';
const isScheduleId = v => Number.isSafeInteger(v) && v > 0;
const setupIdentity = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(v);
export const projectKey = row => row?.jobListId != null ? `job:${row.jobListId}` : setupIdentity(row?.setupId) ? `setup:${row.setupId.toLowerCase()}` : null;
const targetKey = (jobListId,setupId) => projectKey({jobListId,setupId});
export const availabilityPath = (role,eid=null) => {
  if(!validRole(role)||eid!==null&&!isId(eid))throw Error('Invalid field team selection');
  return `/api/project-setups/jis/field-team/availability?role=${role}${eid===null?'':`&employeeEid=${eid}`}`;
};
export function dateOnly(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value))return '';
  const iso=value.slice(0,10),t=Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===iso?iso:'';
}
export function projectWindow(start,months){
  const a=dateOnly(start), n=Number(months);
  if(!a||months==null||months===''||!Number.isInteger(n)||n<=0||n>1200)return {start:a,end:''};
  const d=new Date(`${a}T00:00:00Z`), day=d.getUTCDate();
  d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);
  const last=new Date(d.getTime());last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);
  d.setUTCDate(Math.min(day,last.getUTCDate()));
  return {start:a,end:dateOnly(d.toISOString())};
}
export function validateAvailability(body,role,eid){
  if(!body||body.role!==role||body.employeeEid!==eid||body.readOnly!==true||!validRole(role)||
    !Array.isArray(body.employees)||!Array.isArray(body.currentAssignments)||!Array.isArray(body.schedules)||
    body.employees.length>10000||body.currentAssignments.length>1000||body.schedules.length>5000||
    body.employees.some(x=>!x||!isId(x.id)||typeof x.label!=='string'||!x.label.trim())||
    new Set(body.employees.map(x=>x.id)).size!==body.employees.length||
    (eid===null&&(body.currentAssignments.length||body.schedules.length))||
    (eid!==null&&!body.employees.some(x=>x.id===eid)))throw Error('Invalid field team response');
  const validCommitment=x=>x&&!isHiddenProject(x)&&typeof x.jobNumber==='string'&&typeof x.jobName==='string'&&validRole(x.resourceRole);
  const numbered=x=>validCommitment(x)&&isId(x.jobListId)&&x.setupId==null;
  const pending=x=>validCommitment(x)&&x.jobListId===null&&setupIdentity(x.setupId)&&x.jobNumber===''&&x.jobName.trim()&&x.status==='PLANNED'&&validWindow(x.effectiveStartDate,x.effectiveEndDate);
  if(body.currentAssignments.some(x=>!numbered(x))||body.schedules.some(x=>!(numbered(x)||pending(x))||!isScheduleId(x.scheduleId)||
    !['PLANNED','CONFIRMED','COMPLETED'].includes(x.status)||
    ![x.effectiveStartDate,x.effectiveEndDate].every(v=>v===null||dateOnly(v)===v))||
    new Set(body.schedules.map(x=>x.scheduleId)).size!==body.schedules.length)throw Error('Invalid field team commitments');
  return body;
}
export const validWindow=(a,b)=>Boolean(dateOnly(a)&&dateOnly(b)&&a<=b);
export function availabilitySummary(snapshot,start,end,jobListId=null,setupId=null){
  const plans=snapshot?.schedules||[], open=plans.filter(p=>p.status!=='COMPLETED');
  const conflicts=validWindow(start,end)?open.filter(p=>projectKey(p)!==targetKey(jobListId,setupId)&&validWindow(p.effectiveStartDate,p.effectiveEndDate)&&p.effectiveStartDate<=end&&p.effectiveEndDate>=start):[];
  return {conflicts,unresolved:open.filter(p=>!validWindow(p.effectiveStartDate,p.effectiveEndDate)),
    currentWithoutPlan:(snapshot?.currentAssignments||[]).filter(c=>!open.some(p=>projectKey(p)===projectKey(c)&&p.resourceRole===c.resourceRole&&validWindow(p.effectiveStartDate,p.effectiveEndDate)))};
}
export function timelineGeometry(plans,start,end){
  const rows=plans.filter(p=>validWindow(p.effectiveStartDate,p.effectiveEndDate)).map(p=>({...p,start:p.effectiveStartDate,end:p.effectiveEndDate}));
  if(validWindow(start,end))rows.push({scheduleId:'preview',jobName:'Proposed assignment',status:'PREVIEW',start,end});
  if(!rows.length)return null;
  const first=rows.map(r=>r.start).sort()[0],last=rows.map(r=>r.end).sort().at(-1);
  const timestamp=v=>Date.parse(`${v}T00:00:00Z`),day=86400000;
  const span=timestamp(last)-timestamp(first)+day;
  return {first,last,rows:rows.map(r=>({...r,left:100*(timestamp(r.start)-timestamp(first))/span,
    width:100*(timestamp(r.end)-timestamp(r.start)+day)/span}))};
}

// The selected employee's snapshot is a project list, not two independent lists.
// Current assignments and Organizer plans have different meanings; keep each
// source row, group only for presentation, and never infer a missing end date.
export function commitmentRows(snapshot,start,end,jobListId=null,setupId=null){
  const summary=availabilitySummary(snapshot,start,end,jobListId,setupId);
  const projects=new Map();
  function project(row){
    const key=projectKey(row);
    if(!projects.has(key))projects.set(key,{
      projectKey:key,jobListId:row.jobListId,setupId:row.setupId??null,jobNumber:row.jobNumber,jobName:row.jobName,
      current:[],plans:[],conflicts:[],unresolved:[],currentWithoutPlan:[]
    });
    return projects.get(key);
  }
  for(const row of snapshot.currentAssignments)project(row).current.push(row);
  for(const row of snapshot.schedules)project(row).plans.push(row);
  for(const row of summary.conflicts)project(row).conflicts.push(row);
  for(const row of summary.unresolved)project(row).unresolved.push(row);
  for(const row of summary.currentWithoutPlan)project(row).currentWithoutPlan.push(row);
  const rows=[...projects.values()].map(row=>({...row,
    openPlans:row.plans.filter(p=>p.status!=='COMPLETED'),
    needsDates:row.unresolved.length>0||row.currentWithoutPlan.length>0,
    isCurrentProject:row.projectKey===targetKey(jobListId,setupId),
  }));
  const priority=r=>r.conflicts.length?0:r.needsDates?1:r.current.length?2:r.openPlans.length?3:4;
  return rows.sort((a,b)=>priority(a)-priority(b)||a.jobNumber.localeCompare(b.jobNumber,undefined,{numeric:true})||a.projectKey.localeCompare(b.projectKey,undefined,{numeric:true}));
}
export function filterCommitments(rows,filter='all',query=''){
  const q=query.trim().toLocaleLowerCase();
  return rows.filter(row=>(filter==='all'||filter==='current'&&row.current.length>0||
    filter==='overlaps'&&row.conflicts.length>0||filter==='undated'&&row.needsDates)&&
    (!q||`${row.jobNumber} ${row.jobName}`.toLocaleLowerCase().includes(q)));
}
export function plannerRange(plans,start,end,mode='proposal'){
  if(mode==='proposal'&&validWindow(start,end))return {first:start,last:end};
  const geometry=timelineGeometry(plans,start,end);
  return geometry?{first:geometry.first,last:geometry.last}:null;
}
export function clippedPlan(start,end,range){
  if(!validWindow(start,end)||!range||!validWindow(range.first,range.last))return {state:'undated'};
  if(end<range.first)return {state:'before'};
  if(start>range.last)return {state:'after'};
  const timestamp=v=>Date.parse(`${v}T00:00:00Z`),day=86400000;
  const first=start<range.first?range.first:start,last=end>range.last?range.last:end;
  const span=timestamp(range.last)-timestamp(range.first)+day;
  return {state:'visible',left:100*(timestamp(first)-timestamp(range.first))/span,
    width:100*(timestamp(last)-timestamp(first)+day)/span};
}
export function plannerTicks(range){
  if(!range||!validWindow(range.first,range.last))return [];
  const day=86400000,first=Date.parse(`${range.first}T00:00:00Z`),last=Date.parse(`${range.last}T00:00:00Z`);
  const days=(last-first)/day,count=Math.min(4,days);
  return Array.from({length:count+1},(_,i)=>{
    const date=new Date(first+Math.round(count?days*i/count:0)*day);
    return {position:count?100*i/count:0,label:date.toLocaleDateString('en-US',{month:'short',day:'numeric',...(range.first.slice(0,4)!==range.last.slice(0,4)?{year:'2-digit'}:{}),timeZone:'UTC'})};
  });
}
