import ProjectBuildingRows from './ProjectBuildingRows.jsx';
import ProjectContractType from './ProjectContractType.jsx';
import ActiveProjectSection from './ActiveProjectSection.jsx';
import ProjectSectionsToggle from './ProjectSectionsToggle.jsx';
import UnnumberedProjectEditor,{Field as JisField} from './UnnumberedProjectEditor.jsx';
import useNumberedProjectJis from './useNumberedProjectJis.js';
import {SUPPLIERS,referenceValue} from './unnumberedProjectEditor.mjs';
import {projectEditorSectionFields,beginProjectBuildings} from './projectEditorLayout.mjs';
import ProjectMetricsFields from './ProjectMetricsFields.jsx';
import ProjectQuantitiesLayout from './ProjectQuantitiesLayout.jsx';
import ProjectReferenceContactCard from './ProjectReferenceContactCard.jsx';
import {isHiddenProject} from './projectVisibility.mjs';
import {notifyWriteAuthFailure} from './writeAuthRecovery.mjs';
import useGcReference from './useGcReference.js';
import {activeProjectGcContact} from './gcReference.js';
import DesignTeamContactDetails from './DesignTeamContactDetails.jsx';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import ActiveProjectCognitoSections,{ReadField} from './ActiveProjectCognitoSections.jsx';
import ActiveProjectDesignTeam from './ActiveProjectDesignTeam.jsx';
import {validateForm206Directory} from './projectSetupAuthoring.mjs';
import FloatingEditorShell from './FloatingEditorShell.jsx';
import ActionToast from './ActionToast.jsx';
import ActiveProjectGeneralEditor from './ActiveProjectGeneralEditor.jsx';
import ActiveProjectSaveReview from './ActiveProjectSaveReview.jsx';
import ProjectFieldTeam from './ProjectFieldTeam.jsx';
import ActiveProjectAdditionalMembers from './ActiveProjectAdditionalMembers.jsx';
import ProjectExternalTeam from './ProjectExternalTeam.jsx';
import ProjectServiceBindings from './ProjectServiceBindings.jsx';
import ProjectTeamPopup from './ProjectTeamPopup.jsx';
import {foundationContractReference} from './projectFoundationReference.mjs';
import {ActiveProjectOfficeTeam,ActiveProjectGcTeam,ActiveProjectGcPicker} from './ActiveProjectTeamSections.jsx';
import useActiveProjectEditor from './useActiveProjectEditor.js';
import useActiveProjectMetrics from './useActiveProjectMetrics.js';


function requestErrorMessage(detail, fallback) {
  const messages = {
    active_project_not_found:
      'This active project could not be found.',
    job_not_found:
      'This active project could not be found.',
    job_person_not_assignable:
      'One of the selected Riggs team members is no longer assignable.',
    job_updates_disabled:
      'Active Project updates are currently disabled.',
    job_update_test_job_only:
      'Project editing unavailable.',
    invalid_active_project_update:
      'The project update was rejected because the submitted values were invalid.',
    data_api_unavailable:
      'Riggs data services are temporarily unavailable.',
    sql_capacity_unavailable:
      'Riggs data services are busy right now. Try again in a moment.',
    sql_unavailable:
      'Riggs data services are temporarily unavailable.',
  };

  return messages[detail] || detail || fallback;
}


async function requestJson(url, options = {}) {
  const response = await window.fetch(
    url,
    {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.headers || {}),
      },
    },
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = payload?.detail;
    notifyWriteAuthFailure(response.status, detail, options.method);
    const error = new Error(
      requestErrorMessage(
        detail,
        'Unable to complete the Active Project request.',
      ),
    );
    error.status = response.status;
    error.detail = detail;
    throw error;
  }

  return payload;
}


function Field({
  label,
  hint = null,
  wide = false,
  children,
}) {
  return (
    <label
      className={
        wide
          ? 'bid-edit-field wide'
          : 'bid-edit-field'
      }
    >
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}



function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return new Intl.NumberFormat(
    'en-US',
    {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    },
  ).format(number);
}


export default function ActiveProjectEditDrawer(props) {
  const {jobListId, projectSummary, setupId, user, onClose, onSaved}=props;
  if (isHiddenProject({...projectSummary,jobListId:jobListId??projectSummary?.jobListId})) return null;
  if (setupId) return <UnnumberedProjectEditor key={`setup:${setupId}`} setupId={setupId} user={user} onLeave={onClose} onSaved={onSaved}/>;
  return jobListId ? <NumberedProjectEditDrawer key={`job:${jobListId}`} {...props}/> : null;
}

