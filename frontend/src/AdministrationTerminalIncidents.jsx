import {useEffect, useRef, useState} from 'react';

const REASONS = Object.freeze({
  EXISTING_LIFECYCLE_OPERATION_REQUIRES_REVIEW: 'Existing lifecycle operation; inspect the receipt before any retry.',
  EXISTING_DESTINATION_SQL_REQUIRES_REVIEW: 'SQL already records a destination; verify current ownership.',
  EXISTING_CANONICAL_BID_REQUIRES_REVIEW: 'Bid already exists in canonical SQL; review the Active source identity.',
  EXISTING_SHAREPOINT_DESTINATION_REQUIRES_REVIEW: 'A destination exists in SharePoint; check for a prior move.',
  RESPONSE_INCOMPLETE_REQUIRES_REVIEW: 'Lifecycle response was incomplete; SQL and SharePoint need readback.',
  RESPONSE_IDENTITY_MISMATCH_REQUIRES_REVIEW: 'Move response identity did not match this bid.',
  SOURCE_REMAINS_AFTER_RESPONSE_REQUIRES_REVIEW: 'Move reported completion but the Active source remained.',
  OPERATION_EXCEPTION: 'An exception occurred during the move; outcome may be partial.',
  TERMINAL_RESPONSE_UNCERTAIN_STOP_WORKER: 'Uncertain lifecycle response; manual verification required.',
  AUTO_AGE_WINDOW_EXCEEDED_REQUIRES_REVIEW: 'Status change is outside the 72-hour automatic window; review before manual recovery.',
});

function timestamp(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toLocaleString() : 'Unknown';
}

function isIncidentPayload(data) {
  return data?.readOnly === true && data?.availability === 'AVAILABLE'
    && data?.source === 'RIGGSDATAHUB_WATCHDOG_INCIDENTS'
    && Number.isSafeInteger(data.totalCount) && data.totalCount >= 0
    && Number.isSafeInteger(data.blockedCount) && data.blockedCount >= 0
    && Number.isSafeInteger(data.uncertainCount) && data.uncertainCount >= 0
    && data.blockedCount + data.uncertainCount === data.totalCount
    && data.captureHealth === 'NOT_COLLECTED'
    && Array.isArray(data.incidents) && data.incidents.length <= 20
    && (data.totalCount === 0) === (data.incidents.length === 0)
    && data.incidents.every(row => Number.isSafeInteger(row.bidId) && row.bidId > 0
      && ['BLOCKED', 'UNCERTAIN'].includes(row.kind)
      && ['NOT PURSUING', 'DEAD', 'LOST'].includes(row.status)
      && Object.hasOwn(REASONS, row.reasonCode));
}

export default function AdministrationTerminalIncidents({refreshKey, onStateChange, onSessionError}) {
  const [lastGood, setLastGood] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const callback = useRef(onSessionError);
  useEffect(() => { callback.current = onSessionError; }, [onSessionError]);

  useEffect(() => {
    if (!refreshKey || document.visibilityState !== 'visible') return;
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const response = await fetch('/api/admin/terminal-incidents', {
          method: 'GET', credentials: 'same-origin', cache: 'no-store',
          headers: {'Accept': 'application/json', 'X-Riggs-Passive-Read': '1'},
          signal: controller.signal,
        });
        if (response.status === 401) callback.current?.({status: 401, detail: 'authentication_required'});
        if (!response.ok) throw new Error('Watchdog incident evidence unavailable');
        const data = await response.json();
        if (!isIncidentPayload(data)) throw new Error('Watchdog incident evidence could not be verified');
        if (controller.signal.aborted) return;
        setLastGood(data);
        setError('');
        onStateChange?.(data);
      } catch (exc) {
        if (controller.signal.aborted) return;
        setError('Watchdog incident evidence unavailable.');
        onStateChange?.({availability: 'UNAVAILABLE'});
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [refreshKey, onStateChange]);

  return <section className="administration-section" id="administration-terminal-incidents"
                  aria-label="Bid lifecycle exceptions">
    <div className="administration-section-heading">
      <h2>Bid lifecycle exceptions</h2>
      <span>Durable SQL incident records · read only</span>
    </div>
    {lastGood ? <>
      <p className="administration-detail">
        {lastGood.totalCount.toLocaleString()} recorded · {lastGood.blockedCount.toLocaleString()} blocked · {' '}
        {lastGood.uncertainCount.toLocaleString()} uncertain · checked {timestamp(lastGood.observedAtUTC)}
        {error ? ' · Last successful read shown; current status unavailable' : ''}
      </p>
      {lastGood.incidents.length ? <div className="administration-table-scroller">
        <table className="administration-table">
          <thead><tr><th>Bid ID</th><th>Status</th><th>Finding</th><th>First observed</th><th>Last observed</th></tr></thead>
          <tbody>{lastGood.incidents.map(row => <tr key={row.incidentId}>
            <td className="administration-mono">{row.bidId}</td>
            <td>{row.status}</td>
            <td><strong>{row.kind === 'BLOCKED' ? 'Blocked recovery' : 'Uncertain outcome'}</strong>
              <div>{REASONS[row.reasonCode]}</div>
              <small className="administration-mono">{row.reasonCode}</small>
            </td>
            <td>{timestamp(row.firstObservedAtUTC)}</td>
            <td>{timestamp(row.lastObservedAtUTC)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="administration-detail">No incident records have been captured.</p>}
      {lastGood.totalCount > lastGood.incidents.length && <p className="administration-detail">
        Showing the latest {lastGood.incidents.length} of {lastGood.totalCount} records.
      </p>}
    </> : <p className="administration-detail">
      {loading ? 'Checking incident records…' : 'Incident records have not been verified.'}
    </p>}
    {error && <div className="administration-message administration-message-warning" role="status">{error}</div>}
    <p className="administration-detail">
      Incidents are audit receipts, not a live source scan. A recorded exception requires independent SQL/SharePoint verification;
      a zero count does not prove the watchdog is running. Capture health is not independently collected.
    </p>
  </section>;
}
