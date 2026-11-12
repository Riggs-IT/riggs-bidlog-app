import {useEffect, useRef, useState} from 'react';

const REASONS = Object.freeze({
  EXISTING_LIFECYCLE_OPERATION_REQUIRES_REVIEW: 'A previous lifecycle operation exists. Review before any retry.',
  EXISTING_DESTINATION_SQL_REQUIRES_REVIEW: 'SQL already records a destination. Verify the outcome.',
  EXISTING_CANONICAL_BID_REQUIRES_REVIEW: 'Canonical SQL bid exists. This is not permission to duplicate the move.',
  EXISTING_SHAREPOINT_DESTINATION_REQUIRES_REVIEW: 'SharePoint already contains a destination record.',
  RESPONSE_INCOMPLETE_REQUIRES_REVIEW: 'The previous response was incomplete. Verify downstream records.',
  RESPONSE_IDENTITY_MISMATCH_REQUIRES_REVIEW: 'The previous response did not match the requested bid.',
  SOURCE_REMAINS_AFTER_RESPONSE_REQUIRES_REVIEW: 'The source remained after a reported move.',
  OPERATION_EXCEPTION: 'An earlier operation may have partially completed.',
  TERMINAL_RESPONSE_UNCERTAIN_STOP_WORKER: 'An uncertain external write requires readback.',
  AUTO_AGE_WINDOW_EXCEEDED_REQUIRES_REVIEW: 'Historic age-window exception. Current state may now be resolved.',
});

const timestamp = value => {
  if (!value) return 'Unknown';
  const d = new Date(value);
  return Number.isFinite(d.valueOf()) ? d.toLocaleString() : 'Unknown';
};

function validCases(data) {
  return data?.source === 'RIGGSDATAHUB_WATCHDOG_CASES'
    && Number.isSafeInteger(data.totalCount) && data.totalCount >= 0
    && Number.isSafeInteger(data.openCount) && data.openCount >= 0
    && Number.isSafeInteger(data.resolvedCount) && data.resolvedCount >= 0
    && data.openCount + data.resolvedCount === data.totalCount
    && Array.isArray(data.incidents) && data.incidents.length <= 40
    && data.incidents.every(row => Number.isSafeInteger(row.incidentId) && row.incidentId > 0
      && Number.isSafeInteger(row.bidId) && row.bidId > 0
      && ['BLOCKED', 'UNCERTAIN'].includes(row.kind)
      && ['NOT PURSUING', 'DEAD', 'LOST'].includes(row.status)
      && Object.hasOwn(REASONS, row.reasonCode)
      && (row.resolutionCode === null || row.resolutionCode === 'VERIFIED_COMPLETE'));
}

