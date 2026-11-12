import {notifyWriteAuthFailure} from './writeAuthRecovery.mjs';
import useGcReference from './useGcReference.js';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import ActiveProjectCognitoSections from './ActiveProjectCognitoSections.jsx';
import ActiveProjectDesignTeam from './ActiveProjectDesignTeam.jsx';
import {validateForm206Directory} from './projectSetupAuthoring.mjs';
import FloatingEditorShell from './FloatingEditorShell.jsx';
import ActionToast from './ActionToast.jsx';
import ActiveProjectGeneralEditor from './ActiveProjectGeneralEditor.jsx';
import ActiveProjectSaveReview from './ActiveProjectSaveReview.jsx';
import ActiveProjectStaffingOrganizer from './ActiveProjectStaffingOrganizer.jsx';
import ActiveProjectAdditionalMembers from './ActiveProjectAdditionalMembers.jsx';
import {ActiveProjectOfficeTeam,ActiveProjectGcTeam,ActiveProjectGcPicker} from './ActiveProjectTeamSections.jsx';
import useActiveProjectEditor from './useActiveProjectEditor.js';


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
      'Active Project updates are currently restricted to a test project.',
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


function plannedDuration(startValue, endValue) {
  if (!startValue || !endValue) {
    return null;
  }

  const start = new Date(`${startValue}T12:00:00`);
  const end = new Date(`${endValue}T12:00:00`);

  if (
    Number.isNaN(start.getTime())
    || Number.isNaN(end.getTime())
    || end < start
  ) {
    return null;
  }

  return Math.round(
    (end.getTime() - start.getTime())
    / 86400000,
  ) + 1;
}


