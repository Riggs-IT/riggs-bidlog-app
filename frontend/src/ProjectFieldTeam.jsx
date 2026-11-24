import {useEffect,useRef,useState} from 'react';
import ProjectSetupIdentityPicker from './ProjectSetupIdentityPicker.jsx';
import {requestSetup} from './projectSetupAuthoring.mjs';
import {availabilityPath,validateAvailability,projectWindow,validWindow,commitmentRows,filterCommitments,plannerRange,clippedPlan,plannerTicks} from './fieldTeamAvailability.mjs';
import {supportsSetupStaffing,loadStaffing,saveStaffing,staffingCommand} from './setupStaffing.mjs';
import './ProjectFieldTeam.css';

const nameOf=role=>role==='SUPER'?'Superintendent':'Foreman';
const projectLabel=row=>[row.jobNumber,row.jobName].filter(Boolean).join(' · ')||`Project ${row.jobListId}`;
const dateLabel=value=>value||'Not set';

// Keep the single project list readable even when a superintendent owns many jobs.
function PlanBar({plan,range,overlap=false,proposal=false}){
  const bar=clippedPlan(plan.effectiveStartDate,plan.effectiveEndDate,range);
  const label=`${dateLabel(plan.effectiveStartDate)} → ${dateLabel(plan.effectiveEndDate)}`;
  if(bar.state!=='visible')return <span className="field-team-track-note" title={label}>{bar.state==='before'?'Before window':bar.state==='after'?'After window':'Dates incomplete'}</span>;
  return <div className="field-team-track" title={label} aria-label={label}><div className={`field-team-bar ${proposal?'proposal':plan.status==='COMPLETED'?'completed':overlap?'overlap':''}`} style={{left:`${bar.left}%`,width:`${bar.width}%`}}/></div>;
}

