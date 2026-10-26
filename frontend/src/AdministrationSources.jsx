import {useCallback, useEffect, useRef, useState} from 'react';
import {SOURCE_META, describeSourceTimestamp, validSourceEvidence} from './administrationSourceEvidence.mjs';

/** Explicit read only: this is NOT part of Administration's periodic overview. */
export default function AdministrationSources({onSessionError}) {
  const [state, setState] = useState({phase: 'IDLE'});
  const pending = useRef(null);
  const sessionCallback = useRef(onSessionError);
  useEffect(() => {sessionCallback.current = onSessionError;}, [onSessionError]);

  const load = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState(previous => ({...previous, phase: 'LOADING'}));
    try {
      const response = await fetch('/api/admin/source-evidence', {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: {Accept: 'application/json', 'X-Riggs-Passive-Read': '1'},
        signal: controller.signal,
      });
      if (response.status === 401) {
        sessionCallback.current?.({status: 401, detail: 'authentication_required'});
        throw new Error('Your session expired.');
      }
      if (response.status === 403) throw new Error('Administration access was denied.');
      if (!response.ok) throw new Error('Source evidence could not be retrieved.');
      const body = await response.json();
      if (body?.availability === 'UNAVAILABLE' && body?.readOnly === true) {
        if (!controller.signal.aborted) setState({phase: 'UNAVAILABLE'});
        return;
      }
      if (!validSourceEvidence(body)) throw new Error('Source evidence returned an invalid contract.');
      if (!controller.signal.aborted) setState({phase: 'AVAILABLE', data: body});
    } catch (error) {
      if (!controller.signal.aborted) setState({phase: 'ERROR', message: error.message || 'Unable to check sources.'});
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }, []);
  useEffect(() => {
    const pause = () => {
      if (document.visibilityState !== 'visible') {
        pending.current?.abort();
        setState(previous => previous.phase === 'LOADING' ? {phase: 'PAUSED'} : previous);
      }
    };
    document.addEventListener('visibilitychange', pause);
    return () => { pending.current?.abort(); document.removeEventListener('visibilitychange', pause); };
  }, []);

  return <section className="administration-section" id="administration-data-sources" aria-label="Data source evidence">
    <div className="administration-section-heading">
      <h2>Data source evidence</h2><span>Five existing SQL mirrors · on demand only</span>
    </div>
    <div className="administration-source-header">
      <p className="administration-detail">A recently changed row does not prove that the upstream sync ran successfully. Quiet sources are not automatically failures.</p>
      <button type="button" onClick={() => void load()} disabled={state.phase === 'LOADING'}>
        {state.phase === 'LOADING' ? 'Checking…' : state.phase === 'IDLE' ? 'Check source evidence' : 'Check again'}
      </button>
    </div>
    {state.phase === 'IDLE' && <p className="administration-detail">No source scan has run in this browser session.</p>}
    {state.phase === 'LOADING' && <p role="status" className="administration-detail">Reading recorded source timestamps…</p>}
    {state.phase === 'PAUSED' && <p role="status" className="administration-detail">Check paused while the tab was hidden. Select Check again.</p>}
    {state.phase === 'ERROR' && <p role="alert" className="administration-message administration-message-warning">{state.message}</p>}
    {state.phase === 'UNAVAILABLE' && <p role="status" className="administration-message administration-message-warning">Source evidence unavailable or not deployed. This is not a zero-activity result.</p>}
    {state.phase === 'AVAILABLE' && <>
      <div className="administration-table-scroller">
        <table className="administration-table administration-source-table">
          <thead><tr><th>Integration</th><th>Recorded evidence</th><th>Last recorded event</th><th>Interpretation</th></tr></thead>
          <tbody>{state.data.rows.map(row => {
            const meta = SOURCE_META[row.sourceKey];
            const stamp = describeSourceTimestamp(row, state.data.observedAtUTC);
            return <tr key={row.sourceKey}>
              <td><strong>{meta.label}</strong></td>
              <td>{row.evidenceType === 'MIRROR_ITEM_SYNC' ? 'Row synchronized' : 'Source modified'}</td>
              <td><strong>{stamp.value}</strong><small className="administration-source-age">{stamp.detail}</small></td>
              <td>{meta.meaning}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <p className="administration-detail">Read {new Date(state.data.observedAtUTC).toLocaleString()} · No worker liveness, full-import completion, or last-success run history is claimed.</p>
    </>}
  </section>;
}