function NumberedProjectEditDrawer({
  jobListId,
  projectSummary = null,
  user,
  onClose,
  onSaved,
}) {
  const role = String(user?.appRole || '').toUpperCase();
  const canEdit = ['ADMIN','OPERATIONS','MANAGEMENT_ADMIN'].includes(role) && Number(jobListId) !== 24 && !projectSummary?.projectCompleted;
  const canEditMetrics = ['ADMIN','OPERATIONS','MANAGEMENT_ADMIN'].includes(role) && Number(jobListId) !== 24;
  const managementPreview = false; // management has explicit numbered-project authoring approval
  const canInspectChoices = canEdit || managementPreview;
  const { items: gcOptions, loading: gcOptionsLoading, error: gcOptionsError, refresh: retryGcOptions } = useGcReference(canInspectChoices);
  const { editor, state, dirty: hasUnsavedChanges, needsReview } = useActiveProjectEditor(jobListId, canEdit);
  const {editor: metricsEditor, state: metricsState, dirty: metricsDirty} = useActiveProjectMetrics(jobListId, canEditMetrics);
  const [combinedSaving, setCombinedSaving] = useState(false);
  const combinedSavingRef = useRef(false);
  const jis=useNumberedProjectJis(jobListId,canEdit,()=>onSaved?.());
  const payload = state.project.snapshot;
  const form = state.project.draft;
  const loading = state.project.loading && !payload;
  const loadError = !payload ? state.project.error : null;
  const [externalDirty,setExternalDirty]=useState(false),[externalSaving,setExternalSaving]=useState(false);
  const [additionalSaving,setAdditionalSaving]=useState(false);
  const [teamSaving,setTeamSaving]=useState(false);
  const saving = state.saving || metricsState.saving || combinedSaving || jis.busy || externalSaving || additionalSaving || teamSaving;
  const anyDirty = hasUnsavedChanges || metricsDirty || jis.dirty;
  const anyNeedsReview = needsReview || metricsState.unresolved || metricsState.conflict || jis.review;
  const [cognitoPayload, setCognitoPayload] = useState(null);
  const [cognitoLoading, setCognitoLoading] = useState(true);
  const [cognitoError, setCognitoError] = useState(null);
  const [gcPreviewName, setGcPreviewName] = useState(null);
  const [designDirectory, setDesignDirectory] = useState(null);
  const [designDirectoryLoading, setDesignDirectoryLoading] = useState(false);
  const [designDirectoryError, setDesignDirectoryError] = useState(false);
  const [designDirectoryRetry, setDesignDirectoryRetry] = useState(0);
  const [staffingPayload, setStaffingPayload] = useState(null);
  const [staffingLoading, setStaffingLoading] = useState(true);
  const [staffingError, setStaffingError] = useState(null);
  const [additionalDirty, setAdditionalDirty] = useState(false);
  const [referenceRefreshing, setReferenceRefreshing] = useState(false);
  const referenceRequest = useRef(null);
  const staffingRequest = useRef(null);
  const referenceEpoch = useRef(0);
  const notifiedRevision = useRef(0);
  const footerRef = useRef(null);
  const sectionsRef = useRef(null);
  const [toastBottom, setToastBottom] = useState(140);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useLayoutEffect(() => {
    const footer = footerRef.current;
    if (!footer) return undefined;
    const positionToast = () => setToastBottom(Math.max(16, window.innerHeight - footer.getBoundingClientRect().top + 12));
    positionToast();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(positionToast);
    observer?.observe(footer);
    window.addEventListener('resize', positionToast);
    return () => { observer?.disconnect(); window.removeEventListener('resize', positionToast); };
  }, [Boolean(payload), jobListId]);

  const loadCognitoDetail = useCallback(async ({ quiet = false, fresh = false } = {}) => {
    if (!jobListId) return;
    referenceRequest.current?.abort();
    const controller = new AbortController();
    referenceRequest.current = controller;
    const generation = referenceEpoch.current;
    if (!quiet) { setCognitoLoading(true); setCognitoError(null); }
    else setReferenceRefreshing(true);
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 25000);
    try {
      const result = await requestJson(`/api/active-projects/${jobListId}/cognito-detail${fresh?'?fresh=true':''}`, {
        cache: 'no-store', signal: controller.signal,
      });
      if (controller.signal.aborted || generation !== referenceEpoch.current) return;
      if (Number(result?.jobListId) !== Number(jobListId)) throw new Error('Project information returned the wrong identity.');
      setCognitoPayload(result); setCognitoError(null);
    } catch (error) {
      if (generation === referenceEpoch.current && (!controller.signal.aborted || timedOut) && !quiet) {
        setCognitoError(timedOut ? 'Additional project information took too long to load.' : error.message || 'Unable to load additional project information.');
      }
    } finally {
      window.clearTimeout(timeout);
      if (generation === referenceEpoch.current && referenceRequest.current === controller) {
        setCognitoLoading(false); setReferenceRefreshing(false);
      }
    }
  }, [jobListId]);

  useEffect(() => { setGcPreviewName(null); }, [jobListId]);

  useEffect(() => {
    if (!canInspectChoices || !jobListId) {
      setDesignDirectory(null);
      setDesignDirectoryError(false);
      return undefined;
    }
    const controller = new AbortController();
    setDesignDirectoryLoading(true);
    setDesignDirectoryError(false);
    requestJson('/api/project-setups/authoring/form206', {signal: controller.signal})
      .then(value => {
        if (!controller.signal.aborted) setDesignDirectory(validateForm206Directory(value));
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDesignDirectory(null);
          setDesignDirectoryError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDesignDirectoryLoading(false);
      });
    return () => controller.abort();
  }, [canInspectChoices, jobListId, designDirectoryRetry]);

  useEffect(() => {
    referenceEpoch.current += 1;
    notifiedRevision.current = 0;
    setCognitoPayload(null); setCognitoError(null);
    void loadCognitoDetail();
    return () => { referenceEpoch.current += 1; referenceRequest.current?.abort(); };
  }, [loadCognitoDetail]);

  const loadStaffing = useCallback(async () => {
    if (!jobListId) return;
    staffingRequest.current?.abort();
    const controller = new AbortController();
    staffingRequest.current = controller;
    setStaffingLoading(true);
    setStaffingError(null);
    try {
      const result = await requestJson(`/api/active-projects/${jobListId}/resource-schedule`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (Number(result?.job?.jobListId) !== Number(jobListId)) {
        throw new Error('Field staffing returned the wrong project identity.');
      }
      setStaffingPayload(result);
    } catch (error) {
      if (!controller.signal.aborted) {
        setStaffingError(error?.message || 'Unable to load field staffing.');
      }
    } finally {
      if (!controller.signal.aborted && staffingRequest.current === controller) {
        setStaffingLoading(false);
      }
    }
  }, [jobListId]);

  useEffect(() => {
    setStaffingPayload(null);
    setStaffingError(null);
    void loadStaffing();
    return () => staffingRequest.current?.abort();
  }, [loadStaffing]);

  useEffect(() => {
    if (!state.refreshKey || state.saving) return undefined;
    if (notifiedRevision.current !== state.refreshKey) {
      notifiedRevision.current = state.refreshKey;
      // Refresh the directory independently: its failure must not replay a successful write.
      Promise.resolve().then(() => onSavedRef.current?.()).catch(() => {});
    }
    let cancelled = false;
    const timers = [];
    const delays = state.queued.length ? [0, 3000, 6000] : [0];
    async function run(index) {
      if (cancelled) return;
      await loadCognitoDetail({ quiet: true, fresh: true });
      if (!cancelled && index + 1 < delays.length) {
        timers.push(window.setTimeout(() => { void run(index + 1); }, delays[index + 1]));
      }
    }
    // Bounded reads of read-only reference sections only. Editable drafts are never overwritten.
    timers.push(window.setTimeout(() => { void run(0); }, 0));
    return () => { cancelled = true; timers.forEach(window.clearTimeout); referenceRequest.current?.abort(); };
  }, [state.refreshKey, state.saving, loadCognitoDetail]);


  const jisFields=new Map((jis.detail?.fields||[]).map(field=>[field.key,field]));
  function jf(key,fallback=null,compact=false){
    const field=jisFields.get(key);
    return field?<JisField key={key} field={field} compact={compact} value={Object.hasOwn(jis.values,key)?jis.values[key]:referenceValue(field)} onChange={v=>jis.change(field,v)} onCancelBuildings={()=>jis.cancelBuildingEdit(field)} disabled={!jis.canEdit||saving}/>:fallback;
  }
  const buildingField=jisFields.get('buildingNames');
  const legacyBuildingRows=cognitoPayload?.generalInformation?.buildingNames;
  const buildingRows=buildingField?(Object.hasOwn(jis.values,'buildingNames')?jis.values.buildingNames:referenceValue(buildingField))
    :Array.isArray(legacyBuildingRows)&&legacyBuildingRows.some(row=>typeof row?.name==='string'&&row.name.trim())?legacyBuildingRows:undefined;
  const canAddBuildings=Boolean(buildingField?.editable&&jis.canEdit&&!saving);
  function addBuildings(){if(canAddBuildings){const rows=beginProjectBuildings(buildingRows);if(rows)jis.change(buildingField,rows);}}
  function designContactCard(key,label,emailKey,addressKeys){
    const field=jisFields.get(key);
    if(!field)return null;
    const selectedId=Object.hasOwn(jis.values,key)?jis.values[key]:referenceValue(field);
    return <ProjectReferenceContactCard key={key} field={field} selectedId={selectedId} fields={jisFields}
      emailKey={emailKey} addressKeys={addressKeys} directories={designDirectory||{}}
      lookup={<JisField field={{...field,label}} value={selectedId} onChange={v=>jis.change(field,v)} disabled={!jis.canEdit||saving}/>}/>;
  }
  function updateField(name, value) { editor.edit('project', name, value); }
  const loadDetail = () => editor.load('project');

  async function saveChanges() {
    if (combinedSavingRef.current || state.saving || metricsState.saving || externalSaving || additionalSaving || teamSaving || anyNeedsReview || (!canEdit && !canEditMetrics)) return;
    combinedSavingRef.current = true;
    setCombinedSaving(true);
    try {
      // The two destinations are independent commits. Stop on an unconfirmed
      // metrics save; never replay PATCH or imply a cross-system transaction.
      if (metricsDirty) {
        const saved = await metricsEditor.save();
        if (!saved) return;
        Promise.resolve().then(() => onSavedRef.current?.()).catch(() => {});
      }
      // Direct JIS details first; SQL core update workers may then project a new version.
      if (jis.dirty && !await jis.save()) return;
      if (hasUnsavedChanges && canEdit) {await editor.save();jis.reload();}
    } finally {
      combinedSavingRef.current = false;
      setCombinedSaving(false);
    }
  }

  function requestClose() {
    if (saving) return;
    if ((anyDirty || anyNeedsReview || additionalDirty || externalDirty) && !window.confirm('Leave this project and discard unsaved edits? Saved changes are not undone.')) return;
    onClose();
  }

  function discardChanges() {
    if (saving || metricsState.unresolved) return;
    if (!window.confirm('Discard all unsaved edits? Changes that already saved will stay saved.')) return;
    editor.discard();
    metricsEditor.discard();
    jis.discard();
  }

  function reloadMetrics() {
    if (saving) return;
    if ((metricsDirty || metricsState.unresolved || metricsState.conflict)
      && !window.confirm('Reload saved quantities? Your unsaved quantity edits will be replaced. No write will be repeated.')) return;
    void metricsEditor.load({force: true});
  }

  if (!jobListId || isHiddenProject(payload?.job)) {
    return null;
  }

  const job = payload?.job || {};
  const foundationReference = foundationContractReference(projectSummary, jobListId);
  const lookups = payload?.lookups || {};
  const people = Array.isArray(lookups.people)
    ? lookups.people
    : [];
  const jobTypes = Array.isArray(lookups.jobTypes)
    ? lookups.jobTypes
    : [];
  const purposes = Array.isArray(lookups.purposes)
    ? lookups.purposes
    : [];
  // Management choices remain local-only; ADMIN continues through the existing
  // typed project editor. Never save preview GC text as an identity.
  const displayGcName = managementPreview && gcPreviewName !== null
    ? gcPreviewName : (form?.gc || '');
  const isGcPreview = managementPreview && gcPreviewName !== null
    && gcPreviewName !== (form?.gc || '');
  const gcContact = activeProjectGcContact({
    selectedName: displayGcName,
    savedName: form?.gc,
    options: gcOptions,
    cognito: cognitoPayload?.generalContractor,
  });

  return (
    <FloatingEditorShell
      eyebrow={
        job.projectCompleted || projectSummary?.projectCompleted
          ? (canEdit ? 'COMPLETED PROJECT · EDIT PROJECT' : 'COMPLETED PROJECT · VIEW PROJECT')
          : (canEdit ? 'ACTIVE PROJECT' : (canEditMetrics ? 'ACTIVE PROJECT · METRICS' : 'ACTIVE PROJECT · VIEW ONLY'))
      }
      title={job.jobName || projectSummary?.jobName || 'Loading project…'}
      subtitle={job.jobNumber ? `Job #${job.jobNumber}` : 'Job number unavailable'}
      backLabel="Back to Projects"
      onClose={requestClose}
      saving={saving}
      className={`bid-log-edit-drawer active-project-edit-drawer project-setup-editor${managementPreview ? ' management-admin-project-drawer' : ''}`}
      bodyClassName="bid-log-edit-body project-setup-body"
      scrollSurface
      headerActions={!loading && !loadError && payload && form ? (
        <div className="active-project-header-controls"><button type="button" className="secondary-button project-sections-toggle" disabled={saving || cognitoLoading || referenceRefreshing} onClick={()=>{if((jis.dirty||jis.review)&&!window.confirm('Reload project information and discard local changes?'))return;jis.reload();void loadCognitoDetail({fresh:true});}}>Reload details</button><ProjectSectionsToggle rootRef={sectionsRef} disabled={saving || cognitoLoading}/></div>
      ) : null}
      footer={
        (canEdit || canEditMetrics) && !loading && !loadError && payload && form ? (
          <footer ref={footerRef} className="bid-log-edit-footer floating-editor-footer">
            <div className="floating-editor-footer-status">
              <small>
                {saving ? (state.phase || 'Saving quantities…') : anyNeedsReview ? 'Review the latest values before saving.'
                  : anyDirty ? 'Unsaved changes.' : additionalDirty || externalDirty ? 'Team has unsaved changes.' : 'No unsaved changes.'}
              </small>
              {anyDirty && (
                <span className="floating-editor-dirty-indicator">
                  Unsaved changes
                </span>
              )}
            </div>

            <div className="bid-log-edit-footer-actions">
              <button type="button" className="secondary-button" onClick={discardChanges}
                disabled={saving || metricsState.unresolved || (!anyDirty && !state.conflicts.length)}>
                Discard Changes
              </button>
              <button type="button" className="bid-log-save-button" onClick={saveChanges}
                disabled={(!canEdit && !canEditMetrics) || saving || anyNeedsReview || !anyDirty || state.project.loading || state.general.loading || (metricsDirty && !metricsState.snapshot)}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </footer>
        ) : null
      }
    >
          {loading && (
            <div className="bid-edit-message">
              Loading latest project values…
            </div>
          )}

          {loadError && (
            <div className="bid-edit-message error">
              <span>{loadError}</span>
              <button
                type="button"
                className="secondary-button"
                onClick={loadDetail}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !loadError && payload && form && (
            <>
              {managementPreview ? (
                <div className="management-preview-notice management-preview-drawer-notice" role="note">
                  <strong>{canEditMetrics ? 'PROJECT REVIEW' : 'VIEW ONLY'}</strong>
                  <span>Project Metrics can be edited when available. Other project fields remain view only.</span>
                </div>
              ) : !canEdit ? (
                <div className="bid-edit-message">
                  {canEditMetrics ? 'Project Metrics editable; other fields are view only.' : 'View only.'}
                </div>
              ) : null}

              <ActionToast message={metricsState.notice || state.notice?.message} type={metricsState.notice ? 'success' : (state.notice?.type || 'success')} style={{ bottom: toastBottom }}
                onDismiss={() => {editor.dismissNotice(); metricsEditor.dismissNotice();}} />
              <ActiveProjectSaveReview state={state} editor={editor} />
              {jis.error&&<div className="bid-edit-message error" role="alert">{jis.error} <button type="button" className="secondary-button" disabled={saving} onClick={()=>{if(!jis.dirty||window.confirm('Discard local project information changes?'))jis.reload();}}>Reload information</button></div>}
              {jis.loading&&<small role="status">Loading editable project information…</small>}
              {jis.detail?.holdReason==='SYNC_PENDING'&&<small role="status">Project sync in progress. Reload details when it finishes to edit supplemental fields.</small>}

              <div ref={sectionsRef} key={jobListId} className="active-project-section-flow">
              <div className="active-project-layout-pair">
                <ActiveProjectSection sectionId="basics" kicker="PROJECT" title="Project basics" className="bid-edit-section" initiallyOpen>
                  <div className="bid-edit-grid active-project-core-grid">
                    <Field label="Project Name"><input type="text" value={form.jobName}
                      disabled={!canEdit || saving} onChange={event=>updateField('jobName',event.target.value)}/></Field>
                    <Field label="Project Type"><select value={form.jobType}
                      disabled={!canEdit || saving} onChange={event=>updateField('jobType',event.target.value)}>
                      <option value="">Select…</option>{[...new Set([...jobTypes,form.jobType].filter(Boolean))].map(value=><option key={value} value={value}>{value}</option>)}</select></Field>
                    <Field label="Purpose"><select value={form.purpose}
                      disabled={!canEdit || saving} onChange={event=>updateField('purpose',event.target.value)}>
                      <option value="">Select…</option>{[...new Set([...purposes,form.purpose].filter(Boolean))].map(value=><option key={value} value={value}>{value}</option>)}</select></Field>
                    {jf("contractFlag",<ProjectContractType value={cognitoPayload?.contract}/>)}
                  </div>

                </ActiveProjectSection>
                <ActiveProjectSection sectionId="location" kicker="LOCATION" title="Location & schedule" className="bid-edit-section" initiallyOpen>
                  <div className="bid-edit-grid active-project-location-grid">
                    <Field label="Street Address"><input type="text" value={form.streetAddress}
                      disabled={!canEdit || saving} onChange={event=>updateField('streetAddress',event.target.value)}/></Field>
                    <Field label="City / State / ZIP"><input type="text" value={form.cityStateZip}
                      disabled={!canEdit || saving} onChange={event=>updateField('cityStateZip',event.target.value)}/></Field>
                    <Field label="Anticipated Start"><input type="date" value={form.anticipatedStartDate}
                      disabled={!canEdit || saving} onChange={event=>updateField('anticipatedStartDate',event.target.value)}/></Field>
                    {jf("estimatedDurationMonths",<ReadField label="Estimated duration (months)" value={cognitoPayload?.riggsStartup?.estimatedDuration}/>)}
                  </div>
                </ActiveProjectSection>
              </div>

              <ProjectQuantitiesLayout rows={buildingRows} canAdd={canAddBuildings} editing={Object.hasOwn(jis.values,"buildingNames")} onAdd={addBuildings}
                metrics={<ActiveProjectSection sectionId="metrics" kicker="METRICS" title="Project Metrics" className="bid-edit-section" initiallyOpen>
                  <ProjectMetricsFields state={metricsState} editor={metricsEditor} canEdit={canEditMetrics} blocked={saving}
                    reference={{squareFootage:projectSummary?.squareFootage,cubicYards:projectSummary?.cubicYards}} onReload={reloadMetrics}/>
              </ActiveProjectSection>}
                commercial={<ActiveProjectSection sectionId="admin" kicker="ADMINISTRATION" title="Contract & Financial Details" className="bid-edit-section active-project-admin-section" initiallyOpen>
                    <div className="bid-edit-grid two-column active-project-admin-grid">
                      <Field label="Retention"><span className="project-value-affix suffix">{!String(form.retention??'').trim().endsWith('%')&&<span aria-hidden="true">%</span>}<input type="text" value={form.retention}
                        disabled={!canEdit || saving} onChange={event=>updateField('retention',event.target.value)}/></span></Field>
                      <div className="project-contract-comparison">
                        {jf("operationalContractAmount",<ReadField label="JIS contract amount (not Foundation total)" value={cognitoPayload?.contractsAndAdministration?.contractAmount==null?null:money(cognitoPayload.contractsAndAdministration.contractAmount)}/>)}
                        <small className="project-foundation-reference">{foundationReference.label}: {foundationReference.amount==null?'Not available':money(foundationReference.amount)}</small>
                      </div>
                      {jf("bond",<ReadField label="Bond" value={cognitoPayload?.contractsAndAdministration?.bond}/>)}
                      {jf("parcel",<ReadField label="Parcel" value={cognitoPayload?.contractsAndAdministration?.parcel}/>)}
                      <ReadField label="OH&P" value={cognitoPayload?.contractsAndAdministration?.ohp}/>
                      <ReadField label="Lender" value={cognitoPayload?.lenderInformation?.lender}/>
                      <ReadField label="Lender street" value={cognitoPayload?.lenderInformation?.lenderStreet}/>
                      <ReadField label="Lender city / state / ZIP" value={cognitoPayload?.lenderInformation?.lenderCityStateZip}/>
                    </div>
                  </ActiveProjectSection>}
                buildings={<ActiveProjectSection sectionId="buildings" kicker="BUILDINGS" title="Buildings" initiallyOpen>
                  {jf("buildingNames",<ProjectBuildingRows rows={cognitoPayload?.generalInformation?.buildingNames}/>)}
                </ActiveProjectSection>}/>

              <ActiveProjectSection sectionId="parties" kicker="PARTIES" title="Owner / Developer & General Contractor" className="bid-edit-section active-project-parties-section" initiallyOpen>
                <div className="active-project-parties-grid">
                  <div className="active-project-party-block"><h4>Owner / Developer</h4>
                    <div className="bid-edit-grid two-column">
                      {['ownerName','ownerEmail','ownerStreetAddress','ownerCityStateZip'].map(key=>jf(key,<ReadField key={key} label={key} value={cognitoPayload?.owner?.[key]}/>))}
                    </div>

                  </div>
                  <div className="active-project-party-block"><h4>General Contractor</h4>
                    <div className="design-team-person-card">
                      <ActiveProjectGcPicker value={displayGcName} options={gcOptions}
                        loading={gcOptionsLoading} error={gcOptionsError} disabled={!canInspectChoices||saving}
                        onChange={value=>managementPreview ? setGcPreviewName(value) : updateField('gc',value)}
                        onRetry={retryGcOptions} previewing={isGcPreview}/>
                      <DesignTeamContactDetails
                        contact={gcContact} showSource={false}/>
                      {isGcPreview && <div className="design-team-preview-warning" role="status">
                        <strong>Not saved · Preview only</strong>
                        <button type="button" className="secondary-button" onClick={()=>setGcPreviewName(null)}>Revert</button>
                      </div>}
                    </div>
                  </div>
                </div>
              </ActiveProjectSection>

              <ActiveProjectSection sectionId="design" kicker="DESIGN" title="Design Team" className="bid-edit-section active-project-design-section" initiallyOpen>
                {jis.detail?<div className="design-team-section"><div className="project-setup-design-grid">
                  {designContactCard('architectLookupId','Architect of record','architectEmail',['architectAddress'])}
                  {designContactCard('structuralEngineerLookupId','Structural engineer of record','structuralEngineerEmail',['structuralEngineerAddress'])}
                </div></div>:<ActiveProjectDesignTeam
                  key={jobListId}
                  architect={{id:cognitoPayload?.architectOfRecord?.aorName?.id,
                    label:cognitoPayload?.architectOfRecord?.aorName?.label,
                    email:cognitoPayload?.architectOfRecord?.aorEmail,
                    address:cognitoPayload?.architectOfRecord?.aorAddress}}
                  engineer={{id:cognitoPayload?.structuralEngineerOfRecord?.seorName?.id,
                    label:cognitoPayload?.structuralEngineerOfRecord?.seorName?.label,
                    email:cognitoPayload?.structuralEngineerOfRecord?.seorEmail,
                    address:cognitoPayload?.structuralEngineerOfRecord?.seorAddress}}
                  directory={designDirectory}
                  directoryLoading={designDirectoryLoading}
                  directoryError={designDirectoryError}
                  onRetry={() => setDesignDirectoryRetry(value => value + 1)}
                  editable={false}/>}
              </ActiveProjectSection>

              <div className="active-project-layout-pair active-project-teams-pair">
                <ActiveProjectSection sectionId="riggs" kicker="TEAM" title="Riggs Team" className="bid-edit-section" initiallyOpen>
                  <ActiveProjectOfficeTeam values={form} people={people} onChange={updateField}
                    disabled={!canEdit || saving}/>
                  {jf("surveyorITUserId",<ReadField label="Surveyor" value={cognitoPayload?.riggsStartup?.surveyor?.label}/>)}
                </ActiveProjectSection>
                <ActiveProjectSection sectionId="gc" kicker="TEAM" title="GC Team" className="bid-edit-section" initiallyOpen>
                  <ActiveProjectGcTeam pmName={form.gcpm}
                    superName={cognitoPayload?.gcSuperintendent?.gcSuperName||''}
                    pmReference={cognitoPayload?.gcProjectManagement||null}
                    onChange={updateField} disabled={!canEdit || saving}/>
                  {jis.detail&&<div className="bid-edit-grid two-column">{['gcPmOffice','gcPmMobile','gcPmEmail','gcSuperName','gcSuperMobile','gcSuperEmail'].map(key=>jf(key))}</div>}
                </ActiveProjectSection>
              </div>

              <ActiveProjectSection sectionId="fieldStaffing" kicker="TEAM" title="Field Team" initiallyOpen>
                <ProjectFieldTeam jobListId={jobListId} projectName={job.jobName}
                  anticipatedStart={job.anticipatedStartDate} duration={cognitoPayload?.riggsStartup?.estimatedDuration}
                  payload={staffingPayload} loading={staffingLoading} error={staffingError} onRetry={loadStaffing}
                  canInspect={canInspectChoices} blocked={saving}/>
              </ActiveProjectSection>
              <ActiveProjectSection sectionId="additionalMembers" kicker="TEAM" title="Additional Team" initiallyOpen>
                <ProjectTeamPopup projectName={job.jobName} internalAvailable={role==='ADMIN'&&canEdit}
                  canEdit={canEdit} blocked={saving} internalDirty={additionalDirty} externalDirty={externalDirty}
                  internalSaving={additionalSaving} externalSaving={externalSaving} onCombinedSavingChange={setTeamSaving}
                  internal={<ActiveProjectAdditionalMembers jobListId={jobListId} canEdit={role==='ADMIN'&&canEdit}
                    blocked={state.saving||metricsState.saving||combinedSaving||jis.busy||externalSaving}
                    onDirtyChange={setAdditionalDirty} onSavingChange={setAdditionalSaving} onSaved={()=>onSavedRef.current?.()}/>}
                  external={<ProjectExternalTeam jobListId={jobListId} canEdit={canEdit}
                    blocked={state.saving||metricsState.saving||combinedSaving||jis.busy||additionalSaving}
                    onDirtyChange={setExternalDirty} onSavingChange={setExternalSaving}/>}/>
              </ActiveProjectSection>

              <ActiveProjectSection sectionId="scope" kicker="SCOPE" title="Scope & Notes" className="bid-edit-section active-project-scope-section" initiallyOpen>
                {jis.detail?<div className="active-project-scope-grid"><div className="active-project-scope-column"><h4>Scope & requirements</h4>{jf("scope")}<div className="active-project-scope-flags">{jf("leed")}{jf("ndaRequired")}</div></div><div className="active-project-scope-column"><h4>Notes</h4>{jf("comments")}</div></div>:<div className="active-project-scope-grid">
                  <div className="active-project-scope-column"><h4>Scope & requirements</h4>
                    <div className="active-project-readonly-field"><span>Scope</span>
                      <strong>{cognitoPayload?.generalInformation?.scope||'—'}</strong></div>
                    <div className="active-project-scope-flags">
                      <div className="active-project-readonly-field"><span>LEED</span><strong>{cognitoPayload?.generalInformation?.leed===true?'Yes':cognitoPayload?.generalInformation?.leed===false?'No':'—'}</strong></div>
                      <div className="active-project-readonly-field"><span>NDA Required</span><strong>{cognitoPayload?.generalInformation?.ndaRequired===true?'Yes':cognitoPayload?.generalInformation?.ndaRequired===false?'No':'—'}</strong></div>
                    </div>
                  </div>
                  <div className="active-project-scope-column"><h4>Notes</h4>
                    <div className="active-project-readonly-field"><span>Project notes</span>
                      <strong>{cognitoPayload?.riggsStartup?.comments||'—'}</strong></div>
                  </div>
                </div>}
              </ActiveProjectSection>


              <div className="active-project-jis-reference">
                {referenceRefreshing && <p className="project-reference-refresh-note" role="status">Refreshing details…</p>}
                {jis.detail?<>
                  <ActiveProjectSection sectionId="suppliers" kicker="MATERIALS" title="Authorized Suppliers & Contracts" className="bid-edit-section">
                    <div className="m9b-supplier-grid"><div className="m9b-supplier-header"><strong>Category</strong><strong>Supplier</strong><strong>Amount</strong><strong>Contracts</strong></div>{SUPPLIERS.map(([key,label])=><div key={key} className="m9b-supplier-row"><strong>{label}</strong>{['Supplier','Amount','Files'].map(s=>jf(key+s,null,true))}</div>)}</div>
                  </ActiveProjectSection>
                  <div className="active-project-layout-pair active-project-reference-pair">
                    {['concrete','detailing'].map((id)=><ActiveProjectSection key={id} sectionId={id} kicker="PROJECT" title={{concrete:'Concrete & Mix Designs',detailing:'Detailing & Submittals'}[id]} className="bid-edit-section"><div className="bid-edit-grid two-column">{projectEditorSectionFields(jis.detail.fields,id).map(f=>jf(f.key))}</div></ActiveProjectSection>)}
                  </div>
                  <ActiveProjectSection sectionId="closeout" kicker="CLOSEOUT" title="Closeout" className="bid-edit-section">
                    <div className="bid-edit-grid two-column">{projectEditorSectionFields(jis.detail.fields,'closeout').filter(f=>f.lane!=='workflow').map(f=>jf(f.key))}</div>
                    <div className="information-sheet-subheading">Recorded closeout status · read-only</div>
                    <div className="project-information-grid">{projectEditorSectionFields(jis.detail.fields,'closeout').filter(f=>f.lane==='workflow').map(f=>jf(f.key))}</div>
                  </ActiveProjectSection>
                  <ActiveProjectSection sectionId="services" kicker="INFORMATION" title="Project Information" className="bid-edit-section" initiallyOpen><ProjectServiceBindings detail={jis.detail}/></ActiveProjectSection>
                </>:<ActiveProjectCognitoSections compact payload={cognitoPayload}
                  loading={cognitoLoading} error={cognitoError}
                  onRetry={() => loadCognitoDetail({fresh:true})} jobListId={jobListId}/>}
                {job.entryLink && <a className="active-project-source-link" href={job.entryLink}
                  target="_blank" rel="noreferrer">Open original Cognito entry ↗</a>}
              </div>
              </div>
            </>
          )}
    </FloatingEditorShell>
  );
}
