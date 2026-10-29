import {useCallback, useEffect, useRef, useState} from 'react';
import {validateOpsSetupList} from './opsSetupListContract.mjs';

const PAGE_SIZE = 25;
const PATH = '/api/project-setups/ops/awaiting-information';

function errorMessage(status, detail) {
  if (status === 401) return 'Your session is no longer authorized. Sign in again.';
  if (status === 403) return 'You do not have permission to view setup drafts.';
  if (status === 503 && detail === 'project_setup_ops_discovery_disabled')
    return 'Awaiting information is not enabled yet. This is not an empty queue.';
  if (status === 503 && detail === 'project_setup_reads_disabled')
    return 'Project setup reads are disabled. This is not an empty queue.';
  if (status === 503) return 'Project setup service is unavailable. Please retry later.';
  return 'Unable to verify the Awaiting information list.';
}

function dateLabel(text) {
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Intl.DateTimeFormat('en-US', {
    month:'short',day:'numeric',year:'numeric',timeZone:'America/Phoenix',
  }).format(new Date(time)) : '—';
}

export default function ProjectSetupAwaitingPanel() {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);
  const sequenceRef = useRef(0);
  const load = useCallback(async (cursor = null) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sequence = ++sequenceRef.current;
    setLoading(true);setError(null);
    try {
      const query = new URLSearchParams({page_size: String(PAGE_SIZE)});
      if (cursor) {
        query.set('after_created_at_utc', cursor.createdAtUTC);
        query.set('after_setup_id', cursor.setupId);
      }
      const response = await fetch(`${PATH}?${query.toString()}`, {
        credentials:'same-origin',cache:'no-store',signal:controller.signal,
        headers:{'X-Riggs-Passive-Read':'1','Accept':'application/json'},
      });
      let body;
      try {body = await response.json();} catch {body = null;}
      if (!response.ok) {
        const ex = new Error(errorMessage(response.status, body?.detail));
        ex.name = 'SetupReadFailure';throw ex;
      }
      const checked = validateOpsSetupList(body, PAGE_SIZE);
      if (controller.signal.aborted || sequence !== sequenceRef.current) return;
      setItems(old => cursor ? [...old, ...checked.items.filter(item =>
        !old.some(previous => previous.setupId === item.setupId))] : checked.items);
      setNextCursor(checked.nextCursor);
      setLoaded(true);
    } catch (cause) {
      if (controller.signal.aborted || sequence !== sequenceRef.current || cause?.name === 'AbortError') return;
      setError(cause?.name === 'SetupReadFailure' ? cause.message :
        'The setup list could not be verified. Previously loaded rows may be out of date.');
    } finally {
      if (controllerRef.current === controller && sequence === sequenceRef.current) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {sequenceRef.current += 1;controllerRef.current?.abort();};
  }, [load]);

  return (
    <section className="panel bid-log-list-card active-project-list-card" aria-label="Awaiting information">
      <div className="bid-log-list-heading">
        <div>
          <span className="section-kicker">PROJECT SETUP · SQL DRAFTS</span>
          <h2>Awaiting information</h2>
          <p className="bid-log-read-only-note">One record per intended awarded-bid child. No Cognito entry or job number has been created by this step.</p>
        </div>
        <div className="active-project-filter-actions">
          <button type="button" className="secondary-button" disabled={loading}
            onClick={() => void load()}>Refresh</button>
        </div>
      </div>
      {error && <p role="alert" className="bid-edit-message error">{error}</p>}
      {!loaded && loading && <p role="status" className="bid-log-read-only-note">Checking setup drafts…</p>}
      {loaded && items.length === 0 && !error &&
        <p role="status" className="bid-log-read-only-note">No setup drafts have been recorded yet. This does not mean all awarded bids are set up.</p>}
      {loaded && items.length > 0 && <>
        {loading && <p role="status" className="bid-log-read-only-note">Refreshing setup records…</p>}
        <div className="bid-log-table-wrap active-project-table-wrap">
          <table className="bid-log-table active-project-table">
            <thead><tr><th scope="col">Project</th><th scope="col">Original bid</th><th scope="col">Updated</th><th scope="col">Next action</th></tr></thead>
            <tbody>{items.map(item => <tr key={item.setupId}>
              <td><strong>{item.jobName?.trim() || 'Unnamed child job'}</strong>
                <small className="bid-log-read-only-note">Draft revision {item.revision} · Setup {item.setupId.slice(0,8)}…</small></td>
              <td>{item.originalBidLogId}</td>
              <td>{dateLabel(item.updatedAtUTC)}</td>
              <td>Awaiting information · Job number pending with Accounting</td>
            </tr>)}</tbody>
          </table>
        </div>
        {nextCursor && <button type="button" className="secondary-button"
          disabled={loading} onClick={() => void load(nextCursor)}>Load more</button>}
        {!nextCursor && <p className="bid-log-read-only-note">{items.length} setup drafts shown · End of list</p>}
      </>}
      <p className="bid-log-read-only-note">This view is read-only. Assigning a job number, creating the Cognito entry, and editing draft fields are not enabled in this release.</p>
    </section>
  );
}
