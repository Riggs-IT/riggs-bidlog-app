import ProjectFieldTeam from './ProjectFieldTeam.jsx';
import ProjectContractType from './ProjectContractType.jsx';
import ProjectSubmittals from './ProjectSubmittals.jsx';
import ProjectBuildingRows from './ProjectBuildingRows.jsx';
import MoneyInput from './MoneyInput.jsx';
import {displayMoneyValue} from './moneyInput.js';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import ActionToast from './ActionToast.jsx';
import useGcReference from './useGcReference.js';
import FloatingEditorShell from './FloatingEditorShell.jsx';
import ActiveProjectSection from './ActiveProjectSection.jsx';
import ProjectSetupIdentityPicker from './ProjectSetupIdentityPicker.jsx';
import DesignTeamContactDetails from './DesignTeamContactDetails.jsx';
import {projectEditorSectionFields, selectedReferenceContact, projectFieldAffix} from './projectEditorLayout.mjs';
import {quantityWholeDisplay} from './projectMetricsEditor.mjs';
import useActiveProjectMetrics from './useActiveProjectMetrics.js';
import ProjectSectionsToggle from './ProjectSectionsToggle.jsx';
import {mayAuthor,mayInspectSetup,requestSetup,createSetupOperationId,validateForm206Directory} from './projectSetupAuthoring.mjs';
import {GROUPS,SUPPLIERS,validateJisDetail,buildJisChanges,referenceValue} from './unnumberedProjectEditor.mjs';

function fileLabel(item){
  return `${item?.name||'Attached file'}${Number.isFinite(item?.size)?` · ${item.size.toLocaleString()} B`:''}`;
}
function valueText(field,value){
  if(value===null||value===undefined||value==='')return '—';
  const affix=projectFieldAffix(field);
  if(affix==='$'){const number=Number(value);return Number.isFinite(number)?`$${displayMoneyValue(value,false,null)}`:String(value);}
  if(affix==='%')return `${String(value).trim().replace(/%$/,'').trim()}%`;
  if(field.kind==='integer'&&field.lane==='metrics')return displayMoneyValue(quantityWholeDisplay(value),false,0)||'—';
  if(field.key==='contractFlag')return value===true?'Contract':value===false?'LOI':'—';
  if(field.kind==='boolean')return value===true?'Yes':value===false?'No':'—';
  if(Array.isArray(value))return value.length?value.map(v=>field.kind==='files'?fileLabel(v):field.kind==='rows'?v.name:String(v??'')).join('\n'):(field.kind==='files'?'No file attached':'—');
  return String(value);
}
function Field({field,value,onChange,disabled,compact=false}){
  if(!field)return null;
  const editable=field.mappedEdit&&['ordinary','later','core','gcRoster','reference'].includes(field.lane);
  const canChange=!disabled&&field.editable;
  if(field.key==='contractFlag')return <ProjectContractType value={value} disabled={!canChange||!editable} onChange={onChange}/>;
  if(field.kind==='multiChoice')return <ProjectSubmittals choices={field.choices} value={value} disabled={!canChange||!editable} onChange={onChange}/>;
  if(field.kind==='lookup')return <ProjectSetupIdentityPicker label={field.label} value={value}
    options={field.options||[]} currentLabel={value===field.selectionId?field.value||'':''} allowClear={field.allowClear===true}
    disabled={!canChange||!editable} onChange={onChange}/>;
  if(field.kind==='rows')return <div className="bid-edit-field wide"><ProjectBuildingRows rows={value}
    editable={editable&&field.editable} disabled={!canChange} onChange={onChange}/></div>;
  const textValue=valueText(field,value);
  if(field.section==='services')return <div className="project-information-item"><span>{field.label}</span><strong>{textValue}</strong></div>;
  const numeric=['integer','number','moneyText','percentText'].includes(field.kind);
  const wide=['textarea','rows','files','multiChoice'].includes(field.kind);
  const affix=projectFieldAffix(field);
  if(!editable&&field.kind!=='boolean'&&field.kind!=='choice'&&field.kind!=='multiChoice'&&field.kind!=='integer'&&field.kind!=='date')return <div className={`bid-edit-field ${wide?'wide':''}`}><span className={compact?'m9b-supplier-field-label':undefined}>{field.label}</span>
    <div className="m9b-read-value">{textValue}</div></div>;
  // Grouping is presentation-only; keep the canonical draft values and save contract.
  const groupedQuantity=field.kind==='integer'&&field.lane==='metrics';
  const input=affix==='$'||groupedQuantity
    ?<MoneyInput maxFractionDigits={groupedQuantity?0:field.kind==='moneyText'?4:null}
      value={groupedQuantity?quantityWholeDisplay(value):value??''} disabled={!canChange||!editable} onValueChange={onChange}/>
    :<input type={field.kind==='email'?'email':field.kind==='date'?'date':numeric?'number':'text'} min={numeric?0:undefined} step={field.kind==='integer'?1:numeric?'any':undefined} inputMode={field.kind==='integer'?'numeric':numeric?'decimal':undefined} value={field.lane==='metrics'?quantityWholeDisplay(value):field.kind==='percentText'?String(value??'').trim().replace(/%$/,'').trim():field.kind==='date'&&typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value)?value.slice(0,10):value??''} disabled={!canChange||!editable} onChange={e=>onChange(e.target.value)}/>;
  return <label className={`bid-edit-field ${wide?'wide':''}`}><span className={compact?'m9b-supplier-field-label':undefined}>{field.label}</span>
    {field.kind==='boolean'?<select value={value===true?'true':value===false?'false':''} disabled={!canChange||!editable} onChange={e=>onChange(e.target.value==='true')}>
      <option value="" disabled>Not selected</option><option value="true">Yes</option><option value="false">No</option></select>
    :field.kind==='choice'?<select value={value??''} disabled={!canChange||!editable} onChange={e=>onChange(e.target.value)}>
      <option value="" disabled>Select…</option>{value&&!field.choices.includes(value)&&<option value={value} disabled>{value} (historical)</option>}
      {field.choices.map(choice=><option key={choice} value={choice}>{choice}</option>)}</select>
    :field.kind==='textarea'?<textarea rows="3" value={value??''} disabled={!canChange||!editable} onChange={e=>onChange(e.target.value)}/>
    :affix?<span className={`project-value-affix ${affix==='$'?'prefix':'suffix'}`}><span aria-hidden="true">{affix}</span>{input}</span>
    :input}
  </label>;
}

