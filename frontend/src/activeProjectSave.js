/** One project draft, existing domain endpoints. No write retries or fake transaction.
 * Fresh-read comparison narrows stale overwrites but is NOT atomic concurrency.
 * The server's permissions, canary gate and SQL/outbox ownership remain authority.
 */
import { generalDraft, generalChanges, validateGeneralChanges, generalErrorMessage } from './activeProjectGeneral.js';

export const PROJECT_FIELDS = {
  jobName: 'Project Name', jobType: 'Project Type', purpose: 'Purpose', retention: 'Retention',
  streetAddress: 'Street Address', cityStateZip: 'City / State / ZIP', gc: 'General Contractor',
  gcpm: 'GC Project Manager', pmITUserId: 'Project Manager', apmITUserId: 'Assistant PM',
  peITUserId: 'Project Engineer', anticipatedStartDate: 'Anticipated Start',
  plannedStartDate: 'Planned Start', plannedEndDate: 'Planned End', scheduleNotes: 'Schedule Notes',
};
export const GENERAL_FIELDS = {
  scope: 'Scope', leed: 'LEED', ndaRequired: 'NDA Required',
  numberOfBuildings: 'Number of Buildings', buildingNames: 'Building Names',
};
const IDS = ['pmITUserId', 'apmITUserId', 'peITUserId'];
const DATES = ['anticipatedStartDate', 'plannedStartDate', 'plannedEndDate'];
const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sectionName = section => section === 'project' ? 'Project details' : 'General Information';

export function projectDraft(payload) {
  const job = payload?.job || {};
  return Object.fromEntries(Object.keys(PROJECT_FIELDS).map(key => [key,
    DATES.includes(key) ? String(job[key] || '').slice(0, 10) : String(job[key] ?? ''),
  ]));
}
export function projectBody(draft) {
  return Object.fromEntries(Object.keys(PROJECT_FIELDS).map(key => [key,
    IDS.includes(key) ? (draft[key] === '' ? null : Number(draft[key])) : (draft[key].trim() || null),
  ]));
}
export function changedFields(section, base, draft) {
  if (!base || !draft) return [];
  const a = section === 'project' ? projectBody(base) : base;
  const b = section === 'project' ? projectBody(draft) : draft;
  return Object.keys(a).filter(key => !equal(a[key], b[key]));
}
export function draftFieldMatches(section, field, expected, actual) {
  if (section === 'project') return String(expected ?? '').trim() === String(actual ?? '').trim();
  if (field === 'numberOfBuildings') return expected === actual || (expected !== '' && actual !== '' && Number(expected) === Number(actual));
  // An acknowledged/uncertain create may have acquired provider-assigned IDs.
  if (field === 'buildingNames') return expected.length === actual.length && expected.every((row, i) =>
    row.name === actual[i].name && (row.id === null || row.id === actual[i].id));
  return equal(expected, actual);
}
export function mergeDraft(section, base, draft, latest, forceReview = []) {
  const merged = clone(latest);
  const conflicts = [];
  const fields = new Set([...changedFields(section, base, draft), ...forceReview]);
  for (const field of fields) {
    if (draftFieldMatches(section, field, draft[field], latest[field])) continue;
    merged[field] = clone(draft[field]);
    if (forceReview.includes(field) || !equal(latest[field], base[field])) {
      conflicts.push({ section, field, label: (section === 'project' ? PROJECT_FIELDS : GENERAL_FIELDS)[field],
        previous: clone(base[field]), latest: clone(latest[field]) });
    }
  }
  return { draft: merged, conflicts };
}

