import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import useGcReference from './useGcReference.js';
import FloatingEditorShell from './FloatingEditorShell.jsx';
import ProjectSetupIdentityPicker from './ProjectSetupIdentityPicker.jsx';
import DesignTeamContactDetails from './DesignTeamContactDetails.jsx';
import ProjectSetupGcCompany from './ProjectSetupGcCompany.jsx';
import {gcContactContextHasData} from './projectSetupGcCompany.mjs';
import {GcProjectTeam,RiggsProjectTeam} from './ProjectSetupTeamSections.jsx';
import {setupReadiness} from './projectSetupReadiness.mjs';
import {applyDraftChanges,buildDraftChanges,currentAwardReference,mayAuthor,openSetup,readPath,requestSetup,
  setPath,setupError,validateDraft,validateEditReceipt,validateIdentityDirectory,createSetupOperationId,validateForm206Directory} from './projectSetupAuthoring.mjs';

const PROJECT_TYPES = ['Tilt','CIP','PRE','SITE','Other'];
const PURPOSES = ['RET','OFF','PAR','IND','EDU','MED','RES','MIX','DAT','STG','SIDE'];

export default function ProjectSetupEditor({intent,user,onLeave,onSaved}) {
  const [record,setRecord] = useState(null);
  const [form,setForm] = useState(null);
  const [touched,setTouched] = useState(new Set());
  const [choices,setChoices] = useState(null);
  const [busy,setBusy] = useState(() => Boolean(intent && mayAuthor(user)));
  const [error,setError] = useState(null);
  const [notice,setNotice] = useState(null);
  const [reference,setReference] = useState(null);
  const [referenceBusy,setReferenceBusy] = useState(false);
  const [referenceError,setReferenceError] = useState(null);
  const [directory,setDirectory] = useState(null);
  const [directoryError,setDirectoryError] = useState(null);
  const [directoryBusy,setDirectoryBusy] = useState(false);
  const [directoryRetry,setDirectoryRetry] = useState(0);
  const [form206Directory,setForm206Directory] = useState(null);
  const [form206Busy,setForm206Busy] = useState(false);
  const [form206Error,setForm206Error] = useState(false);
  const [uncertain,setUncertain] = useState(false);
  const [checklistOpen,setChecklistOpen] = useState(false);
  const haloTimer = useRef(null);
  const haloNode = useRef(null);
  const checklistRef = useRef(null);
  const [conflict,setConflict] = useState(false);
  const controller = useRef(null);
  const sequence = useRef(0);
  const saving = useRef(false);
  const pending = useRef(null);
  const openOperation = useRef(null);
  const dirty = touched.size > 0;
  const author = mayAuthor(user);
  const maySeeDraftDetails = ['ADMIN','MANAGEMENT_ADMIN'].includes(String(user?.appRole || '').trim().toUpperCase());
  const readiness=setupReadiness(form||{},directory);
  const {items:form140Options,loading:form140Loading,error:form140Error}=useGcReference(author);
  const selectedForm140=useMemo(()=>{
    if (!form?.gcLookupId || !Array.isArray(form140Options)) return null;
    const matches=form140Options.filter(row=>row.cognitoLookupId===form.gcLookupId);
    return matches.length===1?matches[0]:null;
  },[form?.gcLookupId,form140Options]);
  useEffect(()=>()=>{if(haloTimer.current) window.clearTimeout(haloTimer.current);},[]);
  useEffect(()=>{
    if(!checklistOpen) return;
    const onOutside=event=>{if(!checklistRef.current?.contains(event.target)) setChecklistOpen(false);};
    document.addEventListener('pointerdown',onOutside);
    return ()=>document.removeEventListener('pointerdown',onOutside);
  },[checklistOpen]);

  const load = useCallback(async (selection = intent) => {
    if (!mayAuthor(user)) return;
    controller.current?.abort();
    const abort = new AbortController();controller.current=abort;
    const seq = ++sequence.current;
    setBusy(true);setError(null);setChoices(null);setReference(null);setReferenceError(null);
    try {
      openOperation.current ||= createSetupOperationId();
      const result = await openSetup(selection,{operationId:openOperation.current,signal:abort.signal});
      if (seq !== sequence.current || abort.signal.aborted) return;
      if (result.context) {setChoices(result.context);setRecord(null);return;}
      setReference(result.reference || null);
      setRecord(result.setup);setForm(structuredClone(result.setup.values));
      setTouched(new Set());setConflict(false);setUncertain(false);pending.current=null;
      setNotice(null);
      onSaved?.(result.setup.setupId);
    } catch (cause) {
      if (seq !== sequence.current || abort.signal.aborted) return;
      setError(setupError(cause));
    } finally {
      if (seq === sequence.current) setBusy(false);
    }
  }, [intent?.setupId,intent?.originalBidLogId,user?.eid,author]);

  useEffect(() => {
    void load();
    return () => {sequence.current+=1;controller.current?.abort();};
  },[load]);
  useEffect(() => {
    if (!record?.setupId || !author) {setDirectory(null);return;}
    const abort=new AbortController();
    setDirectoryBusy(true);setDirectoryError(null);
    requestSetup('/api/project-setups/authoring/identities',{signal:abort.signal})
      .then(data=>{if (!abort.signal.aborted) setDirectory(validateIdentityDirectory(data));})
      .catch(()=>{if (!abort.signal.aborted) {setDirectory(null);setDirectoryError('Verified lookup directory unavailable. Existing draft fields are preserved.');}})
      .finally(()=>{if (!abort.signal.aborted) setDirectoryBusy(false);});
    return ()=>abort.abort();
  },[record?.setupId,author,directoryRetry]);

  useEffect(() => {
    if (!record?.setupId || !author) {setForm206Directory(null);return;}
    const abort=new AbortController();
    setForm206Busy(true);setForm206Error(false);setForm206Directory(null);
    requestSetup('/api/project-setups/authoring/form206',{signal:abort.signal})
      .then(data=>{if (!abort.signal.aborted) setForm206Directory(validateForm206Directory(data));})
      .catch(()=>{if (!abort.signal.aborted) {setForm206Directory(null);setForm206Error(true);}})
      .finally(()=>{if (!abort.signal.aborted) setForm206Busy(false);});
    return ()=>abort.abort();
  },[record?.setupId,author,directoryRetry]);

  useEffect(() => {
    if (!dirty && !uncertain && !busy) return;
    const warn = event => {event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return () => window.removeEventListener('beforeunload',warn);
  },[dirty,uncertain,busy]);

  function goToSection(sectionId) {
    const target=document.getElementById(sectionId);
    setChecklistOpen(false);
    if(!target) return;
    haloNode.current?.classList.remove('setup-section-halo');
    if(haloTimer.current) window.clearTimeout(haloTimer.current);
    target.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
    target.classList.add('setup-section-halo');haloNode.current=target;
    haloTimer.current=window.setTimeout(()=>{target.classList.remove('setup-section-halo');haloNode.current=null;},1500);
  }
  function change(path,value) {
    if (path==='gcLookupId' && form?.gcLookupId!==value && gcContactContextHasData(form?.gcContactInfo)) {
      setError('This draft already has company-specific GC contacts. Changing the verified contractor requires a separate contact-history review; no changes were saved.');
      return;
    }
    setError(null);
    setForm(current=>setPath(current,path,value));
    setTouched(previous=>new Set([...previous,path]));
    setNotice(null);
  }
  function leave() {
    if (busy) return;
    if ((dirty || uncertain) && !window.confirm('Leave with unsaved or unverified changes? Your last saved draft will remain available.')) return;
    onLeave();
  }
  function reload() {
    if (busy || !record) return;
    if ((dirty || uncertain) && !window.confirm('Replace these entries with the latest saved draft? This does not undo any confirmed save.')) return;
    void load({setupId:record.setupId});
  }
  async function save(leaveAfter=false) {
    if (saving.current || busy || !record || !author || conflict) return;
    saving.current=true;setBusy(true);setError(null);
    let sent=false;
    try {
      if (!pending.current) {
        const changes=buildDraftChanges(record.values,form,touched);
        if (!Object.keys(changes).length) {
          setTouched(new Set());
          if (leaveAfter) onLeave();
          else setNotice('No changes to save.');
          return;
        }
        pending.current={operationId:createSetupOperationId(),expectedRevision:record.revision,changes};
      }
      const body=pending.current;
      sent=true;
      const response=await requestSetup(`/api/project-setups/authoring/drafts/${record.setupId}/edits`,{method:'PATCH',body});
      const receipt=validateEditReceipt(response,record.setupId,body);
      // The verified immutable receipt is success even if the next GET fails.
      const accepted={...record,values:applyDraftChanges(record.values,body.changes),revision:receipt.revision};
      pending.current=null;setUncertain(false);setConflict(false);setTouched(new Set());
      setRecord(accepted);setForm(structuredClone(accepted.values));
      setNotice('Draft saved.');
      onSaved?.(accepted.setupId);
      if (leaveAfter) {onLeave();return;}
      try {
        const current=validateDraft(await requestSetup(`/api/project-setups/drafts/${accepted.setupId}`));
        if (current.setupId !== accepted.setupId) throw new Error();
        setRecord(current);setForm(structuredClone(current.values));
      } catch {
        setNotice('Draft saved, but the latest copy could not be reloaded. Reload before making another change.');
        setConflict(true);
      }
    } catch (cause) {
      if (!sent) {setError(cause.message || 'Check the entered values.');pending.current=null;return;}
      const unknown = !cause.status || cause.status >= 500;
      setUncertain(unknown);
      if (!unknown) pending.current=null;
      if (cause.status === 409) setConflict(true);
      setError(setupError(cause));
      // No redirect and no automatic retry after any failed/uncertain save.
    } finally {saving.current=false;setBusy(false);}
  }
  async function loadReference() {
    if (!record || referenceBusy || busy) return;
    const signal=controller.current?.signal;
    setReferenceBusy(true);setReferenceError(null);
    try {
      const value=await currentAwardReference(record.originalBidLogId,{signal});
      if (!signal?.aborted) setReference(value);
    } catch {
      if (!signal?.aborted) setReferenceError('The current awarded-bid reference is unavailable. Your saved draft and original notes are unchanged.');
    } finally {setReferenceBusy(false);}
  }
  function input(path,label,type='text',options={}) {
    const value=readPath(form,path);
    const inputMode=options.inputMode || (options.decimal ? 'decimal' : undefined);
    return <label key={path} className={`bid-edit-field ${options.className || ''}`.trim()}><span>{label}</span>
      <input type={type} value={value ?? ''} maxLength={options.maxLength || 1000}
        inputMode={inputMode}
        step={type==='number' ? '1' : undefined} min={type==='number' ? (path==='numberOfBuildings'?0:1) : undefined}
        placeholder={options.placeholder}
        onChange={event=>change(path,event.target.value)}/>
      {options.help && <small>{options.help}</small>}
    </label>;
  }
  function select(path,label,values,options={}) {
    const value=readPath(form,path) ?? '';
    return <label key={path} className={`bid-edit-field ${options.className || ''}`.trim()}><span>{label}</span>
      <select value={value} onChange={event=>change(path,event.target.value)}>
        <option value="">—</option>
        {values.map(option=><option key={option} value={option}>{option}</option>)}
      </select>
      {options.help && <small>{options.help}</small>}
    </label>;
  }
  function yesNo(path,label) {
    const value=readPath(form,path);
    return <label className="bid-edit-field" key={path}><span>{label}</span>
      <select value={value === null ? '' : String(value ?? '')} onChange={event=>change(path,event.target.value)}>
        <option value="">Not supplied</option><option value="true">Yes</option><option value="false">No</option>
      </select>
    </label>;
  }
  function textarea(path,label,options={}) {
    return <label className={`bid-edit-field wide ${options.className || ''}`.trim()}><span>{label}</span>
      <textarea rows={options.rows || 4} maxLength={20000} value={readPath(form,path) ?? ''}
        placeholder={options.placeholder}
        onChange={event=>change(path,event.target.value)}/>
      {options.help && <small>{options.help}</small>}
    </label>;
  }
  function sectionHeading(kicker,title,description) {
    return <div className="project-setup-section-heading">
      <div><span className="section-kicker">{kicker}</span><h3>{title}</h3></div>
      {description && <p>{description}</p>}
    </div>;
  }
  function awardedGcReference() {
    return <div className="project-setup-reference-card">
      <div>
        <span className="section-kicker">AWARDED GC</span>
        <strong>{reference?.gcSourceLabel || 'Reference not loaded'}</strong>
      </div>
      <button type="button" className="secondary-button" disabled={referenceBusy||busy} onClick={()=>void loadReference()}>
        {referenceBusy?'Loading…':reference?'Refresh reference':'Load reference'}
      </button>
    </div>;
  }

  return <FloatingEditorShell eyebrow="PROJECT SETUP" title={record?.values.jobName || 'Project setup'}
    subtitle={record ? 'Project setup in progress' : 'Opening project setup'}
    backLabel="Drafts" onClose={leave} saving={busy}
    className="bid-log-edit-drawer project-setup-editor" bodyClassName="bid-log-edit-body project-setup-body" scrollSurface
    headerActions={record && <div ref={checklistRef} className="project-setup-checklist-anchor"
      onKeyDownCapture={event=>{if(event.key==='Escape' && checklistOpen){event.stopPropagation();setChecklistOpen(false);}}}>
      <button type="button" className="project-setup-status-badge project-setup-checklist-toggle"
        aria-expanded={checklistOpen} aria-controls="project-setup-checklist-popover"
        onClick={()=>setChecklistOpen(v=>!v)}>Draft · {readiness.filled}/{readiness.total}</button>
      {checklistOpen && <div id="project-setup-checklist-popover" role="group" aria-label="Setup checklist"
        className="project-setup-checklist-popover">
        <div className="project-setup-checklist-title"><strong>Setup checklist</strong><small>Review only · save incomplete drafts</small></div>
        {readiness.items.map(item=><button type="button" className="project-setup-check-item" key={item.field}
          onClick={()=>goToSection(item.sectionId)}>
          <span className={item.filled&&!item.unverified?'is-done':'is-pending'} aria-hidden="true">{item.filled&&!item.unverified?'✓':'○'}</span>
          <span>{item.label}</span><small>{item.unverified?'Verify':item.filled?'Done':'To do'}</small>
        </button>)}
        <small className="project-setup-checklist-disclaimer">This is not Form 19 creation approval.</small>
      </div>}
    </div>}
    footer={<footer className="bid-log-edit-footer floating-editor-footer">
      <div className="floating-editor-footer-status">
        <small>{dirty?'Unsaved changes':record?'All changes saved':busy?'Opening draft…':'Draft not loaded'}</small>
      </div>
      <div className="bid-log-edit-footer-actions">
        {record && author && <>
          <button type="button" className="secondary-button" onClick={()=>void save(false)} disabled={busy||conflict}>
            {uncertain?'Retry exact save':'Save draft'}</button>
          <button type="button" className="bid-log-save-button project-setup-save-close" onClick={()=>void save(true)} disabled={busy||conflict}>
            {busy?'Saving…':'Save & Close'}</button>
        </>}
      </div></footer>}>
    {!author && <p role="alert" className="bid-edit-message error">You do not have permission to edit project setup drafts.</p>}
    {busy && !record && <p role="status" className="bid-edit-message">Opening project setup…</p>}
    {error && <div role="alert" className="bid-edit-message error"><span>{error}</span>
      {!record && <button className="secondary-button" disabled={busy} onClick={()=>void load()}>Retry setup only</button>}
      {record && <button className="secondary-button" disabled={busy} onClick={reload}>Reload saved draft</button>}
    </div>}
    {!busy && !record && !choices && !error && author && (
      <p role="status" className="bid-edit-message">No draft loaded. Return to Drafts to select a project.</p>
    )}
    {notice && <p role="status" className="bid-edit-message project-setup-notice">{notice}</p>}
    {choices && <section className="bid-edit-section project-setup-choice-card">
      {sectionHeading('PROJECT RELATIONSHIP',choices.mode==='CHOOSE_CHILD'?'Choose the project setup to continue':'Review the existing project relationship',
        choices.mode==='EXISTING_JOB_REVIEW'?'This award is already linked to a project. Another project setup will not be started automatically.':'This award has more than one saved child setup. Choose the one you intend to continue.')}
      <div className="project-setup-choice-actions">
        {choices.choices.map(c=><button key={c.setupId} type="button" className="secondary-button" disabled={busy}
          onClick={()=>void load({setupId:c.setupId})}>{c.jobName || 'Unnamed project'}</button>)}
      </div>
    </section>}
    {record && form && <>
      <fieldset className="cognito-general-fields project-setup-fields" disabled={busy||uncertain||conflict||!author}>
        <div className="project-setup-layout-pair">
          <section className="bid-edit-section project-setup-section" id="setup-section-basics">
            {sectionHeading('PROJECT','Project basics')}
            <div className="bid-edit-grid project-setup-basic-grid">
              {input('jobName','Project name','text',{className:'project-setup-span-full'})}
              {select('jobType','Project type',PROJECT_TYPES)}
              {select('purpose','Purpose',PURPOSES)}
              {input('numberOfBuildings','Building count','number')}
              <div className="bid-edit-field project-setup-contract-type-preview"><span>Contract type</span><strong>LOI</strong><small>Cognito default. Draft storage mapping pending; no selection is saved yet.</small></div>
            </div>

          </section>
          <section className="bid-edit-section project-setup-section" id="setup-section-location">
            {sectionHeading('LOCATION','Location & schedule')}
            <div className="bid-edit-grid project-setup-location-grid">
              {input('streetAddress','Street address','text',{className:'project-setup-span-full'})}
              {input('city','City')}{input('state','State')}{input('postalCode','ZIP / postal code')}
              {input('anticipatedStartDate','Anticipated start','date')}
              {input('estimatedDurationMonths','Duration (months)','number')}
            </div>
          </section>
        </div>

        <section className="bid-edit-section project-setup-section project-setup-contract-section" id="setup-section-contract">
          {sectionHeading('CONTRACT','Contract & Administration')}
          <div className="bid-edit-grid project-setup-contract-grid">
            {input('contractAmount','Starting contract amount','text',{decimal:true})}
            {input('retentionPercent','Retention (%)','text',{decimal:true})}
            {input('bond','Bond')}{input('parcel','Parcel')}
          </div>
          <small className="setup-team-empty">Starting values only. Accounting confirmation is a later approval step.</small>
        </section>

        <section className="bid-edit-section project-setup-section project-setup-parties-section" id="setup-section-parties">
          {sectionHeading('PARTIES','Owner / Developer & General Contractor')}
          <div className="project-setup-parties-grid">
            <div className="project-setup-party-block">
              <h4>Owner / Developer</h4>
              <div className="bid-edit-grid project-setup-party-fields">
                {input('projectOwnerInfo.name','Owner / developer name','text',{className:'project-setup-span-full'})}
                {input('projectOwnerInfo.streetAddress','Street address','text',{className:'project-setup-span-full'})}
                {input('projectOwnerInfo.cityStateZip','City / state / ZIP')}
                {input('projectOwnerInfo.email','Email','email')}
              </div>
              <small className="setup-team-empty">These four Owner fields save to this project's SQL draft; they do not change a master contact.</small>
            </div>
            <div className="project-setup-party-block">
              <h4>General Contractor</h4>
              {awardedGcReference()}
              {directoryBusy && <p role="status" className="cognito-general-note">Loading verified references…</p>}
              {directoryError && <div role="alert" className="cognito-general-note">{directoryError}
                <button type="button" className="secondary-button" disabled={directoryBusy} onClick={()=>setDirectoryRetry(v=>v+1)}>Retry</button></div>}
              <div className="bid-edit-grid project-setup-party-fields">
                <div className="project-setup-span-full"><ProjectSetupIdentityPicker label="Verified General Contractor" value={form.gcLookupId}
                  options={directory?.gcs||[]} disabled={!directory||directoryBusy}
                  onChange={value=>change('gcLookupId',value)}/></div>
                <ProjectSetupGcCompany contactInfo={form.gcContactInfo} source={selectedForm140}
                  sourcePending={form140Loading} sourceUnavailable={Boolean(form140Error)}
                  onChange={(key,value)=>change(`gcContactInfo.${key}`,value)}/>
                {form140Error && <small role="status" className="project-setup-span-full">GC directory unavailable; company details not inferred.</small>}
              </div>
              {referenceError && <p role="alert" className="cognito-general-note">{referenceError}</p>}
            </div>
          </div>
        </section>

        <section className="bid-edit-section project-setup-section project-setup-design-section" id="setup-section-design">
          {sectionHeading('DESIGN','Design Team')}
          <div className="project-setup-design-grid">
            <div className="design-team-person-card">
              <ProjectSetupIdentityPicker label="Architect of record" value={form.architectLookupId}
                options={form206Directory?.architects||[]} unavailable={!form206Directory}
                disabled={busy||form206Busy} onChange={value=>change('architectLookupId',value)}
                help={form206Error?'Directory unavailable; existing draft selection unchanged.':''}/>
              <DesignTeamContactDetails
                contact={form206Directory?.architects?.find(row=>row.id===form.architectLookupId)||null}
                pending={form206Busy}
                source="Form 206 SQL mirror · shown for reference" />
            </div>
            <div className="design-team-person-card">
              <ProjectSetupIdentityPicker label="Structural engineer of record" value={form.structuralEngineerLookupId}
                options={form206Directory?.engineers||[]} unavailable={!form206Directory}
                disabled={busy||form206Busy} onChange={value=>change('structuralEngineerLookupId',value)}
                help={form206Error?'Directory unavailable; existing draft selection unchanged.':''}/>
              <DesignTeamContactDetails
                contact={form206Directory?.engineers?.find(row=>row.id===form.structuralEngineerLookupId)||null}
                pending={form206Busy}
                source="Form 206 SQL mirror · shown for reference" />
            </div>
          </div>
          {form206Error && <div className="design-team-directory-warning" role="status">
            <span>Form 206 contacts could not be loaded. Saved design identities are unchanged.</span>
            <button type="button" className="secondary-button" disabled={form206Busy}
              onClick={()=>setDirectoryRetry(value=>value+1)}>Retry contacts</button>
          </div>}
          <small className="setup-team-empty">Only the verified 206-N identity is saved in this SQL draft. Cognito's AOR/SEOR address and email formulas remain provider-owned.</small>
        </section>

        <div className="project-setup-layout-pair project-setup-teams-pair" id="setup-section-riggs">
          <section className="bid-edit-section project-setup-section">
            {sectionHeading('TEAM','Riggs Team')}
            <RiggsProjectTeam values={form} directory={directory} onChange={change}
              disabled={busy||uncertain||conflict||!author||directoryBusy}/>
          </section>
          <section className="bid-edit-section project-setup-section">
            {sectionHeading('TEAM','GC Team')}
            <GcProjectTeam value={form.gcContactInfo} savedValue={record.values.gcContactInfo}
              onChange={members=>change('gcContactInfo.teamMembers',members)}
              disabled={busy||uncertain||conflict||!author}/>
          </section>
        </div>

        <section className="bid-edit-section project-setup-section project-setup-scope-section" id="setup-section-scope">
          {sectionHeading('SCOPE','Scope & Notes')}
          <div className="project-setup-scope-grid">
            <div className="project-setup-scope-column">
              <h4>Scope & requirements</h4>
              <div className="bid-edit-grid project-setup-requirements-grid">
                {yesNo('leed','LEED')}{yesNo('ndaRequired','NDA required')}
                {textarea('scope','Scope',{rows:5,className:'project-setup-span-full'})}
                {textarea('keywords','Job keywords',{rows:3,className:'project-setup-span-full',
                  help:'Legacy Cognito JobFilterKeywords is calculated from ControlProjectName; verify this field before Form 19 creation.'})}
              </div>
              <div className="cognito-general-buildings project-setup-buildings">
                <div className="cognito-general-row-heading"><div><strong>Buildings</strong></div>
                  <button type="button" className="secondary-button" onClick={()=>change('buildingNames',[...(form.buildingNames||[]),{cognitoRowId:null,name:''}])}
                    disabled={(form.buildingNames||[]).length>=100}>Add building</button></div>
                {(form.buildingNames||[]).map((row,index)=><div className="cognito-general-building" key={row.cognitoRowId || `new-${index}`}>
                  <label className="bid-edit-field"><span>Building {index+1}</span><input value={row.name??''} maxLength={1000}
                    onChange={event=>change('buildingNames',form.buildingNames.map((value,i)=>i===index?{...value,name:event.target.value}:value))}/></label>
                  <button type="button" className="secondary-button" onClick={()=>change('buildingNames',form.buildingNames.filter((_,i)=>i!==index))}>Remove</button>
                </div>)}
              </div>
            </div>
            <div className="project-setup-scope-column project-setup-notes-section">
              <h4>Notes</h4>
              {textarea('comments','Project setup comments',{rows:8})}
              <div className="project-setup-source-notes">
                <details><summary>Original Bid Notes</summary>
                  <p className="bid-log-read-only-note project-setup-source-note-text">{record.originatingBid.notes || 'No bid notes recorded.'}</p>
                  <button type="button" className="secondary-button" disabled={!record.originatingBid.notes} onClick={()=>{
                    const notes=record.originatingBid.notes;const current=form.comments || '';
                    change('comments',current ? `${current}\n\n${notes}` : notes);
                  }}>Copy original Bid Notes into Comments</button>
                </details>
                <details><summary>Current Awarded Bid Notes</summary>
                  {!reference && <button type="button" className="secondary-button" disabled={referenceBusy} onClick={()=>void loadReference()}>
                    {referenceBusy?'Loading…':'Load current reference'}</button>}
                  {reference && <><p className="bid-log-read-only-note project-setup-source-note-text">{reference.bidNotes || 'No notes in the current awarded-bid reference.'}</p>
                    <button type="button" className="secondary-button" disabled={!reference.bidNotes} onClick={()=>{
                      const notes=reference.bidNotes;const current=form.comments || '';
                      change('comments',current ? `${current}\n\n${notes}` : notes);
                    }}>Copy current Bid Notes into Comments</button></>}
                  {referenceError && <p role="alert" className="cognito-general-note">{referenceError}</p>}
                </details>
              </div>
            </div>
          </div>
        </section>
      </fieldset>
    </>}
  </FloatingEditorShell>;
}
