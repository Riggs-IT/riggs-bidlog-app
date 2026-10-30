import {useCallback,useEffect,useRef,useState} from 'react';
import FloatingEditorShell from './FloatingEditorShell.jsx';
import {applyDraftChanges,buildDraftChanges,currentAwardReference,mayAuthor,openSetup,readPath,requestSetup,
  setPath,setupError,validateDraft,validateEditReceipt} from './projectSetupAuthoring.mjs';

const PROJECT_TYPES = ['Tilt','CIP','PRE','SITE','Other'];
const PURPOSES = ['RET','OFF','PAR','IND','EDU','MED','RES','MIX','DAT','STG','SIDE'];
const CONTACT = [['name','Name'],['office','Office phone'],['mobile','Mobile phone'],['email','Email']];

export default function ProjectSetupEditor({intent,user,onLeave,onSaved}) {
  const [record,setRecord] = useState(null);
  const [form,setForm] = useState(null);
  const [touched,setTouched] = useState(new Set());
  const [choices,setChoices] = useState(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState(null);
  const [notice,setNotice] = useState(null);
  const [reference,setReference] = useState(null);
  const [referenceBusy,setReferenceBusy] = useState(false);
  const [referenceError,setReferenceError] = useState(null);
  const [uncertain,setUncertain] = useState(false);
  const [conflict,setConflict] = useState(false);
  const controller = useRef(null);
  const sequence = useRef(0);
  const saving = useRef(false);
  const pending = useRef(null);
  const openOperation = useRef(null);
  const dirty = touched.size > 0;
  const author = mayAuthor(user);

  const load = useCallback(async (selection = intent) => {
    if (!mayAuthor(user)) return;
    controller.current?.abort();
    const abort = new AbortController();controller.current=abort;
    const seq = ++sequence.current;
    openOperation.current ||= crypto.randomUUID();
    setBusy(true);setError(null);setChoices(null);setReference(null);setReferenceError(null);
    try {
      const result = await openSetup(selection,{operationId:openOperation.current,signal:abort.signal});
      if (seq !== sequence.current || abort.signal.aborted) return;
      if (result.context) {setChoices(result.context);setRecord(null);return;}
      setReference(result.reference || null);
      setRecord(result.setup);setForm(structuredClone(result.setup.values));
      setTouched(new Set());setConflict(false);setUncertain(false);pending.current=null;
      setNotice('Draft ready. Fill what you know now and save when you are ready.');
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
    if (!dirty && !uncertain && !busy) return;
    const warn = event => {event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return () => window.removeEventListener('beforeunload',warn);
  },[dirty,uncertain,busy]);

  function change(path,value) {
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
        pending.current={operationId:crypto.randomUUID(),expectedRevision:record.revision,changes};
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
        <small>The awarded GC is shown for reference until the verified GC selector is connected.</small>
      </div>
      <button type="button" className="secondary-button" disabled={referenceBusy||busy} onClick={()=>void loadReference()}>
        {referenceBusy?'Loading…':reference?'Refresh reference':'Load reference'}
      </button>
    </div>;
  }

  return <FloatingEditorShell eyebrow="PROJECT SETUP" title={record?.values.jobName || 'Project setup'}
    subtitle={record ? 'Project setup in progress' : 'Opening project setup'}
    backLabel="Project Setup" onClose={leave} saving={busy}
    className="bid-log-edit-drawer project-setup-editor" bodyClassName="bid-log-edit-body project-setup-body"
    footer={<footer className="bid-log-edit-footer floating-editor-footer">
      <div className="floating-editor-footer-status">
        <small>{dirty?'Unsaved changes':record?'All confirmed changes are saved.':'No draft has been confirmed on this page.'}</small>
      </div>
      <div className="bid-log-edit-footer-actions">
        <button type="button" className="secondary-button" onClick={leave} disabled={busy}>Back to Project Setup</button>
        {record && author && <>
          <button type="button" className="secondary-button" onClick={()=>void save(false)} disabled={busy||conflict}>
            {uncertain?'Retry exact save':'Save draft'}</button>
          <button type="button" className="primary-button" onClick={()=>void save(true)} disabled={busy||conflict}>
            {busy?'Saving…':'Save & close'}</button>
        </>}
      </div></footer>}>
    {!author && <p role="alert" className="bid-edit-message error">You do not have permission to edit project setup drafts.</p>}
    {busy && !record && <p role="status" className="bid-edit-message">Opening project setup…</p>}
    {error && <div role="alert" className="bid-edit-message error"><span>{error}</span>
      {!record && <button className="secondary-button" disabled={busy} onClick={()=>void load()}>Retry setup only</button>}
      {record && <button className="secondary-button" disabled={busy} onClick={reload}>Reload saved draft</button>}
    </div>}
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
      <div className="project-setup-status-card" role="status">
        <div className="project-setup-status-copy">
          <span className="project-setup-status-badge">Draft</span>
          <div><strong>Not yet sent to Cognito</strong><small>Fill what you know now. You can save this setup and return later.</small></div>
        </div>
        <details className="project-setup-draft-details">
          <summary>Draft details</summary>
          <div><span>Revision</span><strong>{record.revision}</strong></div>
          <div><span>Job number</span><strong>Not assigned</strong></div>
          <div><span>Setup ID</span><strong>{record.setupId}</strong></div>
        </details>
      </div>
      <fieldset className="cognito-general-fields project-setup-fields" disabled={busy||uncertain||conflict||!author}>
        <section className="bid-edit-section project-setup-section">
          {sectionHeading('PROJECT','Project overview','Start with the project identity from the awarded bid. These values stay editable while the setup is a draft.')}
          <div className="bid-edit-grid project-setup-overview-grid">
            {input('jobName','Project name','text',{className:'project-setup-span-2'})}
            {select('jobType','Project type',PROJECT_TYPES)}
            {select('purpose','Purpose',PURPOSES)}
            {input('numberOfBuildings','Building count','number')}
          </div>
        </section>

        <section className="bid-edit-section project-setup-section">
          {sectionHeading('LOCATION & SCHEDULE','Where and when','Use the expected project location and startup timing. These can be refined later.')}
          <div className="bid-edit-grid project-setup-location-grid">
            {input('streetAddress','Street address','text',{className:'project-setup-span-2'})}
            {input('city','City')}{input('state','State')}{input('postalCode','ZIP / postal code')}
            {input('anticipatedStartDate','Anticipated start','date')}
            {input('estimatedDurationMonths','Estimated duration (months)','number')}
          </div>
        </section>

        <section className="bid-edit-section project-setup-section">
          {sectionHeading('CONTRACT & ADMINISTRATION','Project commercial setup','Capture the operational startup values needed for the project record. Foundation financial values remain separate.')}
          <div className="bid-edit-grid project-setup-commercial-grid">
            {input('contractAmount','Starting contract amount','text',{decimal:true,help:'Operational setup value; this does not replace Foundation contract values.'})}
            {input('retentionPercent','Retention (%)','text',{decimal:true})}
            {input('bond','Bond')}{input('parcel','Parcel')}
          </div>
        </section>

        <section className="bid-edit-section project-setup-section">
          {sectionHeading('SCOPE & REQUIREMENTS','Project details','Add the information Operations will use to identify, organize, and prepare the job.')}
          <div className="bid-edit-grid project-setup-requirements-grid">
            {yesNo('leed','LEED')}{yesNo('ndaRequired','NDA required')}
            {textarea('scope','Scope',{rows:5,className:'project-setup-span-full'})}
            {textarea('keywords','Job keywords',{rows:3,className:'project-setup-span-full'})}
          </div>
          <div className="cognito-general-buildings project-setup-buildings">
            <div className="cognito-general-row-heading"><div><strong>Building names</strong><small>Name individual buildings when this project has more than one.</small></div>
              <button type="button" className="secondary-button" onClick={()=>change('buildingNames',[...(form.buildingNames||[]),{cognitoRowId:null,name:''}])}
                disabled={(form.buildingNames||[]).length>=100}>Add building</button></div>
            {(form.buildingNames||[]).map((row,index)=><div className="cognito-general-building" key={row.cognitoRowId || `new-${index}`}>
              <label className="bid-edit-field"><span>Building {index+1}</span><input value={row.name??''} maxLength={1000}
                onChange={event=>change('buildingNames',form.buildingNames.map((value,i)=>i===index?{...value,name:event.target.value}:value))}/></label>
              <button type="button" className="secondary-button" onClick={()=>change('buildingNames',form.buildingNames.filter((_,i)=>i!==index))}>Remove</button>
            </div>)}
          </div>
        </section>

        <section className="bid-edit-section project-setup-section">
          {sectionHeading('GENERAL CONTRACTOR','GC contacts','Keep project-level GC contact information together. The awarded GC name remains a reference until its verified lookup is connected.')}
          {awardedGcReference()}
          {referenceError && <p role="alert" className="cognito-general-note">{referenceError}</p>}
          <div className="project-setup-contact-section">
            <div className="project-setup-contact-block">
              <h4>Company</h4>
              <div className="bid-edit-grid project-setup-contact-grid">
                {input('gcContactInfo.generalEmail','General email')}{input('gcContactInfo.streetAddress','Street address')}
                {input('gcContactInfo.cityStateZip','City / state / ZIP','text',{className:'project-setup-span-2'})}
              </div>
            </div>
            <div className="project-setup-contact-block">
              <h4>GC Project Manager</h4>
              <div className="bid-edit-grid project-setup-contact-grid">{CONTACT.map(([path,label])=>input(`gcContactInfo.pm.${path}`,label))}</div>
            </div>
            <div className="project-setup-contact-block">
              <h4>GC Superintendent</h4>
              <div className="bid-edit-grid project-setup-contact-grid">{CONTACT.map(([path,label])=>input(`gcContactInfo.superintendent.${path}`,label))}</div>
            </div>
          </div>
        </section>

        <section className="bid-edit-section project-setup-section">
          {sectionHeading('OWNER','Project owner','Record the owner information used for the project setup.')}
          <div className="bid-edit-grid project-setup-owner-grid">
            {input('projectOwnerInfo.name','Owner name')}{input('projectOwnerInfo.email','Owner email')}
            {input('projectOwnerInfo.streetAddress','Street address')}{input('projectOwnerInfo.cityStateZip','City / state / ZIP')}
          </div>
        </section>

        <section className="bid-edit-section project-setup-section project-setup-notes-section">
          {sectionHeading('NOTES','Project setup comments','Keep working project notes here. Bid notes remain source references unless you explicitly copy them.')}
          {textarea('comments','Project setup comments',{rows:6})}
          <div className="project-setup-source-notes">
            <details>
              <summary>Original Bid Notes</summary>
              <p className="bid-log-read-only-note project-setup-source-note-text">{record.originatingBid.notes || 'No bid notes recorded.'}</p>
              <button type="button" className="secondary-button" disabled={!record.originatingBid.notes} onClick={()=>{
                const notes=record.originatingBid.notes;const current=form.comments || '';
                change('comments',current ? `${current}\n\n${notes}` : notes);
              }}>Copy original Bid Notes into Comments</button>
            </details>
            <details>
              <summary>Current Awarded Bid Notes</summary>
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
        </section>
      </fieldset>
    </>}
  </FloatingEditorShell>;
}
