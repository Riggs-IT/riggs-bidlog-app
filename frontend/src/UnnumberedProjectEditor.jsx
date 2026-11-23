import {useEffect,useRef,useState} from 'react';
import FloatingEditorShell from './FloatingEditorShell.jsx';
import ActiveProjectSection,{setProjectSectionsOpen} from './ActiveProjectSection.jsx';
import {mayAuthor,requestSetup,createSetupOperationId} from './projectSetupAuthoring.mjs';
import {GROUPS,SUPPLIERS,validateJisDetail,buildJisChanges} from './unnumberedProjectEditor.mjs';

function fileLabel(item){
  return `${item?.name||'Attached file'}${Number.isFinite(item?.size)?` · ${item.size.toLocaleString()} B`:''}`;
}
function valueText(field,value){
  if(value===null||value===undefined||value==='')return '—';
  if(field.kind==='boolean')return value===true?'Yes':value===false?'No':'—';
  if(Array.isArray(value))return value.length?value.map(v=>field.kind==='files'?fileLabel(v):String(v??'')).join('\n'):(field.kind==='files'?'No file attached':'—');
  return String(value);
}
const referenceNote={core:'Core project write path pending',reference:'Verified identity editor pending',staffing:'SQL roster editor pending',gcRoster:'SQL contact roster editor pending',buildingRows:'Row editing pending',documents:'Dropbox integration pending',metrics:'Awarded quantity reference',schedule:'Available after numbering',finance:'Foundation after numbering',derived:'Derived from selected reference',accountingReview:'Accounting ownership pending',accountingNumber:'Assigned in Accounting',workflow:'Dedicated workflow action',graph:'Microsoft project email integration pending',dropbox:'Dropbox integration pending'};
function Field({field,value,onChange,disabled}){
  if(!field)return null;
  const editable=field.mappedEdit&&['ordinary','later'].includes(field.lane);
  const canChange=!disabled&&field.editable;
  const textValue=valueText(field,value);
  const wide=['textarea','rows','files','multiChoice'].includes(field.kind);
  if(!editable)return <div className={`bid-edit-field ${wide?'wide':''}`}><span>{field.label}</span>
    <div className="m9b-read-value">{textValue}</div>{referenceNote[field.lane]&&<small>{referenceNote[field.lane]}</small>}</div>;
  return <label className={`bid-edit-field ${wide?'wide':''}`}><span>{field.label}</span>
    {field.kind==='boolean'?<select value={value===true?'true':value===false?'false':''} disabled={!canChange} onChange={e=>onChange(e.target.value==='true')}>
      <option value="" disabled>Not selected</option><option value="true">Yes</option><option value="false">No</option></select>
    :field.kind==='choice'?<select value={value??''} disabled={!canChange} onChange={e=>onChange(e.target.value)}>
      <option value="" disabled>Select…</option>{value&&!field.choices.includes(value)&&<option value={value} disabled>{value} (historical)</option>}
      {field.choices.map(choice=><option key={choice} value={choice}>{choice}</option>)}</select>
    :field.kind==='multiChoice'?<select multiple size={Math.min(8,Math.max(3,field.choices.length))} value={Array.isArray(value)?value:[]} disabled={!canChange} onChange={e=>onChange(Array.from(e.target.selectedOptions,v=>v.value))}>
      {[...new Set([...field.choices,...(Array.isArray(value)?value:[])])].map(choice=><option key={choice} value={choice} disabled={!field.choices.includes(choice)}>{choice}</option>)}</select>
    :field.kind==='textarea'?<textarea rows="3" value={value??''} disabled={!canChange} onChange={e=>onChange(e.target.value)}/>
    :<input type={field.kind==='email'?'email':'text'} inputMode={['integer','number'].includes(field.kind)?'decimal':undefined} value={value??''} disabled={!canChange} onChange={e=>onChange(e.target.value)}/>}
    {!field.editable&&<small>Mapped · save not enabled for this project</small>}
  </label>;
}

