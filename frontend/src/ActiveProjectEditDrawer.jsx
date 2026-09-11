import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import ActiveProjectCognitoSections from './ActiveProjectCognitoSections.jsx';
import BidLogGeneralContractorSelect from './BidLogGeneralContractorSelect.jsx';
import FloatingEditorShell from './FloatingEditorShell.jsx';
import ActionToast from './ActionToast.jsx';


function dateValue(value) {
  if (!value) {
    return '';
  }

  return String(value).slice(0, 10);
}


function initialForm(payload) {
  const job = payload?.job || {};

  return {
    jobName: job.jobName || '',
    jobType: job.jobType || '',
    purpose: job.purpose || '',
    retention: job.retention || '',
    streetAddress: job.streetAddress || '',
    cityStateZip: job.cityStateZip || '',
    gc: job.gc || '',
    gcpm: job.gcpm || '',
    pmITUserId: job.pmITUserId ?? '',
    apmITUserId: job.apmITUserId ?? '',
    peITUserId: job.peITUserId ?? '',
    anticipatedStartDate: dateValue(job.anticipatedStartDate),
    plannedStartDate: dateValue(job.plannedStartDate),
    plannedEndDate: dateValue(job.plannedEndDate),
    scheduleNotes: job.scheduleNotes || '',
  };
}


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
  const [payload, setPayload] = useState(null);
  const [cognitoPayload, setCognitoPayload] = useState(null);
  const [cognitoLoading, setCognitoLoading] = useState(true);
  const [cognitoError, setCognitoError] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const [gcOptions, setGcOptions] = useState(
    cachedActiveProjectGcOptions || [],
  );
  const [gcOptionsLoading, setGcOptionsLoading] = useState(false);
  const [gcOptionsError, setGcOptionsError] = useState(null);

  const role = String(
    user?.appRole || '',
  ).toUpperCase();

  const canEdit =
    role === 'ADMIN'
    || role === 'OPERATIONS';

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

  const loadDetail = useCallback(
    async () => {
      if (!jobListId) {
        return;
      }

      setLoading(true);
      setLoadError(null);
      setSaveError(null);
      setSaveMessage(null);

      try {
        const nextPayload = await requestJson(
          `/api/active-projects/${jobListId}`,
        );

        setPayload(nextPayload);
        setForm(initialForm(nextPayload));
      } catch (error) {
        setLoadError(
          error?.message
          || 'Unable to load this active project.',
        );
      } finally {
        setLoading(false);
      }
    },
    [jobListId],
  );

  useEffect(
    () => {
      loadDetail();
    },
    [loadDetail],
  );

  const loadCognitoDetail = useCallback(
    async () => {
      if (!jobListId) {
        return;
      }

      setCognitoLoading(true);
      setCognitoError(null);

      try {
        const nextPayload = await requestJson(
          `/api/active-projects/${jobListId}/cognito-detail`,
        );

        setCognitoPayload(nextPayload);
      } catch (error) {
        setCognitoError(
          error?.message
          || 'Unable to load the Cognito Job Information Sheet.',
        );
      } finally {
        setCognitoLoading(false);
      }
    },
    [jobListId],
  );

  useEffect(
    () => {
      loadCognitoDetail();
    },
    [loadCognitoDetail],
  );

  useEffect(
    () => {
      loadGcOptions();
    },
    [loadGcOptions],
  );

  function updateField(name, value) {
    setForm(
      current => ({
        ...current,
        [name]: value,
      }),
    );
    setSaveError(null);
    setSaveMessage(null);
  }

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

  const hasUnsavedChanges = useMemo(
    () => {
      if (!form || !payload) {
        return false;
      }

      return JSON.stringify(form) !== JSON.stringify(initialForm(payload));
    },
    [form, payload],
  );

  function requestClose() {
    if (saving) {
      return;
    }

    if (
      hasUnsavedChanges
      && !window.confirm(
        'Discard unsaved project changes and return to Active Projects?',
      )
    ) {
      return;
    }

    onClose();
  }

  async function save() {
    if (!form || !canEdit || saving) {
      return;
    }

    if (
      form.plannedStartDate
      && form.plannedEndDate
      && form.plannedEndDate < form.plannedStartDate
    ) {
      setSaveError(
        'Planned end date cannot be before planned start date.',
      );
      return;
    }

    const body = {
      jobName: form.jobName,
      jobType: form.jobType,
      purpose: form.purpose,
      retention: form.retention,
      streetAddress: form.streetAddress,
      cityStateZip: form.cityStateZip,
      gc: form.gc,
      gcpm: form.gcpm,
      pmITUserId:
        form.pmITUserId === ''
          ? null
          : Number(form.pmITUserId),
      apmITUserId:
        form.apmITUserId === ''
          ? null
          : Number(form.apmITUserId),
      peITUserId:
        form.peITUserId === ''
          ? null
          : Number(form.peITUserId),
      anticipatedStartDate:
        form.anticipatedStartDate || null,
      plannedStartDate:
        form.plannedStartDate || null,
      plannedEndDate:
        form.plannedEndDate || null,
      scheduleNotes: form.scheduleNotes,
    };

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      await requestJson(
        `/api/active-projects/${jobListId}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
      );

      await loadDetail();
      setSaveMessage(
        'Project saved. SharePoint and Cognito sync queued.',
      );
      await onSaved?.();
    } catch (error) {
      setSaveError(
        error?.message
        || 'Unable to save this project.',
      );
    } finally {
      setSaving(false);
    }
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
          <footer className="bid-log-edit-footer floating-editor-footer">
            <div className="floating-editor-footer-status">
              <small>
                Existing project fields use the current Riggs update workflow. Cognito-backed sections will use the direct Cognito path as they are added.
              </small>
              {hasUnsavedChanges && (
                <span className="floating-editor-dirty-indicator">
                  Unsaved changes
                </span>
              )}
            </div>

            <div className="bid-log-edit-footer-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={requestClose}
                disabled={saving}
              >
                Back to Projects
              </button>

              <button
                type="button"
                className="bid-log-save-button"
                onClick={save}
                disabled={!canEdit || saving || !hasUnsavedChanges}
              >
                {saving ? 'Saving…' : 'Save Project'}
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
                  Your role can view project details, but only Administrators and Operations can edit them.
                </div>
              )}

              <ActionToast
                message={saveError || saveMessage}
                type={saveError ? 'error' : 'success'}
                onDismiss={() => {
                  setSaveError(null);
                  setSaveMessage(null);
                }}
              />

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
                      disabled={!canEdit}
                      onChange={event => updateField('jobName', event.target.value)}
                    />
                  </Field>

                  <Field label="Project Type">
                    <input
                      type="text"
                      list="active-project-type-options"
                      value={form.jobType}
                      disabled={!canEdit}
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
                      disabled={!canEdit}
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
                      disabled={!canEdit}
                      onChange={event => updateField('retention', event.target.value)}
                    />
                  </Field>

                  <Field label="Anticipated Start">
                    <input
                      type="date"
                      value={form.anticipatedStartDate}
                      disabled={!canEdit}
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
                      disabled={!canEdit}
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
                      disabled={!canEdit}
                      onChange={event => updateField('gcpm', event.target.value)}
                    />
                  </Field>

                  <Field label="Street Address" wide>
                    <input
                      type="text"
                      value={form.streetAddress}
                      disabled={!canEdit}
                      onChange={event => updateField('streetAddress', event.target.value)}
                    />
                  </Field>

                  <Field label="City / State / ZIP" wide>
                    <input
                      type="text"
                      value={form.cityStateZip}
                      disabled={!canEdit}
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

                <div className="bid-edit-grid three-column">
                  <Field label="Project Manager">
                    <select
                      value={form.pmITUserId}
                      disabled={!canEdit}
                      onChange={event => updateField('pmITUserId', event.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {people.map(person => (
                        <option
                          key={person.sharePointId}
                          value={person.sharePointId}
                        >
                          {person.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Assistant PM">
                    <select
                      value={form.apmITUserId}
                      disabled={!canEdit}
                      onChange={event => updateField('apmITUserId', event.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {people.map(person => (
                        <option
                          key={person.sharePointId}
                          value={person.sharePointId}
                        >
                          {person.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Project Engineer">
                    <select
                      value={form.peITUserId}
                      disabled={!canEdit}
                      onChange={event => updateField('peITUserId', event.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {people.map(person => (
                        <option
                          key={person.sharePointId}
                          value={person.sharePointId}
                        >
                          {person.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="Superintendent"
                    wide
                    hint="Superintendent staffing stays managed through the Operations staffing workflow."
                  >
                    <div className="active-project-readonly-value">
                      {projectSummary?.superintendent || 'Unassigned'}
                    </div>
                  </Field>
                </div>
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
                      disabled={!canEdit}
                      onChange={event => updateField('plannedStartDate', event.target.value)}
                    />
                  </Field>

                  <Field label="Planned End">
                    <input
                      type="date"
                      value={form.plannedEndDate}
                      disabled={!canEdit}
                      onChange={event => updateField('plannedEndDate', event.target.value)}
                    />
                  </Field>

                  <Field label="Schedule Notes" wide>
                    <textarea
                      rows="5"
                      value={form.scheduleNotes}
                      disabled={!canEdit}
                      onChange={event => updateField('scheduleNotes', event.target.value)}
                    />
                  </Field>
                </div>
              </section>

              <ActiveProjectCognitoSections
                payload={cognitoPayload}
                loading={cognitoLoading}
                error={cognitoError}
                onRetry={loadCognitoDetail}
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
