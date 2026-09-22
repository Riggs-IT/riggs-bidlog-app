import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import ActiveProjectCognitoSections from './ActiveProjectCognitoSections.jsx';
import BidLogGeneralContractorSelect from './BidLogGeneralContractorSelect.jsx';
import FloatingEditorShell from './FloatingEditorShell.jsx';
import ActionToast from './ActionToast.jsx';
import ActiveProjectGeneralEditor from './ActiveProjectGeneralEditor.jsx';
import ActiveProjectSaveReview from './ActiveProjectSaveReview.jsx';
import ActiveProjectStaffingOrganizer from './ActiveProjectStaffingOrganizer.jsx';
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


let cachedActiveProjectGcOptions = null;
let activeProjectGcOptionsRequest = null;


async function loadActiveProjectGcOptions({
  force = false,
} = {}) {
  if (force) {
    cachedActiveProjectGcOptions = null;
    activeProjectGcOptionsRequest = null;
  }

  if (cachedActiveProjectGcOptions) {
    return cachedActiveProjectGcOptions;
  }

  if (!activeProjectGcOptionsRequest) {
    activeProjectGcOptionsRequest = requestJson(
      '/api/bid-log/reference/general-contractors',
    )
      .then(result => {
        if (!Array.isArray(result?.items)) {
          throw new Error(
            'General contractor reference returned an invalid response.',
          );
        }

        cachedActiveProjectGcOptions = result.items;
        return cachedActiveProjectGcOptions;
      })
      .catch(error => {
        activeProjectGcOptionsRequest = null;
        throw error;
      });
  }

  return activeProjectGcOptionsRequest;
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


function ProjectRoleOptions({
  people,
  role,
  currentValue,
}) {
  const normalizedCurrent = String(currentValue || '');
  const eligible = people.filter(
    person => String(person?.projectRole || '').toUpperCase() === role,
  );
  const current = people.find(
    person => String(person?.sharePointId || '') === normalizedCurrent,
  );
  const currentIsEligible = eligible.some(
    person => String(person?.sharePointId || '') === normalizedCurrent,
  );

  return (
    <>
      {current && !currentIsEligible && normalizedCurrent && (
        <option value={normalizedCurrent} disabled>
          {current.displayName} (current)
        </option>
      )}
      {eligible.map(person => (
        <option
          key={person.sharePointId}
          value={person.sharePointId}
        >
          {person.displayName}
        </option>
      ))}
    </>
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
  const { editor, state, dirty: hasUnsavedChanges, needsReview } = useActiveProjectEditor(jobListId, canEdit);
  const payload = state.project.snapshot;
  const form = state.project.draft;
  const loading = state.project.loading && !payload;
  const loadError = !payload ? state.project.error : null;
  const saving = state.saving;
  const [cognitoPayload, setCognitoPayload] = useState(null);
  const [cognitoLoading, setCognitoLoading] = useState(true);
  const [cognitoError, setCognitoError] = useState(null);
  const [staffingPayload, setStaffingPayload] = useState(null);
  const [staffingLoading, setStaffingLoading] = useState(true);
  const [staffingError, setStaffingError] = useState(null);
  const [referenceRefreshing, setReferenceRefreshing] = useState(false);
  const referenceRequest = useRef(null);
  const staffingRequest = useRef(null);
  const referenceEpoch = useRef(0);
  const notifiedRevision = useRef(0);
  const footerRef = useRef(null);
  const [toastBottom, setToastBottom] = useState(140);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const [gcOptions, setGcOptions] = useState(
    cachedActiveProjectGcOptions || [],
  );
  const [gcOptionsLoading, setGcOptionsLoading] = useState(false);
  const [gcOptionsError, setGcOptionsError] = useState(null);

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

  const loadGcOptions = useCallback(
    async ({ force = false } = {}) => {
      if (!canEdit) {
        return;
      }

      setGcOptionsLoading(true);
      setGcOptionsError(null);

      try {
        const items = await loadActiveProjectGcOptions({ force });
        setGcOptions(items);
      } catch (error) {
        setGcOptionsError(
          error?.message
          || 'Unable to load the Potential GCs list.',
        );
      } finally {
        setGcOptionsLoading(false);
      }
    },
    [canEdit],
  );

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
      await loadCognitoDetail({ quiet: true });
      if (!cancelled && index + 1 < delays.length) {
        timers.push(window.setTimeout(() => { void run(index + 1); }, delays[index + 1]));
      }
    }
    // Bounded reads of read-only reference sections only. Editable drafts are never overwritten.
    timers.push(window.setTimeout(() => { void run(0); }, 0));
    return () => { cancelled = true; timers.forEach(window.clearTimeout); referenceRequest.current?.abort(); };
  }, [state.refreshKey, state.saving, loadCognitoDetail]);

  useEffect(
    () => {
      loadGcOptions();
    },
    [loadGcOptions],
  );

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
    if ((hasUnsavedChanges || needsReview) && !window.confirm('Leave this project and discard unsaved edits? Saved changes are not undone.')) return;
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
          ? 'COMPLETED PROJECT · EDIT PROJECT'
          : 'ACTIVE PROJECT · EDIT PROJECT'
      }
      title={job.jobNumber || 'Project'}
      subtitle={job.jobName || 'Loading project…'}
      backLabel="Back to Projects"
      onClose={requestClose}
      saving={saving}
      className="bid-log-edit-drawer active-project-edit-drawer"
      bodyClassName="bid-log-edit-body"
      footer={
        !loading && !loadError && payload && form ? (
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
              {!canEdit && (
                <div className="bid-edit-message">
                  Your role can view project details, but only Administrators can edit them.
                </div>
              )}

              <ActionToast message={state.notice?.message} type={state.notice?.type || 'success'} style={{ bottom: toastBottom }}
                onDismiss={editor.dismissNotice} />
              <ActiveProjectSaveReview state={state} editor={editor} />

              <section className="bid-edit-section">
                <div className="bid-edit-section-heading">
                  <div>
                    <span className="section-kicker">PROJECT</span>
                    <h3>Project Information</h3>
                  </div>
                </div>

                <div className="bid-edit-grid three-column">
                  <Field
                    label="Job Number"
                    hint="System-controlled and never editable from this app."
                  >
                    <input
                      type="text"
                      value={job.jobNumber || ''}
                      readOnly
                      className="bid-edit-readonly-input"
                    />
                  </Field>

                  <Field label="Project Name" wide>
                    <input
                      type="text"
                      value={form.jobName}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('jobName', event.target.value)}
                    />
                  </Field>

                  <Field label="Project Type">
                    <input
                      type="text"
                      list="active-project-type-options"
                      value={form.jobType}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('jobType', event.target.value)}
                    />
                    <datalist id="active-project-type-options">
                      {jobTypes.map(value => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </Field>

                  <Field label="Purpose">
                    <input
                      type="text"
                      list="active-project-purpose-options"
                      value={form.purpose}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('purpose', event.target.value)}
                    />
                    <datalist id="active-project-purpose-options">
                      {purposes.map(value => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </Field>

                  <Field label="Retention">
                    <input
                      type="text"
                      value={form.retention}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('retention', event.target.value)}
                    />
                  </Field>

                  <Field label="Anticipated Start">
                    <input
                      type="date"
                      value={form.anticipatedStartDate}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('anticipatedStartDate', event.target.value)}
                    />
                  </Field>
                </div>
              </section>

              <section className="bid-edit-section">
                <div className="bid-edit-section-heading">
                  <div>
                    <span className="section-kicker">CUSTOMER</span>
                    <h3>GC & Location</h3>
                  </div>
                </div>

                <div className="bid-edit-grid two-column">
                  <Field
                    label="General Contractor"
                    hint="Choose from the Potential GCs directory."
                  >
                    <BidLogGeneralContractorSelect
                      value={form.gc ? [form.gc] : []}
                      options={gcOptions}
                      loading={gcOptionsLoading}
                      error={gcOptionsError}
                      disabled={!canEdit || saving}
                      multiple={false}
                      onChange={values => updateField(
                        'gc',
                        values.at(-1) || '',
                      )}
                      onRetry={() => loadGcOptions({ force: true })}
                    />
                  </Field>

                  <Field label="GC Project Manager">
                    <input
                      type="text"
                      value={form.gcpm}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('gcpm', event.target.value)}
                    />
                  </Field>

                  <Field label="Street Address" wide>
                    <input
                      type="text"
                      value={form.streetAddress}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('streetAddress', event.target.value)}
                    />
                  </Field>

                  <Field label="City / State / ZIP" wide>
                    <input
                      type="text"
                      value={form.cityStateZip}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('cityStateZip', event.target.value)}
                    />
                  </Field>
                </div>
              </section>

              <section className="bid-edit-section">
                <div className="bid-edit-section-heading">
                  <div>
                    <span className="section-kicker">TEAM</span>
                    <h3>Riggs Project Team</h3>
                  </div>
                  <small>Active Cognito IT Users</small>
                </div>

                <div className="bid-edit-grid three-column project-team-office-grid">
                  <Field label="Project Manager">
                    <select
                      value={form.pmITUserId}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('pmITUserId', event.target.value)}
                    >
                      <option value="">Unassigned</option>
                      <ProjectRoleOptions
                        people={people}
                        role="PM"
                        currentValue={form.pmITUserId}
                      />
                    </select>
                  </Field>

                  <Field label="Assistant PM">
                    <select
                      value={form.apmITUserId}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('apmITUserId', event.target.value)}
                    >
                      <option value="">Unassigned</option>
                      <ProjectRoleOptions
                        people={people}
                        role="APM"
                        currentValue={form.apmITUserId}
                      />
                    </select>
                  </Field>

                  <Field label="Project Engineer">
                    <select
                      value={form.peITUserId}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('peITUserId', event.target.value)}
                    >
                      <option value="">Unassigned</option>
                      <ProjectRoleOptions
                        people={people}
                        role="PE"
                        currentValue={form.peITUserId}
                      />
                    </select>
                  </Field>

                </div>

                <ActiveProjectStaffingOrganizer
                  payload={staffingPayload}
                  loading={staffingLoading}
                  error={staffingError}
                  onRetry={loadStaffing}
                  people={people}
                  canEdit={canEdit}
                  blocked={saving}
                  previewMode
                />
              </section>

              <section className="bid-edit-section">
                <div className="bid-edit-section-heading">
                  <div>
                    <span className="section-kicker">SCHEDULE</span>
                    <h3>Operations Schedule</h3>
                  </div>
                </div>

                <div className="active-project-schedule-callout">
                  <div>
                    <span>Planned Duration</span>
                    <strong>
                      {duration
                        ? `${duration} days`
                        : 'Not scheduled'}
                    </strong>
                  </div>
                  <small>
                    Planned dates remain the Operations scheduling window.
                  </small>
                </div>

                <div className="bid-edit-grid two-column">
                  <Field label="Planned Start">
                    <input
                      type="date"
                      value={form.plannedStartDate}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('plannedStartDate', event.target.value)}
                    />
                  </Field>

                  <Field label="Planned End">
                    <input
                      type="date"
                      value={form.plannedEndDate}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('plannedEndDate', event.target.value)}
                    />
                  </Field>

                  <Field label="Schedule Notes" wide>
                    <textarea
                      rows="5"
                      value={form.scheduleNotes}
                      disabled={!canEdit || saving}
                      onChange={event => updateField('scheduleNotes', event.target.value)}
                    />
                  </Field>
                </div>
              </section>

              {Number(jobListId) === 24 && <ActiveProjectGeneralEditor
                section={state.general} canEdit={canEdit} blocked={saving}
                onEdit={(field, value) => editor.edit('general', field, value)}
                onRetry={() => editor.load('general')} />}
              {referenceRefreshing && <p className="project-reference-refresh-note" role="status">Updating reference information…</p>}
              <ActiveProjectCognitoSections
                payload={cognitoPayload}
                loading={cognitoLoading}
                error={cognitoError}
                onRetry={() => loadCognitoDetail()}
                jobListId={jobListId}
              />

              <section className="bid-edit-section active-project-reference-section">
                <div className="bid-edit-section-heading">
                  <div>
                    <span className="section-kicker">REFERENCE</span>
                    <h3>Project Reference</h3>
                  </div>
                  <small>Read-only system values</small>
                </div>

                <dl className="active-project-reference-grid">
                  <div>
                    <dt>Contract</dt>
                    <dd>{money(job.contractAmount)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{job.projectCompleted ? 'Completed' : 'Active'}</dd>
                  </div>
                  <div>
                    <dt>Control Project</dt>
                    <dd>{job.controlProjectName || '—'}</dd>
                  </div>
                  <div>
                    <dt>Dropbox Folder</dt>
                    <dd>{job.dropboxFolder || '—'}</dd>
                  </div>
                </dl>

                {job.entryLink && (
                  <a
                    className="active-project-source-link"
                    href={job.entryLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open original Cognito entry ↗
                  </a>
                )}
              </section>
            </>
          )}
    </FloatingEditorShell>
  );
}
