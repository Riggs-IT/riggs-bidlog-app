import {cloneElement,useEffect,useId,useRef,useState} from 'react';
import {saveTeamRosters,teamSummary} from './projectTeamSave.mjs';
import './ProjectFieldTeam.css';
import './ProjectTeamPopup.css';

// Both editors stay mounted. One footer action coordinates their existing
// revision-aware saves; there is deliberately no cross-roster transaction.
export default function ProjectTeamPopup({projectName, internalAvailable, canEdit, blocked=false,
  internalDirty=false, externalDirty=false, internalSaving=false, externalSaving=false, internal, external,onCombinedSavingChange}) {
  const dialog = useRef(null);
  const opener = useRef(null);
  const internalRef=useRef(null),externalRef=useRef(null),inFlight=useRef(false);
  const titleId = useId();
  const [tab,setTab] = useState(internalAvailable?'internal':'external');
  const [internalSummary,setInternalSummary]=useState(null),[externalSummary,setExternalSummary]=useState(null);
  const [coordinating,setCoordinating]=useState(false),[message,setMessage]=useState('');
  const saving = internalSaving || externalSaving || coordinating;
  const dirty = internalDirty || externalDirty;
  const summary=teamSummary(internalAvailable,internalSummary,externalSummary);
  useEffect(()=>{
    if(!dirty&&!saving)return;
    const warn=event=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[dirty,saving]);
  function open() {
    if(blocked||saving||dialog.current?.open)return;
    dialog.current?.showModal();
  }
  function closeDialog(){dialog.current?.close();opener.current?.focus();}
  function close() {
    if(saving||inFlight.current)return;
    closeDialog();
  }
  async function saveAndClose(){
    if(saving||inFlight.current)return;
    if(!dirty){close();return;}
    if(!canEdit||blocked)return;
    inFlight.current=true;setCoordinating(true);onCombinedSavingChange?.(true);setMessage('');
    try{
      const result=await saveTeamRosters([
        {key:'internal',dirty:internalDirty,handle:internalAvailable?internalRef.current:null},
        {key:'external',dirty:externalDirty,handle:externalRef.current},
      ]);
      if(result.ok){closeDialog();return;}
      setTab(result.failed);
      const saved=result.saved.map(key=>key==='internal'?'Internal team':'External team');
      setMessage(`${saved.length?saved.join(' and ')+' saved. ':''}${result.message}`);
    }finally{
      inFlight.current=false;setCoordinating(false);onCombinedSavingChange?.(false);
    }
  }
  return <>
    <div className="project-team-launcher">
      <div className="project-team-summary" aria-label="Saved additional team members">
        {summary.members.length>0&&<div className="project-setup-identity-selected project-team-summary-chips">
          {summary.members.map(member=><span key={`${member.lane}:${member.key}`} className="project-setup-identity-chip" title={member.lane==='internal'?'Internal member':'External contact'}>{member.name}</span>)}
        </div>}
        {summary.loading&&<small role="status">Loading team…</small>}
        {summary.unavailable&&<small role="status">Some team information is unavailable.</small>}
        {summary.review&&<small role="status">Team needs review.</small>}
        {!summary.members.length&&!summary.loading&&!summary.unavailable&&!summary.review&&<small>No additional team members</small>}
        {dirty&&<small role="status">Unsaved team changes</small>}
      </div>
      <button ref={opener} type="button" className="secondary-button" disabled={blocked||saving}
        aria-haspopup="dialog" onClick={open}>{canEdit?'Edit Team':'View Team'}</button>
    </div>
    <dialog ref={dialog} className="field-team-dialog project-team-dialog" aria-labelledby={titleId}
      onCancel={event=>{event.preventDefault();close();}}
      onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();if(!event.defaultPrevented){event.preventDefault();close();}}}}>
      <header className="field-team-dialog-header">
        <div><h2 id={titleId}>Additional Team</h2><small>{projectName}</small></div>
        <button type="button" className="secondary-button" disabled={saving} onClick={close}>Close</button>
      </header>
      <div className="project-team-tabs" role="group" aria-label="Team type">
        <button type="button" aria-pressed={tab==='internal'} disabled={saving} onClick={()=>setTab('internal')}>Internal{internalDirty?' •':''}</button>
        <button type="button" aria-pressed={tab==='external'} disabled={saving} onClick={()=>setTab('external')}>External{externalDirty?' •':''}</button>
      </div>
      <div className="field-team-dialog-body project-team-dialog-body">
        <div className="project-team-panel" hidden={tab!=='internal'}>
          {internalAvailable?cloneElement(internal,{ref:internalRef,coordinating,onSummaryChange:setInternalSummary}):<small className="project-team-unavailable">Internal additional members are restricted to authorized roster users.</small>}
        </div>
        <div className="project-team-panel" hidden={tab!=='external'}>{cloneElement(external,{ref:externalRef,coordinating,onSummaryChange:setExternalSummary})}</div>
        {message&&<div className="bid-edit-message error" role="alert">{message}</div>}
      </div>
      <footer className="field-team-dialog-footer">
        <small role="status">{dirty?'Unsaved team changes':''}</small>
        <button type="button" className={canEdit&&dirty?'bid-log-save-button':'secondary-button'} disabled={saving||(dirty&&(!canEdit||blocked))} onClick={()=>void saveAndClose()}>{saving?'Saving…':canEdit&&dirty?'Save Team':'Done'}</button>
      </footer>
    </dialog>
  </>;
}