export default function UnnumberedProjectEditor({setupId,user,onLeave,onSaved}){
  const [detail,setDetail]=useState(null),[values,setValues]=useState({}),[busy,setBusy]=useState(true),[error,setError]=useState(null),[notice,setNotice]=useState(null),[uncertain,setUncertain]=useState(false),[cycle,setCycle]=useState(0);
  const root=useRef(null),saving=useRef(false),footerRef=useRef(null);
  const [toastBottom,setToastBottom]=useState(140);
  const [form206,setForm206]=useState(null);
  const inspector=mayInspectSetup(user);
  const {items:form140}=useGcReference(inspector);
  useEffect(()=>{
    if(!inspector){setForm206(null);return;}
    const abort=new AbortController();setForm206(null);
    requestSetup('/api/project-setups/authoring/form206',{signal:abort.signal})
      .then(body=>{if(!abort.signal.aborted)setForm206(validateForm206Directory(body));})
      .catch(()=>{if(!abort.signal.aborted)setForm206(null);});
    return ()=>abort.abort();
  },[inspector,user?.eid]);
  useLayoutEffect(()=>{
    const footer=footerRef.current;if(!footer)return;
    const position=()=>setToastBottom(Math.max(16,window.innerHeight-footer.getBoundingClientRect().top+12));
    position();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(position);
    observer?.observe(footer);window.addEventListener('resize',position);
    return ()=>{observer?.disconnect();window.removeEventListener('resize',position);};
  },[]);
  const author=mayAuthor(user);
  const {editor:metricsEditor,state:metricsState,dirty:metricsDirty}=useActiveProjectMetrics(null,author,setupId);
  const metricReview=metricsState.unresolved||metricsState.conflict;
  const dirty=Object.keys(values).some(k=>JSON.stringify(values[k])!==JSON.stringify(referenceValue(detail.fields.find(f=>f.key===k))));
  useEffect(()=>{
    const abort=new AbortController();setBusy(true);setError(null);setNotice(null);
    requestSetup(`/api/project-setups/jis/${setupId}${cycle?'?fresh=true':''}`,{signal:abort.signal}).then(body=>{
      if(abort.signal.aborted)return;
      setDetail(validateJisDetail(body,setupId));setValues({});setUncertain(false);
    }).catch(()=>{if(!abort.signal.aborted){setUncertain(true);setError('Unable to load project information.');}})
      .finally(()=>{if(!abort.signal.aborted)setBusy(false);});
    return ()=>abort.abort();
  },[setupId,cycle]);
  useEffect(()=>{if(!dirty&&!uncertain&&!metricsDirty&&!metricReview)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn);},[dirty,uncertain,metricsDirty,metricReview]);
  const canEdit=author&&detail?.writeEnabled===true&&!busy&&!uncertain&&!metricsState.saving;
  const getValue=f=>Object.hasOwn(values,f.key)?values[f.key]:referenceValue(f);
  function change(field,value){if(canEdit&&field.editable){
    const contacts=field.key==='gcLookupId'&&value!==field.selectionId?detail.fields.filter(f=>f.section==='gc'&&f.editable&&getValue(f)):[];
    if(contacts.length&&!window.confirm('Change GC and clear the existing GC contacts?'))return;
    setValues(old=>({...old,...Object.fromEntries(contacts.map(f=>[f.key,''])),[field.key]:value}));setNotice(null);
  }}
  function close(){if(busy||saving.current||metricsState.saving)return;if((dirty||uncertain||metricsDirty||metricReview)&&!window.confirm('Discard unsaved changes?'))return;onLeave();}
  function reload(){if(busy||saving.current||metricsState.saving)return;if((dirty||uncertain||metricsDirty||metricReview)&&!window.confirm('Reload and discard local changes?'))return;void metricsEditor.load({force:true});setCycle(v=>v+1);}
  async function save(){
    if(!canEdit||!dirty||saving.current)return;
    let changes;
    try{changes=buildJisChanges(detail,values);}catch(e){setNotice({type:'error',message:e.message});return;}
    if(!Object.keys(changes).length){setValues({});return;}
    saving.current=true;setBusy(true);setError(null);setNotice(null);
    try{
      const body=await requestSetup(`/api/project-setups/jis/${setupId}`,{method:'PATCH',body:{operationId:createSetupOperationId(),expectedRevision:detail.revision,expectedEntryId:detail.cognitoEntryId,expectedVersion:detail.entryVersion,changes}});
      const accepted=validateJisDetail(body.detail,setupId);
      if(!['VERIFIED','NO_CHANGE'].includes(body.result)||accepted.cognitoEntryId!==detail.cognitoEntryId||accepted.revision!==detail.revision||accepted.entryVersion!==(body.result==='VERIFIED'?detail.entryVersion+1:detail.entryVersion))throw Error('Receipt mismatch');
      setDetail(accepted);setValues({});setNotice({type:'success',message:body.result==='VERIFIED'?'Changes saved.':'No changes needed.'});onSaved?.();
    }catch(e){
      // Even if a relay returns a validation error, require a fresh read after a failed save.
      setUncertain(true);setNotice({type:'error',message:e.status===422?'Check the values and reload.':'Save not verified. Reload to review.'});
    }finally{saving.current=false;setBusy(false);}
  }
  async function saveMetrics(){
    if(busy||saving.current||metricsState.saving||!author||!metricsState.snapshot?.canEdit||metricReview||!metricsDirty)return;
    if(await metricsEditor.save()){
      setNotice({type:'success',message:'Project metrics saved.'});onSaved?.();
    }
  }
  function renderField(field,compact=false){if(!field)return null;return <Field key={field.key} compact={compact===true} field={field} value={getValue(field)} onChange={value=>change(field,value)} disabled={!canEdit}/>;}
  const byKey=new Map((detail?.fields||[]).map(f=>[f.key,f]));
  function namedField(key,label){
    const field=byKey.get(key);
    return field?renderField({...field,label:label??field.label}):null;
  }
  function contactCard(key,label,emailKey,addressKeys){
    const field=byKey.get(key);
    if(!field)return null;
    const contact=selectedReferenceContact(field,getValue(field),byKey,emailKey,addressKeys,
      {gcs:form140,architects:form206?.architects,engineers:form206?.engineers});
    return <div className="design-team-person-card">
      {namedField(key,label)}
      <DesignTeamContactDetails contact={contact} showSource={false}/>
    </div>;
  }
  function renderSection([id,kicker,title]){
    return <ActiveProjectSection key={id} sectionId={id} kicker={kicker} title={title} className={`bid-edit-section${id==='admin'?' active-project-admin-section':''}`} initiallyOpen={['basics','location','admin','parties','design','riggs','gc','scope','buildings','metrics'].includes(id)}>
      {id==='suppliers'?<div className="m9b-supplier-grid"><div className="m9b-supplier-header"><strong>Category</strong><strong>Supplier</strong><strong>Amount</strong><strong>Contracts</strong></div>
        {SUPPLIERS.map(([key,label])=><div key={key} className="m9b-supplier-row"><strong>{label}</strong>{['Supplier','Amount','Files'].map(s=>renderField(byKey.get(key+s),true))}</div>)}</div>
        :id==='metrics'?<>
          <div className="bid-edit-grid two-column">
            {[['squareFootage','squareFootageSF','Square Footage (SF)'],['cubicYards','cubicYardsCY','Cubic Yards (CY)']].map(([key,fieldKey,label])=>
              <label className="bid-edit-field" key={key}><span>{label}</span>
                {metricsState.snapshot?<MoneyInput maxFractionDigits={0} value={metricsState.draft?.[key]??''}
                  disabled={!author||!metricsState.snapshot.canEdit||busy||metricsState.loading||metricsState.saving||metricReview}
                  onValueChange={value=>metricsEditor.edit(key,value)}/>:<div className="active-project-readonly-field"><strong>{(byKey.has(fieldKey)?valueText(byKey.get(fieldKey),byKey.get(fieldKey).value):'—')}</strong></div>}
              </label>)}
          </div>
          {metricsState.loading&&<small role="status">Loading project metrics…</small>}
          {metricsState.error&&<p className="bid-edit-message error" role="alert">{metricsState.error}</p>}
          {metricsState.snapshot&&<small>Original award: {displayMoneyValue(quantityWholeDisplay(metricsState.snapshot.awardedSquareFootage),false,0)} SF / {displayMoneyValue(quantityWholeDisplay(metricsState.snapshot.awardedCubicYards),false,0)} CY</small>}
          {(metricsState.error||metricReview||metricsState.disabled)&&<button className="secondary-button" type="button" disabled={busy||metricsState.saving||metricsState.loading} onClick={()=>{if(!metricsDirty||window.confirm('Reload and discard unsaved project metrics?'))void metricsEditor.load({force:true});}}>Reload Metrics</button>}
          {author&&metricsState.snapshot?.canEdit&&<div className="bid-log-edit-footer-actions">
            <button className="secondary-button" type="button" disabled={busy||metricsState.saving||metricReview||!metricsDirty} onClick={()=>metricsEditor.discard()}>Discard Metrics</button>
            <button className="bid-log-save-button" type="button" disabled={busy||metricsState.loading||metricsState.saving||metricReview||!metricsDirty} onClick={()=>void saveMetrics()}>Save Metrics</button>
          </div>}
        </>
        :id==='parties'?<div className="active-project-parties-grid">
          <div className="active-project-party-block"><h4>Owner / Developer</h4>
            <div className="bid-edit-grid two-column">
              {namedField('ownerName','Name')}{namedField('ownerEmail','Email')}
              {namedField('ownerStreetAddress','Street Address')}{namedField('ownerCityStateZip','City / State / ZIP')}
            </div>
          </div>
          <div className="active-project-party-block"><h4>General Contractor</h4>
            {contactCard('gcLookupId','General Contractor','gcEmail',['gcStreetAddress','gcCityStateZip'])}
          </div>
        </div>
        :id==='design'?<div className="design-team-section"><div className="project-setup-design-grid">
          {contactCard('architectLookupId','Architect of record','architectEmail',['architectAddress'])}
          {contactCard('structuralEngineerLookupId','Structural engineer of record','structuralEngineerEmail',['structuralEngineerAddress'])}
        </div></div>
        :id==='scope'?<div className="active-project-scope-grid">
          <div className="active-project-scope-column"><h4>Scope & requirements</h4>
            {namedField('scope')}<div className="active-project-scope-flags">{namedField('leed')}{namedField('ndaRequired')}</div>
          </div>
          <div className="active-project-scope-column"><h4>Notes</h4>
            {namedField('comments')}
          </div>
        </div>
        :<div className={id==='services'?'project-information-grid':id==='admin'?'bid-edit-grid two-column active-project-admin-grid':'bid-edit-grid two-column'}>{projectEditorSectionFields(detail.fields,id).filter(f=>!['superintendentEid','foremanEids'].includes(f.key)).map(renderField)}</div>}
    </ActiveProjectSection>;
  }
  return <FloatingEditorShell eyebrow="ACTIVE PROJECT" title={detail?.jobName||'Opening project…'} subtitle={detail?'Job number pending':null}
    backLabel="Back to Projects" onClose={close} saving={busy||metricsState.saving} className="bid-log-edit-drawer active-project-edit-drawer project-setup-editor" bodyClassName="bid-log-edit-body project-setup-body" scrollSurface
    headerActions={detail?<ProjectSectionsToggle rootRef={root} disabled={busy}/>:null}
    footer={<footer ref={footerRef} className="bid-log-edit-footer floating-editor-footer"><small>{uncertain||metricReview?'Review required':dirty||metricsDirty?'Unsaved changes':detail?.writeEnabled&&author?'No unsaved changes':'View only'}</small><div className="bid-log-edit-footer-actions"><button className="secondary-button" type="button" disabled={busy||metricsState.saving} onClick={reload}>Reload</button><button className="secondary-button" type="button" disabled={!canEdit||!dirty} onClick={()=>{setValues({});setError(null);setNotice(null);}}>Discard Changes</button><button className="bid-log-save-button" type="button" disabled={!canEdit||!dirty} onClick={()=>void save()}>Save Changes</button></div></footer>}>
    {busy&&!detail&&<p role="status">Loading project…</p>}
    {error&&<p className="bid-edit-message error" role="alert">{error}</p>}
    <ActionToast message={notice?.message} type={notice?.type} style={{bottom:toastBottom}} onDismiss={()=>setNotice(null)}/>
    {detail&&<>
      <div className="active-project-section-flow" ref={root}>
        <div className="active-project-layout-pair">{GROUPS.slice(0,2).map(renderSection)}</div>
        {renderSection(['metrics','METRICS','Project Metrics'])}
        <div className="active-project-layout-pair active-project-admin-buildings-pair">
          {renderSection(['admin','ADMINISTRATION','Admin'])}{renderSection(GROUPS[8])}
        </div>
        {GROUPS.slice(3,5).map(renderSection)}
        <div className="active-project-layout-pair active-project-teams-pair">{GROUPS.slice(5,7).map(renderSection)}</div>
        <ActiveProjectSection sectionId="fieldTeam" kicker="TEAM" title="Field Team" initiallyOpen>
          <ProjectFieldTeam projectName={detail.jobName} anticipatedStart={byKey.get('anticipatedStartDate')?.value}
            duration={byKey.get('estimatedDurationMonths')?.value} canInspect={inspector} blocked={busy||metricsState.saving}/>
        </ActiveProjectSection>
        {renderSection(GROUPS[7])}
        {renderSection(GROUPS[9])}<div className="active-project-layout-pair active-project-reference-pair">{GROUPS.slice(10,12).map(renderSection)}</div>
        {renderSection(GROUPS[12])}{renderSection(GROUPS[14])}
      </div></>}
  </FloatingEditorShell>;
}
