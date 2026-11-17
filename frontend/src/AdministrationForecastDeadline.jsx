import {useCallback, useEffect, useRef, useState} from 'react';
import './AdministrationForecastDeadline.css';

const zoned = value => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Phoenix', year: 'numeric', month: 'short',
        day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      }).format(parsed)
    : '—';
};

async function parseSafe(response) {
  if (response.status === 401) throw Object.assign(new Error('Your session expired.'), {sessionExpired: true});
  if (response.status === 403) throw new Error('Administration access denied.');
  if (response.status === 409) throw new Error('This setting changed. Refresh before retrying.');
  if (!response.ok) throw new Error('Deadline controls are unavailable. The current lock remains enforced.');
  const data = await response.json();
  if (!data || !data.policy || !Array.isArray(data.events) || !Array.isArray(data.lateSubmissions)
      || !Number.isSafeInteger(data.policy.revision)) throw new Error('Invalid deadline-control response.');
  return data;
}

export default function AdministrationForecastDeadline({onSessionError}) {
  const [model, setModel] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState(24);
  const [reason, setReason] = useState('Leadership-approved late PM forecast submission window');
  const requestAbort = useRef(null);

  const refresh = useCallback(async () => {
    const controller = new AbortController();
    requestAbort.current?.abort();
    requestAbort.current = controller;
    setError('');
    try {
      const response = await fetch('/api/admin/pm-forecast-deadline', {
        method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: {'Accept': 'application/json', 'X-Riggs-Passive-Read': '1'},
      });
      const data = await parseSafe(response);
      if (!controller.signal.aborted) setModel(data);
    } catch (exc) {
      if (!controller.signal.aborted) {
        if (exc.sessionExpired) onSessionError?.({status: 401, detail: 'authentication_required'});
        setError(exc.message);
      }
    }
  }, [onSessionError]);

  useEffect(() => {
    void refresh();
    return () => requestAbort.current?.abort();
  }, [refresh]);

  const policy = model?.policy;
  const configuredOpen = policy?.isConfiguredOpen === true;
  const isActive = policy?.isActive === true;
  const canManage = policy?.canManage === true;
  const normalWindowOpen = Number(String(policy?.arizonaToday ?? '').slice(-2)) <= 20;
  const canOpenException = !normalWindowOpen;
  const change = async enabled => {
    if (!policy || !canManage || busy || (enabled && !canOpenException) || !reason.trim() || reason.trim().length < 10 || reason.trim().length > 500) return;
    if (!window.confirm(enabled
      ? `Approve a ${hours}-hour late PM forecast exception? A permanent administrative event will be recorded.`
      : 'Close this late PM forecast exception now? This will immediately lock current-month revisions.')) return;
    if (!window.crypto?.randomUUID) {
      setError('Secure request identifier is unavailable.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/pm-forecast-deadline', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {
          'Content-Type': 'application/json', 'Accept': 'application/json',
          'X-Request-ID': window.crypto.randomUUID(),
        },
        body: JSON.stringify({
          enabled, durationHours: enabled ? hours : null,
          reason: reason.trim(), expectedRevision: policy.revision, confirmed: true,
        }),
      });
      const updated = await parseSafe(response);
      setModel(updated);
    } catch (exc) {
      if (exc.sessionExpired) onSessionError?.({status: 401, detail: 'authentication_required'});
      setError(exc.message);
    } finally {
      setBusy(false);
    }
  };

  return <section className="administration-section" id="administration-pm-deadline" aria-label="PM forecast deadline exceptions">
    <div className="administration-section-heading"><h2>PM Forecast deadline</h2><span>Arizona time · admin exceptions and accountability</span></div>
    <div className="pm-deadline-admin-panel">
      <div className="pm-deadline-admin-top">
        <div><strong>Normal deadline: end of the 20th</strong>
          <p>Current-month PM edits lock at 12:00 a.m. on the 21st. Prior months remain locked. Admin Corrections are separate.</p>
        </div>
        <button type="button" className="pm-deadline-refresh" onClick={() => void refresh()} disabled={busy}>Refresh</button>
      </div>
      {error && <p className="administration-message administration-message-warning" role="alert">{error}</p>}
      {!policy ? <p className="administration-detail">Checking the deadline exception policy…</p> : <>
        <div className="pm-deadline-admin-status">
          <span className={`administration-state ${isActive ? 'administration-state-good' : 'administration-state-neutral'}`}>
            {isActive ? 'LATE WINDOW OPEN' : normalWindowOpen ? 'NORMAL EDITING OPEN' : configuredOpen ? 'EXCEPTION EXPIRED' : 'EXCEPTION CLOSED'}
          </span>
          <span>Reporting month: {policy.monthStart}</span>
          <span>Expires: {policy.expiresAtUTC ? zoned(policy.expiresAtUTC) : 'Not applicable'}</span>
          <span>Late submission points: <strong>{policy.lateSubmissionCount}</strong></span>
        </div>
        {canManage && <div className="pm-deadline-admin-form">
          <label>Window duration <select value={hours} disabled={busy} onChange={e => setHours(Number(e.target.value))}>
            <option value={24}>24 hours</option><option value={48}>48 hours</option><option value={72}>72 hours</option>
          </select></label>
          <label>Administrative reason <input type="text" value={reason} maxLength={500} disabled={busy}
            onChange={e => setReason(e.target.value)} /></label>
          <button type="button" disabled={busy || reason.trim().length < 10 || (!isActive && !canOpenException)} onClick={() => void change(!isActive)}>
            {isActive ? 'Close exception' : configuredOpen ? 'Reopen exception' : 'Open exception'}
          </button>
          <small>{normalWindowOpen ? 'The normal editing window is still open; exceptions can only be opened on or after the 21st.' : 'Applies to current-month late PM submissions only. One point per project/PM/month; the submitting actor is separately recorded.'}</small>
        </div>}
        {!canManage && <p className="administration-detail">View-only: only the designated primary administrator can open or close this exception.</p>}
        <div className="pm-deadline-admin-history">
          <div><h3>Late submissions</h3>
            {model.lateSubmissions.length ? <div className="administration-table-scroller"><table className="administration-table">
              <thead><tr><th>Accountable PM</th><th>Project</th><th>Attribution</th><th>Recorded (AZ)</th><th>Points</th></tr></thead>
              <tbody>{model.lateSubmissions.map(l => <tr key={`${l.jobListId}:${l.pmEid}`}>
                <td>{l.pmName}</td><td>{l.jobNumber || l.jobListId} · {l.jobName || 'Unnamed'}</td>
                <td title={`Submitted by EID ${l.submittedByEid}`}>{l.attributionSource === 'PROJECT_PM' ? 'Assigned PM' : 'Submitter fallback'}</td>
                <td>{zoned(l.recordedAtUTC)}</td><td>+1</td></tr>)}</tbody>
            </table></div> : <p className="administration-detail">No late current-month revisions recorded.</p>}
          </div>
          <div><h3>Exception audit trail</h3>
            {model.events.length ? <div className="administration-table-scroller"><table className="administration-table">
              <thead><tr><th>Action</th><th>Authorized by</th><th>When (AZ)</th><th>Reason</th></tr></thead>
              <tbody>{model.events.map(ev => <tr key={ev.eventId}><td>{ev.action}</td>
                <td>EID {ev.actorEid}</td><td>{zoned(ev.occurredAtUTC)}</td><td>{ev.reason}</td></tr>)}</tbody>
            </table></div> : <p className="administration-detail">No exceptions have been authorized this month.</p>}
          </div>
        </div>
      </>}
    </div>
  </section>;
}