export default function UnnumberedProjectEditor({setupId,user,onLeave,onSaved}){
  const [detail,setDetail]=useState(null),[values,setValues]=useState({}),[busy,setBusy]=useState(true),[error,setError]=useState(null),[notice,setNotice]=useState(null),[uncertain,setUncertain]=useState(false),[cycle,setCycle]=useState(0);
  const root=useRef(null),saving=useRef(false);
  const author=mayAuthor(user);
  const dirty=Object.keys(values).some(k=>JSON.stringify(values[k])!==JSON.stringify(detail?.fields.find(f=>f.key===k)?.value));
  useEffect(()=>{
    const abort=new AbortController();setBusy(true);setError(null);setNotice(null);
    requestSetup(`/api/project-setups/jis/${setupId}`,{signal:abort.signal}).then(body=>{
      if(abort.signal.aborted)return;
      setDetail(validateJisDetail(body,setupId));setValues({});setUncertain(false);
    }).catch(()=>{if(!abort.signal.aborted){setUncertain(true);setError('Unable to verify the created project. No change was made.');}})
      .finally(()=>{if(!abort.signal.aborted)setBusy(false);});
    return ()=>abort.abort();
  },[setupId,cycle]);
  useEffect(()=>{if(!dirty&&!uncertain)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn);},[dirty,uncertain]);
  const canEdit=author&&detail?.writeEnabled===true&&!busy&&!uncertain;
  const getValue=f=>Object.hasOwn(values,f.key)?values[f.key]:f.value;
  function change(field,value){if(canEdit&&field.editable){setValues(old=>({...old,[field.key]:value}));setNotice(null);}}
  function close(){if(busy||saving.current)return;if((dirty||uncertain)&&!window.confirm('Close this editor? Unsaved changes will be discarded. An uncertain save is never replayed.'))return;onLeave();}
  function reload(){if(busy||saving.current)return;if((dirty||uncertain)&&!window.confirm('Reload the verified entry and discard local changes?'))return;setCycle(v=>v+1);}
  async function save(){
    if(!canEdit||!dirty||saving.current)return;
    let changes;
    try{changes=buildJisChanges(detail,values);}catch(e){setError(e.message);return;}
    if(!Object.keys(changes).length){setValues({});return;}
    saving.current=true;setBusy(true);setError(null);setNotice(null);
    try{
      const body=await requestSetup(`/api/project-setups/jis/${setupId}`,{method:'PATCH',body:{operationId:createSetupOperationId(),expectedRevision:detail.revision,expectedEntryId:detail.cognitoEntryId,expectedVersion:detail.entryVersion,changes}});
      const accepted=validateJisDetail(body.detail,setupId);
      if(!['VERIFIED','NO_CHANGE'].includes(body.result)||accepted.cognitoEntryId!==detail.cognitoEntryId||accepted.revision!==detail.revision||accepted.entryVersion!==(body.result==='VERIFIED'?detail.entryVersion+1:detail.entryVersion))throw Error('Receipt mismatch');
      setDetail(accepted);setValues({});setNotice(body.result==='VERIFIED'?'Changes verified in Cognito.':'No changes needed.');onSaved?.();
    }catch(e){
      // Even if a relay returns a validation error, require a fresh read after a failed save.
      setUncertain(true);setError(e.status===422?'Check entered values and provider choices. Reload before another save.':'Save could not be verified. Reload and review; do not repeat this save.');
    }finally{saving.current=false;setBusy(false);}
  }
  function renderField(field){return <Field key={field.key} field={field} value={getValue(field)} onChange={value=>change(field,value)} disabled={!canEdit}/>;}
  const byKey=new Map((detail?.fields||[]).map(f=>[f.key,f]));
  function renderSection([id,kicker,title]){
    return <ActiveProjectSection key={id} sectionId={id} kicker={kicker} title={title} initiallyOpen={true}>
      {id==='suppliers'?<div className="m9b-supplier-grid"><div className="m9b-supplier-header"><strong>Category</strong><strong>Supplier</strong><strong>Amount</strong><strong>Contracts</strong></div>
        {SUPPLIERS.map(([key,label])=><div key={key} className="m9b-supplier-row"><strong>{label}</strong>{['Supplier','Amount','Files'].map(s=>renderField(byKey.get(key+s)))}</div>)}</div>
        :<div className="bid-edit-grid two-column">{detail.fields.filter(f=>f.section===id).map(renderField)}</div>}
    </ActiveProjectSection>;
  }
  return <FloatingEditorShell eyebrow="ACTIVE PROJECT · AWAITING JOB NUMBER" title={detail?.jobName||'Opening project…'} subtitle={detail?`Unnumbered JIS · Entry ${detail.cognitoEntryId} · Version ${detail.entryVersion}`:null}
    backLabel="Projects" onClose={close} saving={busy} className="active-project-edit-drawer project-setup-editor" bodyClassName="bid-log-edit-body project-setup-body" scrollSurface
    headerActions={<div className="active-project-section-actions"><button type="button" className="secondary-button" onClick={()=>setProjectSectionsOpen(root.current,true)}>Expand all</button><button type="button" className="secondary-button" onClick={()=>setProjectSectionsOpen(root.current,false)}>Collapse all</button></div>}
    footer={<footer className="bid-log-edit-footer floating-editor-footer"><small>{uncertain?'Review required':dirty?'Unsaved changes':detail?.writeEnabled&&author?'No unsaved changes':'View only'}</small><div className="bid-log-edit-footer-actions"><button className="secondary-button" type="button" disabled={busy} onClick={reload}>Reload</button><button className="secondary-button" type="button" disabled={!canEdit||!dirty} onClick={()=>{setValues({});setError(null);}}>Discard Changes</button><button className="bid-log-save-button" type="button" disabled={!canEdit||!dirty} onClick={()=>void save()}>Save Changes</button></div></footer>}>
    {busy&&!detail&&<p role="status">Loading verified JIS…</p>}
    {error&&<p className="bid-edit-message error" role="alert">{error}</p>}
    {notice&&<p className="bid-edit-message" role="status">{notice}</p>}
    {detail&&<><p className="bid-log-read-only-note">{detail.holdReason==='HISTORICAL_REVIEW'?'Original canary retained for layout review. Saves are held until the approved reset and application creation of its replacement.':canEdit?'Mapped ordinary fields can be saved; other fields retain their own source authority.':'View only. This project is outside the enabled save pilot or has a pending review.'} Job number remains assigned by Accounting.</p>
      <div className="active-project-section-flow" ref={root}>
        <div className="active-project-layout-pair">{GROUPS.slice(0,2).map(renderSection)}</div>
        {GROUPS.slice(2,5).map(renderSection)}
        <div className="active-project-layout-pair active-project-teams-pair">{GROUPS.slice(5,7).map(renderSection)}</div>
        <div className="active-project-layout-pair">{GROUPS.slice(7,9).map(renderSection)}</div>
        {renderSection(GROUPS[9])}<div className="active-project-layout-pair active-project-reference-pair">{GROUPS.slice(10,12).map(renderSection)}</div>
        {GROUPS.slice(12).map(renderSection)}
      </div></>}
  </FloatingEditorShell>;
}