function validateProject(draft) {
  const lengths = { jobName: 255, jobType: 100, purpose: 255, retention: 100,
    streetAddress: 255, cityStateZip: 100, gc: 255, gcpm: 100, scheduleNotes: 1000 };
  for (const [field, limit] of Object.entries(lengths)) {
    if (draft[field].length > limit) return `${PROJECT_FIELDS[field]} must be ${limit} characters or fewer.`;
  }
  for (const key of IDS) {
    if (draft[key] !== '' && (!/^\d+$/.test(draft[key]) || Number(draft[key]) < 1)) return `Choose a valid ${PROJECT_FIELDS[key]}.`;
  }
  for (const key of DATES) {
    if (draft[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(draft[key]) || (Number.isNaN(Date.parse(`${draft[key]}T12:00:00Z`)) || new Date(`${draft[key]}T12:00:00Z`).toISOString().slice(0, 10) !== draft[key]))) {
      return `Choose a valid ${PROJECT_FIELDS[key]}.`;
    }
  }
  if (draft.plannedStartDate && draft.plannedEndDate && draft.plannedEndDate < draft.plannedStartDate) {
    return 'Planned end date cannot be before planned start date.';
  }
  return null;
}

export function projectRequestError(detail) {
  if (typeof detail === 'object') {
    if (typeof detail?.message === 'string') return detail.message;
    return 'The submitted values were rejected. Review your edits.';
  }
  const messages = {
    bid_log_admin_required: 'Only administrators can edit project information.',
    job_person_not_assignable: 'A selected team member is no longer assignable.',
    job_updates_disabled: 'Project updates are currently disabled.',
    job_update_test_job_only: 'Project updates are restricted to the enabled test project.',
    data_api_unavailable: 'Riggs data services are temporarily unavailable.',
    sql_unavailable: 'Riggs data services are temporarily unavailable.',
    sql_capacity_unavailable: 'Riggs data services are busy.',
    invalid_active_project_update: 'Review the project values before saving.',
  };
  return messages[detail] || 'The project request could not be completed.';
}

function generalRequestError(detail) {
  const messages = {
    cognito_general_version_conflict: 'This project changed during saving.',
    cognito_general_save_busy: 'Another General Information save is in progress.',
    cognito_building_identity_invalid: 'A building row changed or was removed elsewhere.',
    cognito_general_outcome_unknown: 'The original save response could not be confirmed.',
    cognito_general_verification_failed: 'Cognito reported a read-back mismatch or changes outside this section.',
  };
  return messages[detail?.code] || generalErrorMessage(detail);
}

function emptySection() {
  return { snapshot: null, base: null, draft: null, loading: false, error: null, unresolved: null };
}

