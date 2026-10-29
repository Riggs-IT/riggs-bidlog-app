import {useCallback,useEffect,useRef,useState} from 'react';
import FloatingEditorShell from './FloatingEditorShell.jsx';
import {applyDraftChanges,buildDraftChanges,currentAwardReference,mayAuthor,openSetup,readPath,requestSetup,
  setPath,setupError,validateDraft,validateEditReceipt} from './projectSetupAuthoring.mjs';

const BASIC = [
  ['jobName','Project name','text'],['numberOfBuildings','Building count','number'],
  ['jobType','Project type','text'],['purpose','Purpose','text'],
  ['streetAddress','Street address','text'],['city','City','text'],['state','State','text'],
  ['postalCode','ZIP / postal code','text'],['contractAmount','Operational contract starting value','text'],
  ['retentionPercent','Retention (%)','text'],['anticipatedStartDate','Anticipated start','date'],
  ['estimatedDurationMonths','Estimated duration (months)','number'],
];
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
      setNotice('Draft saved in Awaiting information. Nothing has been added to Cognito.');
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
    if ((dirty || uncertain) && !window.confirm('Leave these unsaved or unverified edits? The last confirmed draft stays in Awaiting information.')) return;
    onLeave();
  }
  function reload() {
    if (busy || !record) return;
    if ((dirty || uncertain) && !window.confirm('Replace these entries with the latest saved draft? This does not undo any successful save.')) return;
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
          else setNotice('No changes to save. The existing draft remains saved.');
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
      setNotice('Draft saved. Cognito and the awarded bid have not been updated.');
      onSaved?.(accepted.setupId);
      if (leaveAfter) {onLeave();return;}
      try {
        const current=validateDraft(await requestSetup(`/api/project-setups/drafts/${accepted.setupId}`));
        if (current.setupId !== accepted.setupId) throw new Error();
        setRecord(current);setForm(structuredClone(current.values));
      } catch {
        setNotice('Your save was confirmed. The latest read could not be refreshed; reload before your next edit.');
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
  function input(path,label,type='text') {
    const value=readPath(form,path);
    return <label key={path} className="bid-edit-field"><span>{label}</span>
      <input type={type} value={value ?? ''} maxLength={1000}
        step={type==='number' ? '1' : undefined} min={type==='number' ? (path==='numberOfBuildings'?0:1) : undefined}
        onChange={event=>change(path,event.target.value)}/></label>;
  }
  function textarea(path,label) {
    return <label className="bid-edit-field wide"><span>{label}</span>
      <textarea rows={4} maxLength={20000} value={readPath(form,path) ?? ''}
        onChange={event=>change(path,event.target.value)}/></label>;
  }
  return <FloatingEditorShell eyebrow="PROJECT SETUP · DRAFT" title={record?.values.jobName || 'Project setup'}
    subtitle={record ? `Draft revision ${record.revision} · No job number required` : 'Preparing the saved setup'}
    backLabel="Awaiting information" onClose={leave} saving={busy}
    className="bid-log-edit-drawer" bodyClassName="bid-log-edit-body"
    footer={<footer className="bid-log-edit-footer floating-editor-footer">
      <div className="floating-editor-footer-status"><small>{dirty?'Unsaved changes':record?'Last confirmed draft is retained.':'No draft has been confirmed on this page.'}</small></div>
      <div className="bid-log-edit-footer-actions">
        <button type="button" className="secondary-button" onClick={leave} disabled={busy}>Back to Awaiting information</button>
        {record && author && <>
          <button type="button" className="secondary-button" onClick={()=>void save(false)} disabled={busy||conflict}>
            {uncertain?'Retry exact save':'Save draft'}</button>
          <button type="button" className="primary-button" onClick={()=>void save(true)} disabled={busy||conflict}>
            {busy?'Saving…':'Save & continue later'}</button>
        </>}
      </div></footer>}>
    {!author && <p role="alert" className="bid-edit-message error">Draft editing is limited to authorized Bid Log administrators in this release.</p>}
    {busy && !record && <p role="status" className="bid-edit-message">Saving or opening the project setup…</p>}
    {error && <div role="alert" className="bid-edit-message error"><span>{error}</span>
      {!record && <button className="secondary-button" disabled={busy} onClick={()=>void load()}>Retry setup only</button>}
      {record && <button className="secondary-button" disabled={busy} onClick={reload}>Reload saved draft</button>}
    </div>}
    {notice && <p role="status" className="bid-edit-message">{notice}</p>}
    {choices && <section className="bid-edit-section">
      <h3>{choices.mode==='CHOOSE_CHILD'?'Choose the intended child project':'Existing job link needs review'}</h3>
      {choices.mode==='EXISTING_JOB_REVIEW' && <p>This bid already has a job relationship. Another child will not be created automatically.</p>}
      {choices.choices.map(c=><button key={c.setupId} type="button" className="secondary-button" disabled={busy}
        onClick={()=>void load({setupId:c.setupId})}>{c.jobName || 'Unnamed child'} · {c.setupId.slice(0,8)}…</button>)}
    </section>}
    {record && form && <>
      <p className="cognito-general-note">These are editable draft values, not changes to the live project, awarded bid, staffing, or Cognito. A job number is not required to save.</p>
      <fieldset className="cognito-general-fields" disabled={busy||uncertain||conflict||!author}>
        <section className="bid-edit-section"><h3>Project basics</h3>
          <div className="bid-edit-grid three-column">{BASIC.map(([p,l,t])=>input(p,l,t))}</div>
          <p className="cognito-general-note">Awarded GC reference: <strong>{reference ? reference.gcSourceLabel || 'Not recorded in the loaded reference' : 'Load the current awarded-bid reference below'}</strong>. This name is reference-only. Verified GC and team selectors will be connected separately; no lookup identity is guessed.</p>
        </section>
        <section className="bid-edit-section"><h3>General information</h3>
          <div className="bid-edit-grid three-column">
            {input('bond','Bond')}{input('parcel','Parcel')}
            {[['leed','LEED'],['ndaRequired','NDA required']].map(([p,l])=><label className="bid-edit-field" key={p}><span>{l}</span>
              <select value={readPath(form,p) === null ? '' : String(readPath(form,p) ?? '')} onChange={e=>change(p,e.target.value)}>
                <option value="">Not supplied</option><option value="true">Yes</option><option value="false">No</option>
              </select></label>)}
            {textarea('scope','Scope')}{textarea('keywords','Keywords')}
          </div>
          <div className="cognito-general-buildings"><div className="cognito-general-row-heading"><strong>Building names</strong>
            <button type="button" className="secondary-button" onClick={()=>change('buildingNames',[...(form.buildingNames||[]),{cognitoRowId:null,name:''}])}
              disabled={(form.buildingNames||[]).length>=100}>Add building name</button></div>
            {(form.buildingNames||[]).map((row,index)=><div className="cognito-general-building" key={row.cognitoRowId || `new-${index}`}>
              <label className="bid-edit-field"><span>Building {index+1}</span><input value={row.name??''} maxLength={1000}
                onChange={e=>change('buildingNames',form.buildingNames.map((v,i)=>i===index?{...v,name:e.target.value}:v))}/></label>
              <button type="button" className="secondary-button" onClick={()=>change('buildingNames',form.buildingNames.filter((_,i)=>i!==index))}>Remove</button>
            </div>)}
          </div>
        </section>
        <section className="bid-edit-section"><h3>GC contacts</h3><div className="bid-edit-grid three-column">
          {input('gcContactInfo.generalEmail','General email')}{input('gcContactInfo.streetAddress','Street address')}{input('gcContactInfo.cityStateZip','City / state / ZIP')}
          {CONTACT.map(([p,l])=>input(`gcContactInfo.pm.${p}`,`GC PM — ${l}`))}
          {CONTACT.map(([p,l])=>input(`gcContactInfo.superintendent.${p}`,`GC Superintendent — ${l}`))}
        </div></section>
        <section className="bid-edit-section"><h3>Owner information</h3><div className="bid-edit-grid three-column">
          {input('projectOwnerInfo.name','Owner')}{input('projectOwnerInfo.email','Owner email')}
          {input('projectOwnerInfo.streetAddress','Owner street address')}{input('projectOwnerInfo.cityStateZip','Owner city / state / ZIP')}
        </div></section>
        <section className="bid-edit-section"><h3>Notes & comments</h3>
          <details><summary>Original Bid Notes — reference</summary><p className="bid-log-read-only-note" style={{whiteSpace:'pre-wrap'}}>{record.originatingBid.notes || 'No bid notes recorded.'}</p></details>
          <button type="button" className="secondary-button" disabled={!record.originatingBid.notes} onClick={()=>{
            const notes=record.originatingBid.notes;
            const current=form.comments || '';
            change('comments',current ? `${current}\n\n${notes}` : notes);
          }}>Copy original Bid Notes into Comments</button>
          <button type="button" className="secondary-button" disabled={referenceBusy} onClick={()=>void loadReference()}>
            {referenceBusy?'Reading awarded bid…':'Load current awarded-bid reference'}</button>
          {referenceError && <p role="alert" className="cognito-general-note">{referenceError}</p>}
          {reference && <details><summary>Bid Notes from the loaded awarded-bid reference</summary>
            <p style={{whiteSpace:'pre-wrap'}}>{reference.bidNotes || 'No notes in this reference.'}</p>
            <button type="button" className="secondary-button" disabled={!reference.bidNotes} onClick={()=>{
              const notes=reference.bidNotes;const current=form.comments || '';
              change('comments',current ? `${current}\n\n${notes}` : notes);
            }}>Copy these Bid Notes into Comments</button></details>}
          {textarea('comments','Ops Comments')}
        </section>
      </fieldset>
    </>}
  </FloatingEditorShell>;
}
