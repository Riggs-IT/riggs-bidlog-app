import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generalDraft, generalChanges, validateGeneralChanges, generalErrorMessage } from './activeProjectGeneral.js';
import './ActiveProjectGeneralEditor.css';

async function requestGeneral(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin', cache: 'no-store', ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(generalErrorMessage(payload?.detail));
    error.reloadRequired = Boolean(payload?.detail?.reloadRequired);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export default function ActiveProjectGeneralEditor({ jobListId, canEdit, blocked, onStateChange }) {
  const [snapshot, setSnapshot] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [mustReload, setMustReload] = useState(false);
  const controller = useRef(null);
  const mounted = useRef(false);
  const url = `/api/active-projects/${jobListId}/cognito-general`;
  const changes = useMemo(() => snapshot && draft ? generalChanges(snapshot.values, draft) : {}, [snapshot, draft]);
  const dirty = Object.keys(changes).length > 0;
  const editable = Boolean(canEdit && snapshot?.writeEnabled && !blocked && !loading && !saving && !mustReload);

  useEffect(() => {
    onStateChange?.({ dirty, busy: saving });
  }, [dirty, saving, onStateChange]);

  const load = useCallback(async () => {
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setLoading(true); setError(null); setMessage(null);
    try {
      const next = await requestGeneral(url, { signal: nextController.signal });
      if (!next?.values || !Array.isArray(next.values.buildingNames) || !Number.isInteger(next.entryVersion)) {
        throw new Error('General Information returned an invalid response.');
      }
      if (!nextController.signal.aborted && mounted.current) {
        setSnapshot(next); setDraft(generalDraft(next.values)); setMustReload(false);
      }
    } catch (err) {
      if (err.name !== 'AbortError' && mounted.current) {
        setError(err.message); setMustReload(true);
      }
    } finally {
      if (!nextController.signal.aborted && mounted.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
      controller.current?.abort();
      onStateChange?.({ dirty: false, busy: false });
    };
  }, [load, onStateChange]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function edit(field, value) {
    setDraft(old => ({ ...old, [field]: value })); setError(null); setMessage(null);
  }

  async function reload() {
    if (dirty && !window.confirm('Discard unsaved General Information changes and reload?')) return;
    await load();
  }

  async function save() {
    if (!editable || !dirty) return;
    const validation = validateGeneralChanges(snapshot.values, draft);
    if (validation) { setError(validation); return; }
    setSaving(true); setError(null); setMessage(null);
    try {
      const result = await requestGeneral(url, {
        method: 'PATCH',
        body: JSON.stringify({ expectedVersion: snapshot.entryVersion, changes }),
      });
      if (!result?.detail?.values || !Number.isInteger(result.detail.entryVersion)) {
        throw new Error('Save response could not be verified. Reload before another save.');
      }
      if (mounted.current) {
        setSnapshot(result.detail); setDraft(generalDraft(result.detail.values)); setMustReload(false);
        setMessage(result.result === 'NO_CHANGE' ? 'No changes were needed.' : 'Saved and read back from Cognito. Downstream automation still needs test verification.');
      }
    } catch (err) {
      if (mounted.current) {
        // Even an app/network timeout may have applied the change. Never auto-retry.
        setError(err.message || 'Save outcome is unknown. Reload before another save.');
        setMustReload(true);
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  function removeBuilding(index) {
    if (!window.confirm('Remove this building row? The row will be removed from Cognito when you save this section.')) return;
    edit('buildingNames', draft.buildingNames.filter((_, i) => i !== index));
  }

  return (
    <section className="bid-edit-section information-sheet-section cognito-general-editor">
      <div className="bid-edit-section-heading information-sheet-heading">
        <div><span className="section-kicker">GENERAL INFORMATION</span><h3>Scope & Project Requirements</h3></div>
        <button type="button" className="secondary-button" disabled={saving || blocked || loading} onClick={reload}>Reload section</button>
      </div>
      {loading && <div className="bid-edit-message">Loading current General Information…</div>}
      {!loading && !snapshot && <div className="bid-edit-message">This section is not ready. The existing project save is unaffected.</div>}
      {error && <div className="bid-edit-message error" role="alert">{error}</div>}
      {message && <div className="bid-edit-message" role="status">{message}</div>}
      {!loading && snapshot && draft && <>
        <p className="cognito-general-note">
          {snapshot.writeEnabled && canEdit
            ? 'Controlled test: edits are limited to Job 11111. Save this section separately from the SQL-backed project fields.'
            : 'Read-only. General Information editing is currently limited to administrators on the enabled test project.'}
        </p>
        <fieldset disabled={!editable} className="cognito-general-fields">
          <div className="bid-edit-grid three-column">
            <label className="bid-edit-field"><span>Number of Buildings</span>
              <input type="number" min="1" max="100" step="1" value={draft.numberOfBuildings}
                onChange={event => edit('numberOfBuildings', event.target.value)} />
            </label>
            {[['leed', 'LEED'], ['ndaRequired', 'NDA Required']].map(([field, label]) => (
              <label className="bid-edit-field" key={field}><span>{label}</span>
                <select value={draft[field]} onChange={event => edit(field, event.target.value)}>
                  <option value="" disabled>Not set</option><option value="true">Yes</option><option value="false">No</option>
                </select>
              </label>
            ))}
            <label className="bid-edit-field wide"><span>Scope</span>
              <textarea rows="4" maxLength="20000" value={draft.scope} onChange={event => edit('scope', event.target.value)} />
            </label>
          </div>
          <div className="cognito-general-buildings">
            <div className="cognito-general-row-heading"><strong>Building Names</strong>
              <button type="button" className="secondary-button" disabled={!editable || draft.buildingNames.length >= 100}
                onClick={() => edit('buildingNames', [...draft.buildingNames, { id: null, name: '' }])}>Add building</button>
            </div>
            {!draft.buildingNames.length && <p className="cognito-general-note">No building rows recorded.</p>}
            {draft.buildingNames.map((row, index) => (
              <div className="cognito-general-building" key={row.id || `new-${index}`}>
                <label className="bid-edit-field"><span>Building {index + 1}</span>
                  <input type="text" maxLength="1000" value={row.name}
                    onChange={event => edit('buildingNames', draft.buildingNames.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
                </label>
                <button type="button" className="secondary-button" aria-label={`Remove building ${index + 1}`} onClick={() => removeBuilding(index)}>Remove</button>
              </div>
            ))}
          </div>
        </fieldset>
        <p className="cognito-general-note">Contract / LOI remains read-only while its label mapping is verified. Stored Cognito value: {String(snapshot.contractRaw ?? 'not set')}.</p>
        <div className="cognito-general-actions">
          <small>{mustReload ? 'Reload and inspect before making another save.' : dirty ? 'Unsaved General Information changes' : `Cognito version ${snapshot.entryVersion}`}</small>
          <button type="button" className="bid-log-save-button" disabled={!editable || !dirty} onClick={save}>
            {saving ? 'Saving section…' : 'Save General Information'}
          </button>
        </div>
      </>}
    </section>
  );
}