export function createProjectEditor({ jobListId, canEdit, fetcher = (...args) => globalThis.fetch(...args), timeoutMs = 110000 }) {
  const id = Number(jobListId);
  const generalEnabled = id === 24;
  const root = `/api/active-projects/${id}`;
  const listeners = new Set();
  const controllers = new Set();
  let epoch = 0;
  let active = false;
  let state = { project: emptySection(), general: emptySection(), saving: false, phase: '',
    notice: null, conflicts: [], refreshKey: 0, queued: [] };
  const emit = patch => {
    if (!active) return;
    state = { ...state, ...patch };
    listeners.forEach(fn => fn());
  };
  const setSection = (section, patch) => emit({ [section]: { ...state[section], ...patch } });
  const live = generation => active && generation === epoch;
  const failIfStale = generation => { if (!live(generation)) throw new DOMException('Editor closed', 'AbortError'); };
  const notify = (type, message) => emit({ notice: { type, message } });
  const dirty = section => changedFields(section, state[section].base, state[section].draft);

  async function request(section, method = 'GET', body = undefined) {
    const generation = epoch;
    failIfStale(generation);
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(root + (section === 'general' ? '/cognito-general' : ''), {
        method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      const payload = await response.json().catch(() => null);
      failIfStale(generation);
      if (!response.ok) {
        const error = new Error(section === 'general' ? generalRequestError(payload?.detail) : projectRequestError(payload?.detail));
        error.status = response.status;
        error.detail = payload?.detail;
        throw error;
      }
      return payload;
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }

  function checkedSnapshot(section, snapshot) {
    if (section === 'project') {
      if (!snapshot?.job || Number(snapshot.job.jobListId) !== id || !snapshot.lookups ||
          !Object.keys(PROJECT_FIELDS).every(field => Object.hasOwn(snapshot.job, field) &&
            (snapshot.job[field] === null || (IDS.includes(field)
              ? Number.isSafeInteger(snapshot.job[field]) && snapshot.job[field] > 0
              : typeof snapshot.job[field] === 'string'))) ||
          !['people', 'jobTypes', 'purposes'].every(field => Array.isArray(snapshot.lookups[field]))) {
        throw new Error('Project details returned an incomplete response. No values were replaced.');
      }
    } else {
      const v = snapshot?.values;
      if (Number(snapshot?.jobListId) !== id || !Number.isInteger(snapshot?.entryVersion) || snapshot.entryVersion < 1 ||
          typeof snapshot?.writeEnabled !== 'boolean' || !v || !Object.keys(GENERAL_FIELDS).every(field => Object.hasOwn(v, field)) ||
          !Array.isArray(v.buildingNames) || v.buildingNames.some(row => typeof row?.id !== 'string' || !row.id ||
            (row.name !== null && typeof row.name !== 'string')) ||
          new Set(v.buildingNames.map(row => row.id)).size !== v.buildingNames.length ||
          ![true, false, null].includes(v.leed) || ![true, false, null].includes(v.ndaRequired) ||
          (v.scope !== null && typeof v.scope !== 'string') ||
          (v.numberOfBuildings !== null && !Number.isInteger(v.numberOfBuildings)) ||
          (generalEnabled && (snapshot.cognitoEntryId !== 966 || String(snapshot.jobNumber) !== '11111'))) {
        throw new Error('General Information returned an invalid response. No values were replaced.');
      }
    }
    return snapshot;
  }
  const read = async section => checkedSnapshot(section, await request(section));
  const toDraft = (section, snapshot) => section === 'project' ? projectDraft(snapshot) : generalDraft(snapshot.values);

  function acceptRead(section, snapshot, forceReview = []) {
    const current = state[section];
    const base = toDraft(section, snapshot);
    const result = current.base && current.draft ? mergeDraft(section, current.base, current.draft, base, forceReview)
      : { draft: base, conflicts: [] };
    emit({ [section]: { ...current, snapshot, base, draft: result.draft, loading: false, error: null, unresolved: null },
      conflicts: [...state.conflicts.filter(c => c.section !== section), ...result.conflicts] });
  }
  function acceptSaved(section, snapshot) {
    const base = toDraft(section, snapshot);
    emit({ [section]: { snapshot, base, draft: clone(base), loading: false, error: null, unresolved: null },
      conflicts: state.conflicts.filter(c => c.section !== section), refreshKey: state.refreshKey + 1 });
  }
  function validate() {
    if (dirty('project').length) {
      const error = validateProject(state.project.draft);
      if (error) return error;
    }
    if (dirty('general').length) {
      if (!state.general.snapshot?.writeEnabled) return 'General Information editing is not enabled for this project.';
      return validateGeneralChanges(state.general.snapshot.values, state.general.draft);
    }
    return null;
  }

  async function load(section) {
    if (!active || state.saving || (section === 'general' && !generalEnabled)) return;
    const generation = epoch;
    const unresolved = state[section].unresolved;
    setSection(section, { loading: true, error: null });
    try {
      const snapshot = await read(section);
      failIfStale(generation);
      acceptRead(section, snapshot, unresolved?.fields || []);
      if (unresolved?.critical) setSection(section, { unresolved });
      if (state.conflicts.length) notify('info', 'Your edits are preserved. Review the changed fields before saving.');
    } catch (error) {
      if (live(generation)) setSection(section, { error: error.message || 'Current values could not be loaded.' });
    } finally { if (live(generation)) setSection(section, { loading: false }); }
  }

  async function recover(section, attempt, error, generation) {
    const definiteRejection = error.detail?.writeAttempted !== true && (error.detail?.writeAttempted === false || [400, 401, 403, 404, 409, 422].includes(error.status));
    const critical = error.detail?.code === 'cognito_general_verification_failed';
    const unresolved = { fields: attempt.fields, critical, message: critical
      ? 'Cognito reported a read-back mismatch or unrelated changes. Inspect the entry before continuing; nothing will be resent automatically.'
      : 'The save outcome could not be confirmed. Your edits are preserved; check current values before another save.' };
    setSection(section, { unresolved: definiteRejection ? null : unresolved });
    emit({ phase: 'Checking current values…' });
    try {
      const snapshot = await read(section);
      failIfStale(generation);
      acceptRead(section, snapshot, definiteRejection ? [] : attempt.fields);
      if (critical) setSection(section, { unresolved });
      if (!dirty(section).length) emit({ refreshKey: state.refreshKey + 1 });
      return !dirty(section).length;
    } catch {
      if (live(generation)) setSection(section, { unresolved, error: 'Current values could not be checked. Your draft has not been discarded.' });
      return false;
    }
  }

  async function save() {
    if (!active || !canEdit || state.saving || state.project.loading || state.general.loading || !state.project.snapshot) return;
    if (state.conflicts.length || state.project.unresolved || state.general.unresolved) {
      notify('info', 'Review the outstanding changes before saving. Your draft is preserved.'); return;
    }
    const sections = ['general', 'project'].filter(section => dirty(section).length);
    if (!sections.length) return;
    const validation = validate();
    if (validation) { notify('error', validation); return; }
    const generation = epoch;
    const completed = [];
    let attempt = null;
    let currentSection = null;
    emit({ saving: true, phase: 'Checking latest values…', notice: null, queued: [] });
    try {
      // All changed sections are validated and freshly read before the first write.
      const snapshots = await Promise.all(sections.map(async section => [section, await read(section)]));
      failIfStale(generation);
      snapshots.forEach(([section, snapshot]) => acceptRead(section, snapshot));
      if (state.conflicts.length) {
        notify('info', 'This project changed while you were editing. Your edits are preserved; review the changed fields.'); return;
      }
      const nextValidation = validate();
      if (nextValidation) { notify('error', nextValidation); return; }
      // General first: a SQL JOB_UPDATED worker must not invalidate our own General version before PATCH.
      for (const section of sections) {
        if (!dirty(section).length) continue;
        currentSection = section;
        attempt = null;
        if (section === 'project' && completed.includes('general')) {
          // Cognito automation may have updated SQL during the General write.
          acceptRead('project', await read('project'));
          failIfStale(generation);
          if (state.conflicts.length) {
            notify('info', 'General Information saved. Project details changed elsewhere; review your remaining edits.'); return;
          }
          const error = validate();
          if (error) { notify('error', `General Information saved. ${error}`); return; }
          if (!dirty('project').length) continue;
        }
        const data = state[section];
        const fields = dirty(section);
        const draft = clone(data.draft);
        const body = section === 'general'
          ? { expectedVersion: data.snapshot.entryVersion, changes: generalChanges(data.snapshot.values, draft) }
          : projectBody(draft);
        attempt = { fields, draft };
        emit({ phase: 'Saving changes…' });
        const result = await request(section, section === 'general' ? 'PATCH' : 'PUT', body);
        failIfStale(generation);
        if (section === 'general') {
          const snapshot = checkedSnapshot(section, result?.detail);
          if (!['VERIFIED', 'VERIFIED_AFTER_TRANSPORT_ERROR', 'NO_CHANGE'].includes(result?.result) ||
              !fields.every(field => draftFieldMatches(section, field, draft[field], toDraft(section, snapshot)[field]))) {
            throw new Error('General Information save response could not be verified.');
          }
          acceptSaved(section, snapshot);
        } else {
          if (result?.status !== 'ok' || result?.action !== 'updated' || Number(result?.jobListId) !== id ||
              !Array.isArray(result.queuedSync)) throw new Error('Project save response could not be verified.');
          acceptSaved(section, { ...data.snapshot, job: { ...data.snapshot.job, ...body } });
          emit({ queued: result.queuedSync.filter(value => ['SHAREPOINT', 'COGNITO'].includes(value)) });
        }
        completed.push(section);
        attempt = null; // A failed follow-up GET must never turn an acknowledged save into a retry.
        if (section === 'project') {
          try {
            const snapshot = await read('project');
            failIfStale(generation);
            const actual = toDraft('project', snapshot);
            const differing = fields.filter(field => !draftFieldMatches('project', field, draft[field], actual[field]));
            acceptRead('project', snapshot, differing);
            if (differing.length) {
              notify('info', 'Project save accepted, but current values differ. Review these fields; no writes were repeated.'); return;
            }
          } catch {
            if (live(generation)) setSection('project', { error: 'Save accepted. The latest project read was unavailable; your saved values remain displayed.' });
          }
        }
      }
      failIfStale(generation);
      notify('success', completed.length ? (state.queued.length
        ? `Changes saved. Project updates queued for ${state.queued.map(value => value === 'COGNITO' ? 'Cognito' : 'SharePoint').join(' and ')}.` : 'Changes saved.')
        : 'Current values already match your edits. No save was needed.');
    } catch (error) {
      if (!live(generation)) return;
      const prefix = completed.length ? `${completed.map(sectionName).join(' and ')} saved. ` : '';
      if (attempt && currentSection) {
        const matched = await recover(currentSection, attempt, error, generation);
        if (live(generation)) notify('info', prefix + (matched && !state[currentSection].unresolved
          ? `${sectionName(currentSection)} now matches your edits. The original save response was not confirmed; nothing was resent.`
          : `${sectionName(currentSection)} could not be confirmed. ${error.message || 'The save was not confirmed.'} Your remaining edits are preserved.`));
      } else {
        notify('error', `${prefix}The latest values could not be checked. ${completed.length ? 'Remaining edits' : 'Your edits'} are preserved; no additional writes were sent.`);
      }
    } finally { if (live(generation)) emit({ saving: false, phase: '' }); }
  }

  return {
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    getSnapshot: () => state,
    async start() {
      active = true; epoch += 1;
      if (!Number.isInteger(id) || id < 1) return;
      await Promise.all([load('project'), ...(generalEnabled ? [load('general')] : [])]);
    },
    dispose() { active = false; epoch += 1; controllers.forEach(c => c.abort()); controllers.clear(); },
    load, save,
    edit(section, field, value) {
      if (!active || !canEdit || state.saving || !state[section].draft) return;
      if (section === 'general' && !state.general.snapshot?.writeEnabled) return;
      if (!Object.hasOwn(state[section].draft, field)) return;
      setSection(section, { draft: { ...state[section].draft, [field]: value } });
      emit({ notice: null });
    },
    discard() {
      if (state.saving) return;
      // Unknown saves cannot be "undone" by discarding. Keep their blocking state.
      for (const section of ['project', 'general']) {
        if (state[section].base) setSection(section, { draft: clone(state[section].base) });
      }
      emit({ conflicts: [], notice: null });
    },
    resolve(section, field, choice) {
      if (state.saving || !['mine', 'latest'].includes(choice)) return;
      const conflict = state.conflicts.find(c => c.section === section && c.field === field);
      if (!conflict) return;
      if (choice === 'mine' && section === 'general' && field === 'buildingNames') {
        const ids = new Set(state.general.base.buildingNames.map(row => row.id));
        if (state.general.draft.buildingNames.some(row => row.id && !ids.has(row.id))) {
          notify('error', 'A building row was removed elsewhere. Use the current building list, then explicitly add any replacement row.'); return;
        }
      }
      if (choice === 'latest') setSection(section, { draft: { ...state[section].draft, [field]: clone(conflict.latest) } });
      emit({ conflicts: state.conflicts.filter(c => c !== conflict), notice: null });
    },
    dismissNotice() { emit({ notice: null }); },
  };
}
