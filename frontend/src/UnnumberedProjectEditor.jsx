import ProjectFieldTeam from './ProjectFieldTeam.jsx';
import ActiveProjectAdditionalMembers from './ActiveProjectAdditionalMembers.jsx';
import ProjectExternalTeam from './ProjectExternalTeam.jsx';
import ProjectServiceBindings from './ProjectServiceBindings.jsx';
import ProjectTeamPopup from './ProjectTeamPopup.jsx';
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
import ProjectReferenceContactCard from './ProjectReferenceContactCard.jsx';
import ProjectQuantitiesLayout from './ProjectQuantitiesLayout.jsx';
import ProjectMetricsFields from './ProjectMetricsFields.jsx';
import {ReadField} from './ActiveProjectCognitoSections.jsx';
import {saveProjectEditLanes} from './projectEditorSave.mjs';
import {projectEditorSectionFields, projectFieldAffix, recordedProjectValue,beginProjectBuildings,canCancelEmptyBuildingDraft,cancelEmptyBuildingDraft} from './projectEditorLayout.mjs';
import {quantityWholeDisplay,validateMetricEdits} from './projectMetricsEditor.mjs';
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
export function Field({field,value,onChange,onCancelBuildings,disabled,compact=false}){
  if(!field)return null;
  const editable=field.mappedEdit&&['ordinary','later','core','gcRoster','reference'].includes(field.lane);
  const canChange=!disabled&&field.editable;
  if(field.key==='contractFlag')return <ProjectContractType value={value} disabled={!canChange||!editable} onChange={onChange}/>;
  if(field.kind==='multiChoice')return <ProjectSubmittals choices={field.choices} value={value} disabled={!canChange||!editable} onChange={onChange}/>;
  if(field.kind==='lookup')return <ProjectSetupIdentityPicker label={field.label} value={value}
    options={field.options||[]} currentLabel={value===field.selectionId?field.value||'':''} allowClear={field.allowClear===true}
    disabled={!canChange||!editable} onChange={onChange}/>;
  if(field.kind==='rows')return <div className="bid-edit-field wide"><ProjectBuildingRows rows={value}
    editable={editable&&field.editable} disabled={!canChange} onChange={onChange}
    onCancel={canCancelEmptyBuildingDraft(field)?onCancelBuildings:undefined}/></div>;
  const textValue=valueText(field,value);
  if(field.section==='services')return <div className="project-information-item"><span>{field.key==='folderCreated'?'Folder created (recorded)':field.key==='dropboxFolderName'?'Dropbox folder name':field.label}</span><strong>{recordedProjectValue(value,field.kind)}</strong></div>;
  if(field.lane==='accountingReview')return <ReadField label={field.label==='OHP'?'OH&P':field.label} value={value}/>;
  if(field.lane==='workflow')return <div className="project-information-item"><span>{field.label}</span><strong>{recordedProjectValue(value,field.kind)}</strong></div>;
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
  const [additionalDirty,setAdditionalDirty]=useState(false),[additionalSaving,setAdditionalSaving]=useState(false);
  const [externalDirty,setExternalDirty]=useState(false),[externalSaving,setExternalSaving]=useState(false);
  const [teamSaving,setTeamSaving]=useState(false);
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
  useEffect(()=>{if(!dirty&&!uncertain&&!metricsDirty&&!metricReview&&!additionalDirty&&!additionalSaving&&!externalDirty&&!externalSaving&&!teamSaving)return;const warn=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn);},[dirty,uncertain,metricsDirty,metricReview,additionalDirty,additionalSaving,externalDirty,externalSaving,teamSaving]);
  const canEdit=author&&detail?.writeEnabled===true&&!busy&&!uncertain&&!metricsState.saving&&!additionalSaving&&!externalSaving&&!teamSaving;
  const canEditMetrics=author&&metricsState.snapshot?.canEdit===true&&!busy&&!metricsState.loading&&!metricsState.saving&&!metricReview&&!uncertain&&!additionalSaving&&!externalSaving&&!teamSaving;
  const canSave=(dirty||metricsDirty)&&(!dirty||canEdit)&&(!metricsDirty||canEditMetrics)&&!busy&&!metricReview&&!uncertain&&!additionalSaving&&!externalSaving&&!teamSaving&&!metricsState.saving;
  const getValue=f=>Object.hasOwn(values,f.key)?values[f.key]:referenceValue(f);
  function change(field,value){if(canEdit&&field.editable){
    const contacts=field.key==='gcLookupId'&&value!==field.selectionId?detail.fields.filter(f=>f.section==='gc'&&f.editable&&getValue(f)):[];
    if(contacts.length&&!window.confirm('Change GC and clear the existing GC contacts?'))return;
    setValues(old=>({...old,...Object.fromEntries(contacts.map(f=>[f.key,''])),[field.key]:value}));setNotice(null);
  }}
  function cancelBuildingEdit(field){if(canEdit&&field.editable)setValues(old=>cancelEmptyBuildingDraft(old,field));}
  function close(){if(busy||saving.current||metricsState.saving||additionalSaving||externalSaving||teamSaving)return;if((dirty||uncertain||metricsDirty||metricReview||additionalDirty||externalDirty)&&!window.confirm('Discard unsaved changes?'))return;onLeave();}
  function reload(){if(busy||saving.current||metricsState.saving||additionalSaving||externalSaving||teamSaving)return;if((dirty||uncertain||metricsDirty||metricReview||additionalDirty||externalDirty)&&!window.confirm('Reload and discard local changes?'))return;void metricsEditor.load({force:true});setCycle(v=>v+1);}
  async function save(){
    if(!canSave||saving.current)return;
    let changes={};
    try{
      if(dirty)changes=buildJisChanges(detail,values);
      if(metricsDirty)validateMetricEdits(metricsState.snapshot,metricsState.draft);
    }catch(e){setNotice({type:'error',message:e.message});return;}
    saving.current=true;setBusy(true);setError(null);setNotice(null);
    let fieldsError=null;
    try{
      const result=await saveProjectEditLanes({metricsDirty,fieldsDirty:dirty,
        saveMetrics:()=>metricsEditor.save(),saveFields:async()=>{
          if(!Object.keys(changes).length){setValues({});return true;}
          try{
            const body=await requestSetup(`/api/project-setups/jis/${setupId}`,{method:'PATCH',body:{operationId:createSetupOperationId(),expectedRevision:detail.revision,expectedEntryId:detail.cognitoEntryId,expectedVersion:detail.entryVersion,changes}});
            const accepted=validateJisDetail(body.detail,setupId);
            if(!['VERIFIED','NO_CHANGE'].includes(body.result)||accepted.cognitoEntryId!==detail.cognitoEntryId||accepted.revision!==detail.revision||accepted.entryVersion!==(body.result==='VERIFIED'?detail.entryVersion+1:detail.entryVersion))throw Error('Receipt mismatch');
            setDetail(accepted);setValues({});return true;
          }catch(e){
            setUncertain(true);fieldsError=e.status===422?'Check the project fields and reload.':'Project field save not verified. Reload to review.';return false;
          }
        }});
      if(result.ok){setNotice({type:'success',message:'Changes saved.'});}
      else setNotice({type:'error',message:`${result.saved.includes('metrics')?'Project quantities saved. ':''}${result.failed==='metrics'?'Quantity save not verified. Project fields were not sent.':fieldsError||'Project field save not verified. Reload to review.'}`});
      if(result.saved.length)Promise.resolve().then(()=>onSaved?.()).catch(()=>{});
    }finally{saving.current=false;setBusy(false);}
  }
  function reloadMetrics(){
    if(busy||saving.current||metricsState.saving||additionalSaving||externalSaving||teamSaving)return;
    if((metricsDirty||metricReview)&&!window.confirm('Reload saved quantities? Your unsaved quantity edits will be replaced. No write will be repeated.'))return;
    void metricsEditor.load({force:true});
  }
  function discardChanges(){
    if(busy||saving.current||metricsState.saving||additionalSaving||externalSaving||teamSaving||uncertain||metricsState.unresolved)return;
    if(!window.confirm('Discard all unsaved edits? Changes that already saved will stay saved.'))return;
    setValues({});metricsEditor.discard();setError(null);setNotice(null);
  }
  function renderField(field,compact=false){if(!field)return null;return <Field key={field.key} compact={compact===true} field={field} value={getValue(field)} onChange={value=>change(field,value)} onCancelBuildings={()=>cancelBuildingEdit(field)} disabled={!canEdit}/>;}
  const byKey=new Map((detail?.fields||[]).map(f=>[f.key,f]));
  function namedField(key,label){
    const field=byKey.get(key);
    return field?renderField({...field,label:label??field.label}):null;
  }
  function contactCard(key,label,emailKey,addressKeys){
    const field=byKey.get(key);
    if(!field)return null;
    return <ProjectReferenceContactCard field={field} selectedId={getValue(field)} fields={byKey}
      emailKey={emailKey} addressKeys={addressKeys} directories={{gcs:form140,architects:form206?.architects,engineers:form206?.engineers}}
      lookup={namedField(key,label)}/>;
  }
  const buildingField=byKey.get('buildingNames');
  const buildingRows=buildingField?getValue(buildingField):undefined;
  const canAddBuildings=Boolean(buildingField?.editable&&canEdit);
  function addBuildings(){if(canAddBuildings){const rows=beginProjectBuildings(buildingRows);if(rows)change(buildingField,rows);}}
  function renderSection([id,kicker,title]){
    return <ActiveProjectSection key={id} sectionId={id} kicker={kicker} title={title} className={`bid-edit-section${['admin','parties','design','scope'].includes(id)?` active-project-${id}-section`:''}`} initiallyOpen={['basics','location','admin','parties','design','riggs','gc','scope','buildings','metrics','services'].includes(id)}>
      {id==='suppliers'?<div className="m9b-supplier-grid"><div className="m9b-supplier-header"><strong>Category</strong><strong>Supplier</strong><strong>Amount</strong><strong>Contracts</strong></div>
        {SUPPLIERS.map(([key,label])=><div key={key} className="m9b-supplier-row"><strong>{label}</strong>{['Supplier','Amount','Files'].map(s=>renderField(byKey.get(key+s),true))}</div>)}</div>
        :id==='services'?<ProjectServiceBindings detail={detail}/>:id==='closeout'?<>
          <div className="bid-edit-grid two-column">{projectEditorSectionFields(detail.fields,id).filter(f=>f.lane!=='workflow').map(renderField)}</div>
          <div className="information-sheet-subheading">Recorded closeout status · read-only</div>
          <div className="project-information-grid">{projectEditorSectionFields(detail.fields,id).filter(f=>f.lane==='workflow').map(renderField)}</div>
        </>
        :id==='admin'?<div className="bid-edit-grid two-column active-project-admin-grid">
          {['retention','operationalContractAmount','bond','parcel','ohp','lender','lenderStreet','lenderCityStateZip'].map(key=>namedField(key))}
        </div>
        :id==='basics'?<div className="bid-edit-grid active-project-core-grid">{['jobName','jobType','purpose','contractFlag'].map(key=>namedField(key))}</div>
        :id==='location'?<div className="bid-edit-grid active-project-location-grid">{['streetAddress','cityStateZip','anticipatedStartDate','estimatedDurationMonths'].map(key=>namedField(key))}</div>
        :id==='metrics'?<ProjectMetricsFields state={metricsState} editor={metricsEditor} canEdit={author}
          blocked={busy||uncertain||additionalSaving||externalSaving||teamSaving}
          reference={{squareFootage:byKey.get('squareFootageSF')?.value,cubicYards:byKey.get('cubicYardsCY')?.value}}
          onReload={reloadMetrics}/>
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
        :<div className={id==='services'?'project-information-grid':id==='admin'?'bid-edit-grid two-column active-project-admin-grid':'bid-edit-grid two-column'}>{projectEditorSectionFields(detail.fields,id).filter(f=>!['superintendentEid','foremanEids','additionalMemberITUserIds'].includes(f.key)).map(renderField)}</div>}
    </ActiveProjectSection>;
  }
  return <FloatingEditorShell eyebrow="ACTIVE PROJECT" title={detail?.jobName||'Opening project…'} subtitle={detail?'Job number pending':null}
    backLabel="Back to Projects" onClose={close} saving={busy||metricsState.saving||additionalSaving||externalSaving||teamSaving} className="bid-log-edit-drawer active-project-edit-drawer project-setup-editor" bodyClassName="bid-log-edit-body project-setup-body" scrollSurface
    headerActions={detail?<div className="active-project-header-controls"><button type="button" className="secondary-button project-sections-toggle" disabled={busy||metricsState.saving||additionalSaving||externalSaving||teamSaving} onClick={reload}>Reload details</button><ProjectSectionsToggle rootRef={root} disabled={busy}/></div>:null}
    footer={<footer ref={footerRef} className="bid-log-edit-footer floating-editor-footer"><small>{busy||metricsState.saving?'Saving…':uncertain||metricReview?'Review required':dirty||metricsDirty||additionalDirty||externalDirty?'Unsaved changes':detail?.writeEnabled&&author?'No unsaved changes':'View only'}</small><div className="bid-log-edit-footer-actions"><button className="secondary-button" type="button" disabled={busy||uncertain||metricsState.unresolved||metricsState.saving||additionalSaving||externalSaving||teamSaving||(!dirty&&!metricsDirty&&!metricReview)} onClick={discardChanges}>Discard Changes</button><button className="bid-log-save-button" type="button" disabled={!canSave} onClick={()=>void save()}>{busy||metricsState.saving?'Saving…':'Save Changes'}</button></div></footer>}>
    {busy&&!detail&&<p role="status">Loading project…</p>}
    {error&&<p className="bid-edit-message error" role="alert">{error}</p>}
    <ActionToast message={notice?.message} type={notice?.type} style={{bottom:toastBottom}} onDismiss={()=>setNotice(null)}/>
    {detail&&<>
      <div className="active-project-section-flow" ref={root}>
        <div className="active-project-layout-pair">{GROUPS.slice(0,2).map(renderSection)}</div>
        <ProjectQuantitiesLayout rows={buildingRows} canAdd={canAddBuildings} editing={Object.hasOwn(values,"buildingNames")} onAdd={addBuildings}
          metrics={renderSection(['metrics','METRICS','Project Metrics'])}
          commercial={renderSection(['admin','ADMINISTRATION','Contract & Financial Details'])}
          buildings={renderSection(GROUPS[8])}/>
        {GROUPS.slice(3,5).map(renderSection)}
        <div className="active-project-layout-pair active-project-teams-pair">{GROUPS.slice(5,7).map(renderSection)}</div>
        <ActiveProjectSection sectionId="fieldTeam" kicker="TEAM" title="Field Team" initiallyOpen>
          <ProjectFieldTeam projectName={detail.jobName} setupId={setupId} canSaveStaffing={author} anticipatedStart={byKey.get('anticipatedStartDate')?.value}
            duration={byKey.get('estimatedDurationMonths')?.value} canInspect={inspector} blocked={busy||metricsState.saving||uncertain||additionalSaving||externalSaving||teamSaving}/>
        </ActiveProjectSection>
        <ActiveProjectSection sectionId="additionalMembers" kicker="TEAM" title="Additional Team" initiallyOpen>
          <ProjectTeamPopup projectName={detail.jobName} internalAvailable={inspector}
            canEdit={author} blocked={busy||metricsState.saving||additionalSaving||externalSaving||teamSaving}
            internalDirty={additionalDirty} externalDirty={externalDirty}
            internalSaving={additionalSaving} externalSaving={externalSaving} onCombinedSavingChange={setTeamSaving}
            internal={<ActiveProjectAdditionalMembers setupId={setupId} canEdit={author} canInspect={inspector}
              blocked={busy||metricsState.saving||uncertain||externalSaving} reloadKey={cycle}
              onDirtyChange={setAdditionalDirty} onSavingChange={setAdditionalSaving}/>}
            external={<ProjectExternalTeam setupId={setupId} canEdit={author}
              blocked={busy||metricsState.saving||uncertain||additionalSaving}
              reloadKey={cycle} onDirtyChange={setExternalDirty} onSavingChange={setExternalSaving}/>}/>
        </ActiveProjectSection>
        {renderSection(GROUPS[7])}
        {renderSection(GROUPS[9])}<div className="active-project-layout-pair active-project-reference-pair">{GROUPS.slice(10,12).map(renderSection)}</div>
        {renderSection(GROUPS[12])}{renderSection(GROUPS[14])}
      </div></>}
  </FloatingEditorShell>;
}