export default function AdministrationTerminalIncidents({refreshKey, onStateChange, onSessionError}) {
  const [lastGood, setLastGood] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('open');
  const [selected, setSelected] = useState(null);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const sessionCallback = useRef(onSessionError);
  useEffect(() => { sessionCallback.current = onSessionError; }, [onSessionError]);

  useEffect(() => {
    if (!refreshKey || document.visibilityState !== 'visible') return;
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const response = await fetch('/api/admin/terminal-cases', {
          method: 'GET', credentials: 'same-origin', cache: 'no-store',
          headers: {'Accept': 'application/json', 'X-Riggs-Passive-Read': '1'},
          signal: controller.signal,
        });
        if (response.status === 401) sessionCallback.current?.({status: 401, detail: 'authentication_required'});
        if (!response.ok) throw new Error('Case evidence unavailable');
        const data = await response.json();
        if (!validCases(data)) throw new Error('Invalid lifecycle case evidence');
        if (controller.signal.aborted) return;
        setLastGood(data);
        setError('');
        onStateChange?.({...data, availability: 'AVAILABLE'});
      } catch (exc) {
        if (controller.signal.aborted) return;
        setError('Lifecycle exception evidence unavailable.');
        onStateChange?.({availability: 'UNAVAILABLE'});
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [refreshKey, reloadKey, onStateChange]);

  async function openReview(row) {
    setSelected(row);
    setReview(null);
    setActionError('');
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/terminal-cases/${row.incidentId}/review`, {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: {'Accept': 'application/json'},
      });
      if (response.status === 401) sessionCallback.current?.({status: 401, detail: 'authentication_required'});
      if (!response.ok) throw new Error('Live review unavailable');
      const data = await response.json();
      if (data.incidentId !== row.incidentId || data.bidId !== row.bidId
          || typeof data.sourcePresent !== 'boolean' || typeof data.sqlLifecycleComplete !== 'boolean') {
        throw new Error('Invalid case review response');
      }
      setReview(data);
    } catch (exc) {
      setActionError('Could not verify the current SharePoint/SQL state. No action was taken.');
    } finally {
      setBusy(false);
    }
  }

  async function takeAction(operation) {
    if (!selected || !review || busy) return;
    const message = operation === 'VERIFY_RESOLVED'
      ? `Mark incident ${selected.incidentId} as verified resolved? The live source must be absent and SQL must prove completion.`
      : `Retry the Not Pursuing move for bid ${selected.bidId}? This makes REAL SharePoint and SQL changes, only if all server safety checks pass.`;
    if (!window.confirm(message)) return;
    setBusy(true);
    setActionError('');
    try {
      const response = await fetch(`/api/admin/terminal-cases/${selected.incidentId}/action`, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: JSON.stringify({requestId: crypto.randomUUID(), operation, confirmed: true}),
      });
      if (response.status === 401) sessionCallback.current?.({status: 401, detail: 'authentication_required'});
      if (!response.ok) throw new Error(`Action blocked (${response.status})`);
      setSelected(null);
      setReview(null);
      setReloadKey(k => k + 1);
      setTab('resolved');
    } catch (exc) {
      setActionError('Action did not complete or was blocked. Recheck current status before retrying.');
    } finally {
      setBusy(false);
    }
  }

  const rows = (lastGood?.incidents || []).filter(row =>
    tab === 'open' ? row.resolutionCode === null : row.resolutionCode === 'VERIFIED_COMPLETE');

  return <section className="administration-section" id="administration-terminal-incidents"
    aria-label="Bid lifecycle exceptions">
    <div className="administration-section-heading">
      <h2>Bid lifecycle exceptions</h2>
      <span>Verified resolution · historical evidence preserved</span>
    </div>
    {lastGood ? <>
      <p className="administration-detail">
        {lastGood.openCount.toLocaleString()} need review · {lastGood.resolvedCount.toLocaleString()} resolved
        {' '}· checked {timestamp(lastGood.observedAtUTC)}
        {error ? ' · Latest read unavailable; showing last verified data' : ''}
      </p>
      <div className="administration-tab-row" role="group" aria-label="Lifecycle cases">
        <button type="button" aria-pressed={tab === 'open'} onClick={() => {setTab('open');setSelected(null);}}>
          Needs review ({lastGood.openCount})
        </button>
        <button type="button" aria-pressed={tab === 'resolved'} onClick={() => {setTab('resolved');setSelected(null);}}>
          Resolved ({lastGood.resolvedCount})
        </button>
      </div>
      {rows.length > 0 ? <div className="administration-table-scroller">
        <table className="administration-table"><thead><tr>
          <th>Bid ID</th><th>Status</th><th>Finding</th><th>Last observed</th><th>Action</th>
        </tr></thead><tbody>
          {rows.map(row => <tr key={row.incidentId}>
            <td className="administration-mono">{row.bidId}</td>
            <td>{row.status}</td>
            <td><strong>{row.kind === 'BLOCKED' ? 'Blocked recovery' : 'Uncertain outcome'}</strong>
              <div>{REASONS[row.reasonCode]}</div></td>
            <td>{timestamp(row.resolvedAtUTC || row.lastObservedAtUTC)}</td>
            <td>{tab === 'open' ? <button type="button" disabled={busy} onClick={() => openReview(row)}>Review</button>
              : <span>Verified</span>}</td>
          </tr>)}
        </tbody></table>
      </div> : <p className="administration-detail">
        {tab === 'open' ? 'No unresolved cases in this page of evidence.' : 'No verified resolutions in this page of evidence.'}
      </p>}
      {lastGood.openCount + lastGood.resolvedCount > lastGood.incidents.length && <p className="administration-detail">
        Showing the latest bounded sample. Counts include all cases; older rows may not appear here.
      </p>}
    </> : <p className="administration-detail">{loading ? 'Checking lifecycle cases…' : 'No verified lifecycle cases loaded.'}</p>}
    {error && <div className="administration-message administration-message-warning" role="status">{error}</div>}
    {selected && <div className="administration-section" aria-label="Selected lifecycle case review">
      <h3>Review bid {selected.bidId}</h3>
      {busy && <p className="administration-detail">Verifying current evidence…</p>}
      {review && <>
        <p className="administration-detail">Active source: {review.sourcePresent ? 'Still present' : 'Absent'} ·
          SQL lifecycle: {review.sqlLifecycleComplete ? 'Complete' : 'Not verified complete'} ·
          Preserved history versions: {review.preservedHistoryVersions}</p>
        <p className="administration-detail">{review.reasonCode || 'No prewrite blocker found in current readback.'}</p>
        <div className="administration-tab-row">
          <button type="button" disabled={busy || !review.canVerifyResolve || !review.verifyResolveEnabled}
                  onClick={() => takeAction('VERIFY_RESOLVED')}>Verify &amp; resolve</button>
          <button type="button" disabled={busy || !review.canRetry || !review.retryEnabled}
                  onClick={() => takeAction('RETRY_NOT_PURSUING')}>Review &amp; retry move</button>
          <button type="button" disabled={busy} onClick={() => {setSelected(null);setReview(null);}}>Close review</button>
        </div>
        {!review.verifyResolveEnabled && <small className="administration-detail">Resolution writes are disabled by server policy.</small>}
      </>}
      {actionError && <div className="administration-message administration-message-warning" role="status">{actionError}</div>}
    </div>}
    <p className="administration-detail">Recorded incidents are retained. A retry is never a force operation;
      it is refused if SQL, SharePoint, or the fast-path queue indicates a prior or uncertain move.</p>
  </section>;
}
