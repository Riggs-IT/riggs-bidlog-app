import {useCallback, useEffect, useRef, useState} from 'react';

import {CATEGORIES, validQueueDetail} from './administrationQueueDetailContract.mjs';

const formatUTC = value => {
  if (typeof value !== 'string') return 'Not recorded';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Not recorded';
};

/** Never polls: loads only on an explicit owner interaction, with a passive GET. */
export default function AdministrationQueueDetails({laneKey, status, label, onClose, onSessionError}) {
  const [state, setState] = useState({phase: 'IDLE'});
  const request = useRef(null);
  const onSessionErrorRef = useRef(onSessionError);
  useEffect(() => {onSessionErrorRef.current = onSessionError;}, [onSessionError]);

  const load = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState(previous => ({...previous, phase: 'LOADING'}));
    try {
      const params = new URLSearchParams({lane: laneKey, status, limit: '20'});
      const response = await fetch(`/api/admin/queue-events?${params}`, {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: {Accept: 'application/json', 'X-Riggs-Passive-Read': '1'},
        signal: controller.signal,
      });
      if (response.status === 401) {
        onSessionErrorRef.current?.({status: 401, detail: 'authentication_required'});
        throw new Error('Your session has expired.');
      }
      if (response.status === 403) throw new Error('Administration access was denied.');
      if (!response.ok) throw new Error('Queue details could not be retrieved.');
      const payload = await response.json();
      if (payload?.availability === 'UNAVAILABLE') {
        if (!controller.signal.aborted) setState({phase: 'UNAVAILABLE'});
        return;
      }
      if (!validQueueDetail(payload, laneKey, status)) throw new Error('Queue details could not be verified.');
      if (!controller.signal.aborted) setState({phase: 'AVAILABLE', payload});
    } catch (error) {
      if (!controller.signal.aborted) setState({phase: 'ERROR', message: error.message || 'Queue details unavailable.'});
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [laneKey, status]);

  useEffect(() => {
    void load();
    const abortWhenHidden = () => {
      if (document.visibilityState !== 'visible') {
        request.current?.abort();
        setState(previous => previous.phase === 'LOADING'
          ? {phase: 'PAUSED'} : previous);
      }
    };
    document.addEventListener('visibilitychange', abortWhenHidden);
    return () => {request.current?.abort(); document.removeEventListener('visibilitychange', abortWhenHidden);};
  }, [load]);

  const {phase, payload} = state;
  return <div className="administration-queue-drilldown" role="region" aria-label={`${label} ${status.toLowerCase()} event details`}>
    <div className="administration-queue-drilldown-heading">
      <div>
        <h3>{label} — {status === 'FAILED' ? 'failed events' : 'pending events'}</h3>
        <p className="administration-detail">Read-only SQL evidence. Error categories are approximate; no raw worker logs or event payloads are shown.</p>
      </div>
      <div className="administration-queue-drilldown-controls">
        <button type="button" onClick={() => void load()} disabled={phase === 'LOADING'}>Refresh details</button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </div>
    {phase === 'IDLE' || phase === 'LOADING'
      ? <p className="administration-detail" role="status">Checking selected queue…</p>
      : phase === 'PAUSED'
        ? <p className="administration-detail" role="status">Queue read was paused while the tab was hidden. Use Refresh details to check again.</p>
        : phase === 'ERROR'
          ? <p className="administration-message administration-message-warning" role="alert">{state.message}</p>
          : phase === 'UNAVAILABLE'
          ? <p className="administration-message administration-message-warning" role="status">Event details are unavailable or not yet deployed. This is not a zero-failure result.</p>
          : <>
            <p className="administration-detail">Read {formatUTC(payload.observedAtUTC)} · {payload.events.length} records shown{payload.hasMore ? ' · additional records exist' : ''}.</p>
            {payload.events.length === 0
              ? <p className="administration-message">No {status.toLowerCase()} records were returned for this lane at this read.</p>
              : <div className="administration-table-scroller"><table className="administration-table administration-queue-detail-table">
                <thead><tr><th>Event</th><th>Affected record</th><th>Retries</th><th>Created</th><th>{status === 'FAILED' ? 'Next action' : 'Eligible after'}</th><th>Last error category</th></tr></thead>
                <tbody>{payload.events.map(event => <tr key={event.eventId}>
                  <td className="administration-mono">#{event.eventId}</td>
                  <td>
                    {event.jobListId != null ? <>JobListID {event.jobListId}</> : <>Ticket {event.ticketKey}</>}
                    {event.jobNumber && <small className="administration-queue-job">Job #{event.jobNumber}</small>}
                  </td>
                  <td>{event.retryCount}</td>
                  <td>{formatUTC(event.createdAtUTC)}</td>
                  <td>{status === 'FAILED' ? 'No automatic retry scheduled' : formatUTC(event.eligibleAfterUTC)}</td>
                  <td>{CATEGORIES[event.errorCategory]}</td>
                </tr>)}</tbody>
              </table></div>}
            {status === 'PENDING' && <p className="administration-detail">“Eligible after” is the earliest recorded claim time, not proof a worker will process the event then.</p>}
          </>}
  </div>;
}
