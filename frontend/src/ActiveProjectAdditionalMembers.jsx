import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProjectSetupIdentityPicker from './ProjectSetupIdentityPicker.jsx';
import './ActiveProjectAdditionalMembers.css';
import {additionalMemberScope,validRoster,validRosterIdentity,rosterCanEdit} from './additionalMemberRoster.mjs';

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

export default function ActiveProjectAdditionalMembers({ jobListId, setupId, canEdit, canInspect = canEdit,
  blocked = false, reloadKey = 0, onDirtyChange, onSavingChange, onSaved }) {
  const scope = useMemo(() => additionalMemberScope({jobListId, setupId}), [jobListId, setupId]);
  const [data, setData] = useState(null);
  const [ids, setIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false);
  const saveInFlight = useRef(false);
  const operation = useRef(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const baseline = useMemo(() => (data?.members || []).map(row => row.itUserId), [data]);
  const dirty = data ? !sameIds(ids, baseline) : false;
  const choices = useMemo(() => data?.directory || [], [data]);
  const editable = rosterCanEdit(canEdit, data, scope);

  useEffect(() => { onDirtyChange?.(dirty || uncertain || conflict); }, [dirty, uncertain, conflict, onDirtyChange]);
  useEffect(() => { onSavingChange?.(saving); }, [saving, onSavingChange]);
  useEffect(() => () => onSavingChange?.(false), [onSavingChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const load = useCallback(async (signal) => {
    if (!canInspect || !scope) return false;
    setLoading(true); setError('');
    try {
      const value = await jsonRequest(scope.url, { signal });
      if (signal?.aborted) return;
      if (!validRoster(value,scope)) throw new Error('Invalid roster response.');
      setData(value); setIds(value.members.map(row => row.itUserId));
      setUncertain(false); setConflict(false); operation.current = null;
      return true;
    } catch (cause) {
      if (!signal?.aborted) setError(cause.message || 'Cannot load Additional Members.');
      return false;
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [scope, canInspect]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setIds([]); setUncertain(false); setConflict(false); setNotice(''); operation.current = null;
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadKey]);

  function changeMembers(next) {
    if (!editable || saving || blocked || uncertain || conflict || !Array.isArray(next) || next.length > 200
        || next.some(id => !Number.isSafeInteger(id) || id <= 0)
        || new Set(next).size !== next.length) return;
    setIds(next);
    setError(''); setNotice(''); operation.current = null;
  }

  async function save() {
    if (!editable || !data || loading || saving || saveInFlight.current || blocked || conflict || (!dirty && !uncertain)) return;
    saveInFlight.current = true;
    setSaving(true); onSavingChange?.(true); setError(''); setNotice('');
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
      const result = await jsonRequest(scope.url, {
        method: 'PUT', body: JSON.stringify(body),
      });
      if (!validRosterIdentity(result, scope) || result.operationId !== body.operationId
          || !['UPDATED','UNCHANGED','REPLAY'].includes(result.resultAction)) throw new Error('Roster receipt could not be verified.');
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
        setConflict(true);
        setError('Another edit changed this roster, or the operation ID was already used. Reload before editing.');
      } else if (['project_additional_members_writes_disabled','project_setup_writes_disabled'].includes(cause.message)) {
        setError('Membership editing unavailable.');
      } else {
        setError(notCertain
          ? 'Save outcome unknown. Retry the SAME request, or reload and verify before changing anything.'
          : cause.message || 'Unable to save members.');
      }
    } finally { saveInFlight.current = false; setSaving(false); onSavingChange?.(false); }
  }

  if (!canInspect || !scope) return null;
  return <div className="additional-members-inline">
    {loading && <div className="bid-edit-message" role="status">Loading additional members…</div>}
    {error && <div className="bid-edit-message error" role="alert">{error}</div>}
    {!data && !loading && <button type="button" className="secondary-button"
      onClick={() => void load()}>Retry members</button>}
    {data && <>
      {editable ? <ProjectSetupIdentityPicker
        label="Additional team members"
        multiple
        value={ids}
        options={choices}
        onChange={changeMembers}
        disabled={loading || saving || blocked || uncertain || conflict}
      /> : <div className="project-setup-identity-selected" aria-label="Additional team members (view only)">
        {data.members.length ? data.members.map(member => <span className="project-setup-identity-chip" key={member.itUserId}>{member.label}</span>) : <small>No additional members</small>}
      </div>}
      {data.unavailableCount > 0 && <small className="additional-members-warning" role="status">
        {data.unavailableCount} member(s) need Microsoft recipient review.
      </small>}
      {editable && <div className="additional-members-actions">
        {(dirty || uncertain || conflict || error) && <button type="button" className="secondary-button"
          disabled={saving || blocked || loading}
          onClick={() => {
            if ((dirty || uncertain || conflict) && !window.confirm('Reload roster and discard local membership selections?')) return;
            void load();
          }}>Reload</button>}
        <button type="button" className="bid-log-save-button"
          disabled={saving || blocked || loading || conflict || (!dirty && !uncertain)}
          onClick={() => void save()}>{saving ? 'Saving…' : uncertain ? 'Retry Same Save' : 'Save Members'}</button>
      </div>}
    </>}
    {notice && <div className="bid-edit-message" role="status">{notice}</div>}
  </div>;
}