export default function ActiveProjectEditDrawer({
  jobListId,
  projectSummary = null,
  user,
  onClose,
  onSaved,
}) {
  const role = String(user?.appRole || '').toUpperCase();
  const canEdit = role === 'ADMIN';
  const managementPreview = role === 'MANAGEMENT_ADMIN';
  const { items: gcOptions, loading: gcOptionsLoading, error: gcOptionsError, refresh: retryGcOptions } = useGcReference(canEdit);
  const { editor, state, dirty: hasUnsavedChanges, needsReview } = useActiveProjectEditor(jobListId, canEdit);
  const payload = state.project.snapshot;
  const form = state.project.draft;
  const loading = state.project.loading && !payload;
  const loadError = !payload ? state.project.error : null;
  const saving = state.saving;
  const [cognitoPayload, setCognitoPayload] = useState(null);
  const [cognitoLoading, setCognitoLoading] = useState(true);
  const [cognitoError, setCognitoError] = useState(null);
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

  const loadCognitoDetail = useCallback(async ({ quiet = false } = {}) => {
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
      const result = await requestJson(`/api/active-projects/${jobListId}/cognito-detail`, {
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

  useEffect(() => {
    if (!canEdit || !jobListId) {
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
  }, [canEdit, jobListId, designDirectoryRetry]);

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

  const writeStaffing = useCallback(
    async ({
      method,
      path,
      payload: writePayload,
    }) => {
      if (!jobListId) {
        throw new Error(
          'Active Project identity is missing.',
        );
      }

      const result = await requestJson(
        `/api/active-projects/${jobListId}${path}`,
        {
          method,
          ...(writePayload === undefined
            ? {}
            : {
                body: JSON.stringify(writePayload),
              }),
        },
      );

      await loadStaffing();

      Promise.resolve()
        .then(() => onSavedRef.current?.())
        .catch(() => {});

      return result;
    },
    [jobListId, loadStaffing],
  );

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
      await loadCognitoDetail({ quiet: true });
      if (!cancelled && index + 1 < delays.length) {
        timers.push(window.setTimeout(() => { void run(index + 1); }, delays[index + 1]));
      }
    }
    // Bounded reads of read-only reference sections only. Editable drafts are never overwritten.
    timers.push(window.setTimeout(() => { void run(0); }, 0));
    return () => { cancelled = true; timers.forEach(window.clearTimeout); referenceRequest.current?.abort(); };
  }, [state.refreshKey, state.saving, loadCognitoDetail]);


  function updateField(name, value) { editor.edit('project', name, value); }
  const loadDetail = () => editor.load('project');

  const duration = useMemo(
    () => (
      form
        ? plannedDuration(
            form.plannedStartDate,
            form.plannedEndDate,
          )
        : null
    ),
    [form],
  );

  function requestClose() {
    if (saving) return;
    if ((hasUnsavedChanges || needsReview || additionalDirty) && !window.confirm('Leave this project and discard unsaved edits? Saved changes are not undone.')) return;
    onClose();
  }

  function discardChanges() {
    if (saving) return;
    if (!window.confirm('Discard all unsaved edits? Changes that already saved will stay saved.')) return;
    editor.discard();
  }

  if (!jobListId) {
    return null;
  }

  const job = payload?.job || {};
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

  return (
    <FloatingEditorShell
      eyebrow={
        job.projectCompleted || projectSummary?.projectCompleted
          ? (canEdit ? 'COMPLETED PROJECT · EDIT PROJECT' : 'COMPLETED PROJECT · VIEW PROJECT')
          : (canEdit ? 'ACTIVE PROJECT · EDIT PROJECT' : 'ACTIVE PROJECT · VIEW PROJECT')
      }
      title={job.jobName || projectSummary?.jobName || 'Loading project…'}
      subtitle={job.jobNumber ? `Job #${job.jobNumber}` : 'Job number unavailable'}
      backLabel="Back to Projects"
      onClose={requestClose}
      saving={saving}
      className={`bid-log-edit-drawer active-project-edit-drawer${managementPreview ? ' management-admin-project-drawer' : ''}`}
      bodyClassName="bid-log-edit-body"
      scrollSurface
      footer={
        canEdit && !loading && !loadError && payload && form ? (
          <footer ref={footerRef} className="bid-log-edit-footer floating-editor-footer">
            <div className="floating-editor-footer-status">
              <small>
                {saving ? state.phase : needsReview ? 'Review the highlighted changes before saving.'
                  : hasUnsavedChanges ? 'Your project edits will be saved together.' : 'No unsaved changes.'}
              </small>
              {hasUnsavedChanges && (
                <span className="floating-editor-dirty-indicator">
                  Unsaved changes
                </span>
              )}
            </div>

            <div className="bid-log-edit-footer-actions">
              <button type="button" className="secondary-button" onClick={discardChanges}
                disabled={saving || (!hasUnsavedChanges && !state.conflicts.length)}>
                Discard Changes
              </button>
              <button type="button" className="bid-log-save-button" onClick={() => editor.save()}
                disabled={!canEdit || saving || needsReview || !hasUnsavedChanges || state.project.loading || state.general.loading}>
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
                  <strong>UNDER DEVELOPMENT · VIEW ONLY</strong>
                  <span>Project editing is not available in this preview. For job information, including anticipated start and estimated duration, use Cognito’s Job Information Sheet. The Operations Schedule controls here are not the approved workflow.</span>
                </div>
              ) : !canEdit ? (
                <div className="bid-edit-message">
                  Your role can view project details, but only Administrators can edit them.
                </div>
              ) : null}

              <ActionToast message={state.notice?.message} type={state.notice?.type || 'success'} style={{ bottom: toastBottom }}
                onDismiss={editor.dismissNotice} />
              <ActiveProjectSaveReview state={state} editor={editor} />

              <div className="active-project-layout-pair">
                <section className="bid-edit-section">
                  <div className="bid-edit-section-heading"><div><span className="section-kicker">PROJECT</span><h3>Project basics</h3></div></div>
                  <div className="bid-edit-grid active-project-core-grid">
                    <Field label="Project Name"><input type="text" value={form.jobName}
                      disabled={!canEdit || saving} onChange={event=>updateField('jobName',event.target.value)}/></Field>
                    <Field label="Project Type"><input type="text" list="active-project-type-options" value={form.jobType}
                      disabled={!canEdit || saving} onChange={event=>updateField('jobType',event.target.value)}/>
                      <datalist id="active-project-type-options">{jobTypes.map(value=><option key={value} value={value}/>)}</datalist></Field>
                    <Field label="Purpose"><input type="text" list="active-project-purpose-options" value={form.purpose}
                      disabled={!canEdit || saving} onChange={event=>updateField('purpose',event.target.value)}/>
                      <datalist id="active-project-purpose-options">{purposes.map(value=><option key={value} value={value}/>)}</datalist></Field>
                  </div>
                  <details className="active-project-secondary-details">
                    <summary>Additional project details</summary>
                    <div className="bid-edit-grid two-column">
                      <Field label="Retention"><input type="text" value={form.retention}
                        disabled={!canEdit || saving} onChange={event=>updateField('retention',event.target.value)}/></Field>
                      <div className="active-project-readonly-field"><span>Contract (Foundation reference)</span><strong>{money(job.contractAmount)}</strong></div>
                    </div>
                  </details>
                </section>
                <section className="bid-edit-section">
                  <div className="bid-edit-section-heading"><div><span className="section-kicker">LOCATION</span><h3>Location & schedule</h3></div></div>
                  <div className="bid-edit-grid active-project-location-grid">
                    <Field label="Street Address"><input type="text" value={form.streetAddress}
                      disabled={!canEdit || saving} onChange={event=>updateField('streetAddress',event.target.value)}/></Field>
                    <Field label="City / State / ZIP"><input type="text" value={form.cityStateZip}
                      disabled={!canEdit || saving} onChange={event=>updateField('cityStateZip',event.target.value)}/></Field>
                    <Field label="Anticipated Start"><input type="date" value={form.anticipatedStartDate}
                      disabled={!canEdit || saving} onChange={event=>updateField('anticipatedStartDate',event.target.value)}/></Field>
                    <Field label="Planned Start"><input type="date" value={form.plannedStartDate}
                      disabled={!canEdit || saving} onChange={event=>updateField('plannedStartDate',event.target.value)}/></Field>
                    <Field label="Planned End"><input type="date" value={form.plannedEndDate}
                      disabled={!canEdit || saving} onChange={event=>updateField('plannedEndDate',event.target.value)}/></Field>
                    <div className="active-project-readonly-field"><span>Planned duration</span><strong>{duration?`${duration} days`:'Not scheduled'}</strong></div>
                  </div>
                  <details className="active-project-secondary-details"><summary>Schedule notes</summary>
                    <Field label="Schedule Notes" wide><textarea rows="3" value={form.scheduleNotes}
                      disabled={!canEdit || saving} onChange={event=>updateField('scheduleNotes',event.target.value)}/></Field>
                  </details>
                </section>
              </div>

              <section className="bid-edit-section active-project-parties-section">
                <div className="bid-edit-section-heading"><div><span className="section-kicker">PARTIES</span><h3>Owner / Developer & General Contractor</h3></div></div>
                <div className="active-project-parties-grid">
                  <div className="active-project-party-block"><h4>Owner / Developer</h4>
                    <div className="active-project-readonly-grid">
                      <div className="active-project-readonly-field"><span>Name</span><strong>{cognitoPayload?.owner?.ownerName||'—'}</strong></div>
                      <div className="active-project-readonly-field"><span>Email</span><strong>{cognitoPayload?.owner?.ownerEmail||'—'}</strong></div>
                      <div className="active-project-readonly-field"><span>Street Address</span><strong>{cognitoPayload?.owner?.ownerStreetAddress||'—'}</strong></div>
                      <div className="active-project-readonly-field"><span>City / State / ZIP</span><strong>{cognitoPayload?.owner?.ownerCityStateZip||'—'}</strong></div>
                    </div>
                    <small className="setup-team-empty">Cognito reference · Accounting ownership pending</small>
                  </div>
                  <div className="active-project-party-block"><h4>General Contractor</h4>
                    <div className="bid-edit-grid active-project-gc-fields">
                      <ActiveProjectGcPicker value={form.gc||''} options={gcOptions}
                        loading={gcOptionsLoading} error={gcOptionsError} disabled={!canEdit||saving}
                        onChange={value=>updateField('gc',value)} onRetry={retryGcOptions}/>
                      <div className="active-project-readonly-field"><span>GC Email</span><strong>{cognitoPayload?.generalContractor?.gcEmail||'—'}</strong></div>
                      <div className="active-project-readonly-field"><span>GC Address</span><strong>{cognitoPayload?.generalContractor?.gcStreetAddress||'—'}</strong></div>
                      <div className="active-project-readonly-field"><span>GC City / State / ZIP</span><strong>{cognitoPayload?.generalContractor?.gcCityStateZip||'—'}</strong></div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="bid-edit-section active-project-design-section">
                <div className="bid-edit-section-heading"><div><span className="section-kicker">DESIGN</span><h3>Design Team</h3></div></div>
                <ActiveProjectDesignTeam
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
                  editable={canEdit && !saving}/>
              </section>

              <div className="active-project-layout-pair active-project-teams-pair">
                <section className="bid-edit-section">
                  <div className="bid-edit-section-heading"><div><span className="section-kicker">TEAM</span><h3>Riggs Team</h3></div></div>
                  <ActiveProjectOfficeTeam values={form} people={people} onChange={updateField}
                    disabled={!canEdit || saving}/>
                  {!!staffingPayload?.activeAssignments?.length && <div className="active-project-field-summary">
                    <strong>Current field team</strong>
                    <div className="setup-team-chips">
                      {staffingPayload.activeAssignments.map(row => <span className="setup-team-readonly-chip" key={row.assignmentId || `${row.employeeEid}-${row.assignmentRole}`}>
                        <span className="setup-team-chip-info"><strong>{row.employeeName || `EID ${row.employeeEid}`}</strong>
                          <small>{row.assignmentRole==='SUPER'?'Superintendent':'Foreman'} · Operations</small></span>
                      </span>)}
                    </div>
                  </div>}
                  <details className="active-project-secondary-details active-project-field-team-details">
                    <summary>Field staffing & Additional Members · separate save controls</summary>
                    <ActiveProjectStaffingOrganizer
                      payload={staffingPayload} loading={staffingLoading} error={staffingError}
                      onRetry={loadStaffing} onWrite={writeStaffing} people={people}
                      canEdit={canEdit} blocked={saving} writeEnabled={Number(jobListId) === 24}/>
                    <ActiveProjectAdditionalMembers jobListId={jobListId} canEdit={canEdit} blocked={saving}
                      onDirtyChange={setAdditionalDirty} onSaved={()=>onSavedRef.current?.()}/>
                  </details>
                </section>
                <section className="bid-edit-section">
                  <div className="bid-edit-section-heading"><div><span className="section-kicker">TEAM</span><h3>GC Team</h3></div></div>
                  <ActiveProjectGcTeam pmName={form.gcpm}
                    superName={cognitoPayload?.gcSuperintendent?.gcSuperName||''}
                    pmReference={cognitoPayload?.gcProjectManagement||null}
                    onChange={updateField} disabled={!canEdit || saving}/>
                </section>
              </div>

              <section className="bid-edit-section active-project-scope-section">
                <div className="bid-edit-section-heading"><div><span className="section-kicker">SCOPE</span><h3>Scope & Notes</h3></div></div>
                <div className="active-project-scope-grid">
                  <div className="active-project-scope-column"><h4>Scope & requirements</h4>
                    <div className="active-project-readonly-field"><span>Scope · Cognito reference</span>
                      <strong>{cognitoPayload?.generalInformation?.scope||'—'}</strong></div>
                    <div className="active-project-scope-flags">
                      <div className="active-project-readonly-field"><span>LEED</span><strong>{cognitoPayload?.generalInformation?.leed===true?'Yes':cognitoPayload?.generalInformation?.leed===false?'No':'—'}</strong></div>
                      <div className="active-project-readonly-field"><span>NDA Required</span><strong>{cognitoPayload?.generalInformation?.ndaRequired===true?'Yes':cognitoPayload?.generalInformation?.ndaRequired===false?'No':'—'}</strong></div>
                    </div>
                  </div>
                  <div className="active-project-scope-column"><h4>Notes</h4>
                    <div className="active-project-readonly-field"><span>JIS comments · Cognito reference</span>
                      <strong>{cognitoPayload?.riggsStartup?.comments||'—'}</strong></div>
                  </div>
                </div>
              </section>

              {Number(jobListId) === 24 && <ActiveProjectGeneralEditor
                section={state.general} canEdit={canEdit} blocked={saving}
                onEdit={(field, value) => editor.edit('general', field, value)}
                onRetry={() => editor.load('general')} />}
              <details className="active-project-full-reference">
                <summary>Additional JIS details · design, suppliers, detailing & closeout</summary>
                {referenceRefreshing && <p className="project-reference-refresh-note" role="status">Updating reference information…</p>}
                <ActiveProjectCognitoSections compact payload={cognitoPayload}
                  loading={cognitoLoading} error={cognitoError}
                  onRetry={() => loadCognitoDetail()} jobListId={jobListId}/>
                {job.entryLink && <a className="active-project-source-link" href={job.entryLink}
                  target="_blank" rel="noreferrer">Open original Cognito entry ↗</a>}
              </details>
            </>
          )}
    </FloatingEditorShell>
  );
}