function Timeline({snapshot,start,end,jobListId,setupId}){
  const [filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[rangeMode,setRangeMode]=useState('proposal');
  const rows=commitmentRows(snapshot,start,end,jobListId,setupId);
  const current=rows.filter(r=>r.current.length).length,overlaps=rows.filter(r=>r.conflicts.length).length,undated=rows.filter(r=>r.needsDates).length;
  const filters=[['all','Projects',rows.length],['current','Current',current],['overlaps','Overlaps',overlaps],['undated','Needs dates',undated]];
  const shown=filterCommitments(rows,filter,query),range=plannerRange(snapshot.schedules,start,end,rangeMode),ticks=plannerTicks(range);
  return <section className="field-team-snapshot" aria-label="Employee commitments">
    <div className="field-team-stat-grid" role="group" aria-label="Filter commitments">
      {filters.map(([key,label,count])=><button key={key} type="button" aria-pressed={filter===key} className={`field-team-stat ${filter===key?'active':''}`} onClick={()=>setFilter(key)}><strong>{count}</strong><small>{label}</small></button>)}
    </div>
    <p className={`field-team-availability-note ${overlaps||undated?'attention':''}`} role="status">{!validWindow(start,end)?'Enter a valid date range to check overlaps.':overlaps?`${overlaps} project(s) overlap these dates.`:'No dated project overlaps in the proposed window.'}{undated>0&&` ${undated} project(s) need dates — availability is not confirmed.`}</p>
    <div className="field-team-table-toolbar">
      <h4>Project commitments <small>({shown.length} of {rows.length})</small></h4>
      <label className="field-team-search"><span className="field-team-sr-only">Filter by project name or number</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find project…"/></label>
      <div className="field-team-range" role="group" aria-label="Timeline range">
        <button type="button" aria-pressed={rangeMode==='proposal'} onClick={()=>setRangeMode('proposal')}>Proposed dates</button>
        <button type="button" aria-pressed={rangeMode==='all'} onClick={()=>setRangeMode('all')}>All dates</button>
      </div>
    </div>
    <div className="field-team-table-scroll" tabIndex={0} role="region" aria-label="Project commitments table">
      <table className="field-team-table">
        <colgroup><col className="project-col"/><col className="status-col"/><col className="dates-col"/><col className="timeline-col"/></colgroup>
        <thead><tr><th scope="col">Project</th><th scope="col">Status</th><th scope="col">Assignment dates</th><th scope="col"><div className="field-team-axis" aria-label={range?`${range.first} to ${range.last}`:'No dated plans'}>{ticks.length?ticks.map((tick,i)=><span key={i} style={{left:`${tick.position}%`}} className={i===0?'first':i===ticks.length-1?'last':''}>{tick.label}</span>):'Timeline'}</div></th></tr></thead>
        <tbody>
          {validWindow(start,end)&&<tr className="field-team-proposed"><th scope="row">This project</th><td>Proposed</td><td>{start}<small>to {end}</small></td><td><PlanBar plan={{effectiveStartDate:start,effectiveEndDate:end}} range={range} proposal/></td></tr>}
          {shown.map(row=>{
            const plans=row.openPlans.length?row.openPlans:row.current.length?[]:row.plans;
            const datePlan=plans[0];
            const roles=[...new Set(row.current.map(c=>c.resourceRole))].map(nameOf);
            return <tr key={row.projectKey} className={row.conflicts.length?'field-team-conflict-row':''}>
              <th scope="row"><strong>{projectLabel(row)}</strong>{row.isCurrentProject&&<small>This project</small>}</th>
              <td><div className="field-team-status-stack">{roles.length>0&&<span title={roles.join(', ')}>Current</span>}{row.openPlans.length>1&&<small>{row.openPlans.length} open plans</small>}{row.openPlans.length===1&&!row.current.length&&<span>{row.openPlans[0].status==='PLANNED'?'Planned':'Confirmed'}</span>}{!row.current.length&&!row.openPlans.length&&<small>Completed plan</small>}{row.conflicts.length>0&&<span className="field-team-attention">Overlap</span>}{row.needsDates&&<span className="field-team-attention">Needs dates</span>}</div></td>
              <td>{datePlan?<><span>{dateLabel(datePlan.effectiveStartDate)}</span><small>to {dateLabel(datePlan.effectiveEndDate)}</small></>:<small>No open plan</small>}
                {(row.plans.length>1||(row.plans.length>0&&!plans.length)||new Set(row.current.map(c=>c.resourceRole)).size>1)&&<details className="field-team-plan-details"><summary>Details{row.plans.length>1?` (${row.plans.length} plans)`:''}</summary>{row.plans.map(p=><div key={p.scheduleId}>{nameOf(p.resourceRole)} · {p.status.toLowerCase()}<small>{dateLabel(p.effectiveStartDate)} → {dateLabel(p.effectiveEndDate)}</small></div>)}{row.currentWithoutPlan.map(c=><small key={c.resourceRole}>{nameOf(c.resourceRole)}: no dated open plan</small>)}</details>}</td>
              <td><div className="field-team-bar-stack">{plans.length?plans.slice(0,3).map(p=><PlanBar key={p.scheduleId} plan={p} range={range} overlap={row.conflicts.some(c=>c.scheduleId===p.scheduleId)}/>):<span className="field-team-track-note">No dated plan</span>}{plans.length>3&&<small>+{plans.length-3} more · see details</small>}</div></td>
            </tr>;
          })}
          {!shown.length&&<tr><td colSpan={4} className="field-team-empty">{rows.length?'No projects match this filter.':'No current assignments or Organizer plans on visible active projects.'}</td></tr>}
        </tbody>
      </table>
    </div>
    <small className="field-team-muted">Dates come from Operations Organizer. Missing dates are not estimated; completed plans do not count as overlaps.</small>
  </section>;
}

function AvailabilityDialog({role,jobListId,setupId,projectName,anticipatedStart,duration,projectPlans,staffing,canSave,onSnapshot,close}){
  const first=staffing?(projectPlans[0]??null):null, initial=projectWindow(anticipatedStart,duration);
  const dialog=useRef(null),[eid,setEid]=useState(first?.employeeEid??null),[directory,setDirectory]=useState([]),[snapshot,setSnapshot]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(null),[retry,setRetry]=useState(0);
  const [planId,setPlanId]=useState(first?.scheduleId??null),[start,setStart]=useState(first?.effectiveStartDate??initial.start),[end,setEnd]=useState(first?.effectiveEndDate??initial.end);
  const [saving,setSaving]=useState(false),[pending,setPending]=useState(null),[review,setReview]=useState(false),[saveError,setSaveError]=useState(null),[notice,setNotice]=useState(null);
  const inFlight=useRef(false), editable=canSave&&staffing?.canEdit===true;
  const locked=saving||pending!==null||review;
  const plan=projectPlans.find(p=>p.scheduleId===planId)??null;
  useEffect(()=>{const node=dialog.current;node.showModal();return()=>{if(node.open)node.close();};},[]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError(null);setSnapshot(null);
    requestSetup(availabilityPath(role,eid),{signal:controller.signal}).then(body=>{
      if(controller.signal.aborted)return;
      const accepted=validateAvailability(body,role,eid);setDirectory(accepted.employees);setSnapshot(accepted);
    }).catch(()=>{if(!controller.signal.aborted)setError('Unable to load employee availability.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[role,eid,retry]);
  function selectPlan(p){
    setPlanId(p?.scheduleId??null);setEid(p?.employeeEid??null);setSnapshot(null);setRetry(x=>x+1);
    setStart(p?.effectiveStartDate??initial.start);setEnd(p?.effectiveEndDate??initial.end);
    setSaveError(null);setNotice(null);
  }
  function chooseEmployee(value){
    if(value===eid)return;
    if(editable&&role==='FOREMAN'){
      const existing=projectPlans.find(p=>p.employeeEid===value);
      if(existing){selectPlan(existing);return;}
    }
    setSnapshot(null);setEid(value);setNotice(null);
  }
  function tryClose(){
    if(inFlight.current)return;
    if(pending&&!window.confirm('A staffing save could not be confirmed. Close and reload the saved plans next time?'))return;
    close();
  }
  async function submit(body){
    if(!editable||inFlight.current)return;
    inFlight.current=true;setSaving(true);setPending(body);setSaveError(null);setNotice(null);
    try{
      const result=await saveStaffing(setupId,body);
      onSnapshot(result.snapshot);
      const saved=result.snapshot.plans.find(p=>p.scheduleId===result.receipt.scheduleId);
      selectPlan(saved??null);setPending(null);setReview(false);
      setNotice(result.snapshot.revision>result.receipt.revision?'Saved. Newer staffing changes have also been loaded.':'Staffing plan saved.');
    }catch(e){
      // A known validation/conflict rejection permits a fresh read. Ambiguous
      // transport/readback outcomes retain the identical command for explicit replay.
      const rejected=[401,403,404,409,422].includes(e?.status);
      if(rejected){setPending(null);setReview(true);}
      setSaveError(e?.status===409?'Staffing changed or this selection conflicts. Reload plans before editing.':rejected?'Staffing change was rejected. Reload and review the selection.':'Save outcome not confirmed. Retry the exact operation to reconcile; do not submit another change.');
    }finally{inFlight.current=false;setSaving(false);}
  }
  function save(remove=false){
    if(!editable||locked||inFlight.current)return;
    try{void submit(staffingCommand({snapshot:staffing,resourceRole:role,plan,employeeEid:eid,startDate:start,endDate:end,remove}));}
    catch{setSaveError('Select an eligible employee and valid dates, or reload the saved plans.');}
  }
  async function reloadPlans(){
    if(inFlight.current||pending)return;
    inFlight.current=true;setSaving(true);setSaveError(null);
    try{const fresh=await loadStaffing(setupId);onSnapshot(fresh);selectPlan(fresh.plans.find(p=>p.scheduleId===planId&&p.resourceRole===role)??fresh.plans.find(p=>p.resourceRole===role)??null);setReview(false);}
    catch{setReview(true);setSaveError('Unable to reload saved staffing plans.');}
    finally{inFlight.current=false;setSaving(false);}
  }
  const selectionReady=Boolean(eid!=null&&directory.some(p=>p.id===eid)&&snapshot?.employeeEid===eid&&!loading&&!error&&validWindow(start,end));
  const changed=!plan||plan.employeeEid!==eid||plan.effectiveStartDate!==start||plan.effectiveEndDate!==end;
  return <dialog ref={dialog} className="field-team-dialog" aria-modal="true" aria-label={`${nameOf(role)} availability`} onCancel={e=>{e.preventDefault();tryClose();}} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();if(!e.defaultPrevented){e.preventDefault();tryClose();}}}}>
    <header className="field-team-dialog-header"><div><span className="section-kicker">FIELD TEAM</span><h2>{nameOf(role)} availability</h2><small>{projectName}</small></div><button type="button" className="secondary-button" disabled={saving} onClick={tryClose} aria-label="Close field team planner">Close</button></header>
    <div className="field-team-dialog-body">
      <small className="field-team-preview-status">{editable?'Staffing plans · Saved in Operations': 'Availability preview · Changes here are not saved.'}</small>
      {projectPlans.length>0&&<div className="field-team-existing"><h4>Plans for this project</h4>{projectPlans.map(r=><div key={r.scheduleId}><strong>{r.employeeName||`EID ${r.employeeEid}`}</strong><small>{dateLabel(r.effectiveStartDate)} → {dateLabel(r.effectiveEndDate)} · {r.status}{r.eligible===false?' · No longer eligible':''}</small>{r.notes&&<small>{r.notes}</small>}{editable&&<button type="button" className="secondary-button" disabled={locked} aria-pressed={r.scheduleId===planId} onClick={()=>selectPlan(r)}>Edit plan</button>}</div>)}{editable&&role==='FOREMAN'&&<button type="button" className="secondary-button" disabled={locked} onClick={()=>selectPlan(null)}>Add another Foreman</button>}</div>}
      <ProjectSetupIdentityPicker label={`Select ${nameOf(role)}`} value={eid} options={directory} onChange={chooseEmployee} disabled={locked||!directory.length&&loading}/>
      <div className="field-team-date-grid"><label className="bid-edit-field"><span>Proposed start</span><input type="date" disabled={locked} value={start} onChange={e=>setStart(e.target.value)}/></label><label className="bid-edit-field"><span>Proposed end</span><input type="date" disabled={locked} value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
      {!validWindow(start,end)&&<small className="field-team-muted">Enter both dates with end on or after start to preview overlap.</small>}
      {loading&&<p role="status">Loading {eid==null?'field team':'employee availability'}…</p>}
      {error&&<div role="alert" className="bid-edit-message error">{error} <button type="button" className="secondary-button" disabled={saving} onClick={()=>setRetry(x=>x+1)}>Retry</button></div>}
      {!loading&&!error&&eid==null&&<p className="field-team-muted">{directory.length?'Select an employee to see current assignments and upcoming plans.':'No eligible employees returned.'}</p>}
      {snapshot?.employeeEid===eid&&eid!=null&&!loading&&!error&&<Timeline key={eid} snapshot={snapshot} start={start} end={end} jobListId={jobListId} setupId={setupId}/>}
      {saveError&&<div role="alert" className="bid-edit-message error">{saveError}</div>}{notice&&<p role="status">{notice}</p>}
    </div>
    <footer className="field-team-dialog-footer"><small>Operations · SQL staffing and Organizer plans</small><div className="field-team-save-actions">{editable&&<>{pending?<button type="button" className="bid-log-save-button" disabled={saving} onClick={()=>void submit(pending)}>Resolve Save</button>:review?<button type="button" className="secondary-button" disabled={saving} onClick={()=>void reloadPlans()}>Reload Plans</button>:<>{plan&&<button type="button" className="secondary-button" disabled={locked} onClick={()=>save(true)}>Remove Plan</button>}<button type="button" className="bid-log-save-button" disabled={locked||!selectionReady||!changed} onClick={()=>save()}>{saving?'Saving…':'Save Plan'}</button></>}</>}<button type="button" className="secondary-button" disabled={saving} onClick={tryClose}>Done</button></div></footer>
  </dialog>;
}

export default function ProjectFieldTeam({jobListId=null,setupId=null,projectName,anticipatedStart,duration,payload,loading=false,error=null,onRetry,canInspect=false,canSaveStaffing=false,blocked=false}){
  const [role,setRole]=useState(null),[staffing,setStaffing]=useState(null),[planLoading,setPlanLoading]=useState(false),[planError,setPlanError]=useState(null),[cycle,setCycle]=useState(0);
  const pendingProject=jobListId==null&&supportsSetupStaffing(setupId)&&canInspect;
  const activeStaffing=pendingProject&&staffing?.setupId===setupId?.toLowerCase()?staffing:null;
  const assignments=Array.isArray(payload?.activeAssignments)?payload.activeAssignments:[], schedules=pendingProject?(activeStaffing?.plans??[]):Array.isArray(payload?.schedules)?payload.schedules:[];
  useEffect(()=>setRole(null),[jobListId,setupId,projectName]);
  useEffect(()=>{
    if(!pendingProject){setStaffing(null);setPlanLoading(false);setPlanError(null);return;}
    const controller=new AbortController();setStaffing(null);setPlanLoading(true);setPlanError(null);
    loadStaffing(setupId,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setStaffing(value);})
      .catch(()=>{if(!controller.signal.aborted)setPlanError('Unable to load saved field team plans.');})
      .finally(()=>{if(!controller.signal.aborted)setPlanLoading(false);});
    return()=>controller.abort();
  },[pendingProject,setupId,cycle]);
  return <div className="field-team-summary">
    {jobListId!=null&&loading&&<small role="status">Loading current field team…</small>}
    {jobListId!=null&&error&&<div role="alert" className="bid-edit-message error">Unable to load project staffing. <button type="button" className="secondary-button" onClick={onRetry}>Retry</button></div>}
    {pendingProject&&planLoading&&<small role="status">Loading field team plans…</small>}
    {pendingProject&&planError&&<div role="alert" className="bid-edit-message error">{planError} <button type="button" className="secondary-button" onClick={()=>setCycle(x=>x+1)}>Retry</button></div>}
    {['SUPER','FOREMAN'].map(r=>{
      const current=assignments.filter(a=>a.resourceRole===r),plans=schedules.filter(p=>p.resourceRole===r&&p.status!=='CANCELLED');
      return <div key={r} className="field-team-summary-row"><div><small>{r==='SUPER'?'Superintendent':'Foremen'}</small><strong>{pendingProject?(planLoading?'Loading…':!activeStaffing?'Plans unavailable':plans.length?plans.map(p=>p.employeeName).join(', '):'Not assigned'):jobListId!=null&&(loading||error)?'Current assignment unavailable':current.length?current.map(a=>a.employeeName||`EID ${a.employeeEid}`).join(', '):'Not assigned'}</strong>{pendingProject&&plans.length>0&&<small>Planned · {plans.length} assignment(s)</small>}{jobListId!=null&&plans.length>0&&<small>{plans.length} Organizer plan(s)</small>}{!canInspect&&!loading&&!error&&plans.map(p=><div key={p.scheduleId} className="field-team-undated"><strong>{p.employeeName||`EID ${p.employeeEid}`}</strong> · {dateLabel(p.effectiveStartDate)} → {dateLabel(p.effectiveEndDate)} · {p.status}{p.notes&&<small>{p.notes}</small>}</div>)}</div>{canInspect&&<button type="button" className="secondary-button" disabled={blocked||pendingProject&&(!activeStaffing||planLoading)} onClick={()=>setRole(r)}>{r==='SUPER'?'Select Superintendent':'View Foremen'}</button>}</div>;
    })}
    {role&&canInspect&&<AvailabilityDialog key={role} role={role} jobListId={jobListId==null?null:Number(jobListId)} setupId={pendingProject?setupId:null} projectName={projectName} anticipatedStart={anticipatedStart} duration={duration} projectPlans={schedules.filter(p=>p.resourceRole===role&&p.status!=='CANCELLED')} staffing={activeStaffing} canSave={pendingProject&&canSaveStaffing&&!blocked} onSnapshot={setStaffing} close={()=>{setRole(null);if(pendingProject)setCycle(x=>x+1);}}/>}
  </div>;
}
