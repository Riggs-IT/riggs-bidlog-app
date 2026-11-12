import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProjectSetupIdentityPicker from './ProjectSetupIdentityPicker.jsx';
import './ActiveProjectAdditionalMembers.css';

function secureOperationId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('Secure browser randomness is unavailable. Open the app over HTTPS.');
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const raw = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function sortedIds(items) { return [...items].map(Number).sort((a, b) => a - b); }
function sameIds(left, right) {
  return JSON.stringify(sortedIds(left)) === JSON.stringify(sortedIds(right));
}
async function jsonRequest(url, options = {}) {
  const response = await window.fetch(url, {
    credentials: 'same-origin', cache: 'no-store', ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json', 'X-Riggs-Setup-Write': '1' } : {}),
      ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.detail || 'Roster service unavailable.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

export default function ActiveProjectAdditionalMembers({ jobListId, canEdit, blocked = false,
  onDirtyChange, onSaved }) {
  const [data, setData] = useState(null);
  const [ids, setIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const operation = useRef(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const baseline = useMemo(() => (data?.members || []).map(row => row.itUserId), [data]);
  const dirty = data ? !sameIds(ids, baseline) : false;
  const choices = useMemo(() => data?.directory || [], [data]);

  useEffect(() => { onDirtyChange?.(dirty || uncertain); }, [dirty, uncertain, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const load = useCallback(async (signal) => {
    if (!canEdit || !jobListId) return;
    setLoading(true); setError('');
    try {
      const value = await jsonRequest(`/api/active-projects/${jobListId}/additional-members`, { signal });
      if (signal?.aborted) return;
      if (value.jobListId !== Number(jobListId) || value.persistence !== 'SQL_ROSTER_ONLY'
          || !Array.isArray(value.members) || !Array.isArray(value.directory)
          || !Array.isArray(value.timeline) || !Number.isInteger(value.rosterRevision)) throw new Error('Invalid roster response.');
      setData(value); setIds(value.members.map(row => row.itUserId));
      setUncertain(false); operation.current = null;
      return true;
    } catch (cause) {
      if (!signal?.aborted) setError(cause.message || 'Cannot load Additional Members.');
      return false;
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [jobListId, canEdit]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setIds([]); setUncertain(false); operation.current = null;
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function changeMembers(next) {
    if (saving || blocked || uncertain || !Array.isArray(next) || next.length > 200
        || next.some(id => !Number.isSafeInteger(id) || id <= 0)
        || new Set(next).size !== next.length) return;
    setIds(next);
    setError(''); setNotice(''); operation.current = null;
  }

  async function save() {
    if (!canEdit || !data || loading || saving || blocked || (!dirty && !uncertain)) return;
    setSaving(true); setError(''); setNotice('');
    let sent = false;
    try {
      if (!operation.current) {
        operation.current = {
          operationId: secureOperationId(),
          expectedRevision: data.rosterRevision,
          memberITUserIds: sortedIds(ids),
        };
      }
      const body = operation.current;
      sent = true;
      const result = await jsonRequest(`/api/active-projects/${jobListId}/additional-members`, {
        method: 'PUT', body: JSON.stringify(body),
      });
      if (result.jobListId !== Number(jobListId) || result.operationId !== body.operationId
          || !Number.isInteger(result.rosterRevision)) throw new Error('Roster receipt could not be verified.');
      // The receipt proves the SQL save, even if the subsequent GET fails.
      setUncertain(false); operation.current = null;
      setData(null); // never offer a stale revision for another write
      const controller = new AbortController();
      const reloaded = await load(controller.signal);
      setNotice(reloaded ? 'Members saved.'
        : 'Membership save succeeded. Reload the roster before editing again.');
      Promise.resolve().then(() => onSavedRef.current?.()).catch(() => {});
    } catch (cause) {
      const notCertain = sent && (!cause.status || cause.status >= 500);
      setUncertain(notCertain);
      if (!notCertain) operation.current = null;
      if (cause.status === 409) {
        setError('Another edit changed this roster, or the operation ID was already used. Reload before editing.');
      } else if (cause.message === 'project_additional_members_writes_disabled') {
        setError('Membership editing is not enabled on the SQL bridge yet.');
      } else {
        setError(notCertain
          ? 'Save outcome unknown. Retry the SAME request, or reload and verify before changing anything.'
          : cause.message || 'Unable to save members.');
      }
    } finally { setSaving(false); }
  }

  if (!canEdit) return null;
  return <div className="additional-members-inline">
    {loading && <div className="bid-edit-message" role="status">Loading additional members…</div>}
    {error && <div className="bid-edit-message error" role="alert">{error}</div>}
    {!data && !loading && <button type="button" className="secondary-button"
      onClick={() => void load()}>Retry members</button>}
    {data && <>
      <ProjectSetupIdentityPicker
        label="Additional team members"
        multiple
        value={ids}
        options={choices}
        onChange={changeMembers}
        disabled={loading || saving || blocked || uncertain}
      />
      {data.unavailableCount > 0 && <small className="additional-members-warning" role="status">
        {data.unavailableCount} member(s) missing a Microsoft email.
      </small>}
      {notice && <div className="bid-edit-message" role="status">{notice}</div>}
      <div className="additional-members-actions">
        {(dirty || uncertain || error) && <button type="button" className="secondary-button"
          disabled={saving || blocked || loading}
          onClick={() => {
            if ((dirty || uncertain) && !window.confirm('Reload roster and discard local membership selections?')) return;
            void load();
          }}>Reload</button>}
        <button type="button" className="bid-log-save-button"
          disabled={saving || blocked || loading || (!dirty && !uncertain)}
          onClick={() => void save()}>{saving ? 'Saving…' : uncertain ? 'Retry Same Save' : 'Save Members'}</button>
      </div>
    </>}
  </div>;
}
