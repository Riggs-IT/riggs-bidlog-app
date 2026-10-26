import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  unifiedFlowInventoryEvidence, flowRunEvidence, flowDirectoryPage, flowDirectoryEnvironments,
} from './administrationPowerAutomateEvidence.mjs';
import './AdministrationPowerAutomate.css';

const API = '/api/admin/power-platform';
const BASE_HEADERS = {'Accept': 'application/json', 'Cache-Control': 'no-store'};
const SAFE_READ_ERRORS = new Set([
  'ACCESS_DENIED', 'THROTTLED', 'RECONNECT_REQUIRED', 'NETWORK_UNAVAILABLE',
  'UPSTREAM_UNAVAILABLE', 'INVALID_RESPONSE', 'RESPONSE_TOO_LARGE',
  'NO_DATAVERSE_OR_NOT_FOUND', 'UNEXPECTED_STATUS', 'INVALID_CONTINUATION_URL',
]);

async function readJson(path, {signal} = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: 'same-origin', cache: 'no-store', signal,
    headers: {...BASE_HEADERS, 'X-Riggs-Passive-Read': '1'},
  });
  if (response.status === 401) return {error: 'SESSION_EXPIRED'};
  if (response.status === 403) return {error: 'ADMIN_ACCESS_DENIED'};
  if (response.status === 409) return {error: 'RECONNECT_REQUIRED'};
  // The owner-only BFF returns sanitized upstream error codes in a 422 detail.
  if (response.status === 422) {
    try {
      const body = await response.json();
      return {error: SAFE_READ_ERRORS.has(body?.detail) ? body.detail : 'READ_UNAVAILABLE'};
    } catch { return {error: 'READ_UNAVAILABLE'}; }
  }
  if (!response.ok) return {error: 'READ_UNAVAILABLE'};
  try { return {data: await response.json()}; }
  catch { return {error: 'INVALID_RESPONSE'}; }
}

const timestamp = value => {
  if (typeof value !== 'string') return 'Not recorded';
  const when = new Date(value);
  return Number.isFinite(when.getTime()) ? when.toLocaleString() : 'Not recorded';
};

const visibleNow = () => typeof document !== 'undefined' && document.visibilityState === 'visible';

export default function AdministrationPowerAutomate({onSessionError}) {
  const sessionCallback = useRef(onSessionError);
  useEffect(() => { sessionCallback.current = onSessionError; }, [onSessionError]);

  const statusRequest = useRef(null);
  const inventoryRequest = useRef(null);
  const runsRequest = useRef(null);
  const connectionRef = useRef(null);
  const inventoryRef = useRef(null);
  const credentialRef = useRef(null);
  const [visible, setVisible] = useState(visibleNow);
  const [connection, setConnection] = useState(null);
  const [statusChecked, setStatusChecked] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [statusError, setStatusError] = useState(null);
  const [inventoryResult, setInventoryResult] = useState(null);
  const [inventoryPhase, setInventoryPhase] = useState('idle');
  const [lastInventoryReadAt, setLastInventoryReadAt] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [action, setAction] = useState('');
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const clearPrivateData = useCallback(() => {
    inventoryRequest.current?.abort();
    inventoryRequest.current = null;
    runsRequest.current?.abort();
    runsRequest.current = null;
    inventoryRef.current = null;
    credentialRef.current = null;
    setInventoryResult(null);
    setInventoryPhase('idle');
    setLastInventoryReadAt(null);
    setRunResult(null);
    setSelectedFlow(null);
    setAction(previous => previous === 'runs' ? '' : previous);
    setSearch('');
    setEnvironmentFilter('ALL');
    setPage(1);
  }, []);

  const handleReadError = useCallback(errorCode => {
    if (['SESSION_EXPIRED', 'ADMIN_ACCESS_DENIED', 'RECONNECT_REQUIRED'].includes(errorCode)) {
      clearPrivateData();
      connectionRef.current = null;
      setConnection(errorCode === 'RECONNECT_REQUIRED' ? {enabled: true, connected: false} : null);
      setStatusChecked(false);
      if (errorCode === 'SESSION_EXPIRED') {
        sessionCallback.current?.({status: 401, detail: 'authentication_required'});
      }
    }
    setError(errorCode || 'READ_UNAVAILABLE');
  }, [clearPrivateData]);

  const checkConnection = useCallback(async () => {
    // Parent App rerenders and passive Administration overview polls must not
    // retrigger this effect. Status reads are single-flight and visibility-bound.
    if (!visibleNow() || statusRequest.current) return;
    const controller = new AbortController();
    statusRequest.current = controller;
    setCheckingStatus(true);
    setStatusChecked(false);
    try {
      const result = await readJson('/status', {signal: controller.signal});
      if (controller.signal.aborted) return;
      if (result.error) {
        setStatusError(result.error);
        if (['SESSION_EXPIRED', 'ADMIN_ACCESS_DENIED', 'RECONNECT_REQUIRED'].includes(result.error)) {
          handleReadError(result.error);
        }
        return;
      }
      if (typeof result.data?.enabled !== 'boolean'
        || (result.data.enabled && typeof result.data.connected !== 'boolean')) {
        setStatusError('INVALID_RESPONSE');
        return;
      }
      setStatusError(null);
      setError(null);
      const next = result.data;
      const nextCredential = next.enabled && next.connected && typeof next.expiresAtUTC === 'string'
        ? next.expiresAtUTC : null;
      // A changed/expired Microsoft connection or a disabled feature revokes the
      // old inventory. Identical status responses never erase authorized data.
      if (!nextCredential || (credentialRef.current && credentialRef.current !== nextCredential)) {
        clearPrivateData();
      }
      credentialRef.current = nextCredential;
      connectionRef.current = next;
      setConnection(previous => previous?.connected === next.connected
        && previous?.enabled === next.enabled
        && previous?.expiresAtUTC === next.expiresAtUTC ? previous : next);
      setStatusChecked(true);
      setInventoryPhase(previous => previous === 'paused' && inventoryRef.current ? 'ready' : previous);
    } catch {
      if (!controller.signal.aborted) setStatusError('NETWORK_UNAVAILABLE');
    } finally {
      if (statusRequest.current === controller) {
        statusRequest.current = null;
        setCheckingStatus(false);
      }
    }
  }, [clearPrivateData, handleReadError]);

  useEffect(() => {
    const onVisibility = () => {
      const nowVisible = visibleNow();
      setVisible(nowVisible);
      if (!nowVisible) {
        statusRequest.current?.abort();
        statusRequest.current = null;
        inventoryRequest.current?.abort();
        inventoryRequest.current = null;
        runsRequest.current?.abort();
        runsRequest.current = null;
        setAction(previous => previous === 'runs' ? '' : previous);
        setCheckingStatus(false);
        setStatusChecked(false);
        setInventoryPhase(previous => ['loading', 'refreshing'].includes(previous) ? 'paused' : previous);
        return;
      }
      void checkConnection();
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      statusRequest.current?.abort();
      inventoryRequest.current?.abort();
      runsRequest.current?.abort();
      statusRequest.current = null;
      inventoryRequest.current = null;
      runsRequest.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [checkConnection]);

  const loadInventory = useCallback(async ({force = false} = {}) => {
    if (!visibleNow() || !connectionRef.current?.connected || inventoryRequest.current
      || (!force && inventoryRef.current)) return;
    const controller = new AbortController();
    inventoryRequest.current = controller;
    setInventoryPhase(inventoryRef.current ? 'refreshing' : 'loading');
    setError(null);
    try {
      const result = await readJson('/inventory', {signal: controller.signal});
      if (controller.signal.aborted) return;
      if (result.error) {
        handleReadError(result.error);
        if (!['SESSION_EXPIRED', 'ADMIN_ACCESS_DENIED', 'RECONNECT_REQUIRED'].includes(result.error)) {
          setInventoryPhase('error');
        }
      } else {
        const evidence = unifiedFlowInventoryEvidence(result.data);
        if (evidence.availability === 'UNVERIFIED' || !Array.isArray(evidence.flows)) {
          setInventoryPhase('error');
          setError('INVALID_RESPONSE');
        } else if (!['AVAILABLE', 'PARTIAL', 'UNVERIFIED_EMPTY'].includes(evidence.availability)) {
          // A provider failure is not a zero and must not overwrite last-good data.
          setInventoryPhase('error');
          setError(evidence.availability);
        } else {
          inventoryRef.current = result.data;
          setInventoryResult(result.data);
          setInventoryPhase('ready');
          setLastInventoryReadAt(new Date().toISOString());
          setPage(1);
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        setInventoryPhase('error');
        setError('NETWORK_UNAVAILABLE');
      }
    } finally {
      if (inventoryRequest.current === controller) inventoryRequest.current = null;
    }
  }, [handleReadError]);

  // One passive initial read after a verified connection. Never on every parent
  // render, every 60-second overview poll, or a routine identical status check.
  useEffect(() => {
    if (visible && statusChecked && !statusError && connection?.connected
      && !inventoryResult && ['idle', 'paused'].includes(inventoryPhase)) {
      void loadInventory();
    }
  }, [visible, statusChecked, statusError, connection?.connected, connection?.expiresAtUTC,
    inventoryResult, inventoryPhase, loadInventory]);

  const readRuns = async flow => {
    if (action || runsRequest.current || inventoryRequest.current || !visibleNow()) return;
    const controller = new AbortController();
    runsRequest.current = controller;
    setAction('runs');
    setError(null);
    try {
      const result = await readJson(
        `/environments/${encodeURIComponent(flow.environmentId)}/flows/${encodeURIComponent(flow.workflowId)}/runs`,
        {signal: controller.signal},
      );
      if (controller.signal.aborted) return;
      if (result.error) handleReadError(result.error);
      else { setSelectedFlow(flow); setRunResult(result.data); }
    } catch {
      if (!controller.signal.aborted) handleReadError('NETWORK_UNAVAILABLE');
    } finally {
      if (runsRequest.current === controller) {
        runsRequest.current = null;
        setAction('');
      }
    }
  };

  const disconnect = async () => {
    if (action || inventoryRequest.current || statusRequest.current) return;
    setAction('disconnect');
    setError(null);
    try {
      const response = await fetch(`${API}/disconnect`, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'X-Riggs-PowerPlatform-Action': 'disconnect'},
      });
      if (response.status === 401) handleReadError('SESSION_EXPIRED');
      else if (response.status === 403) handleReadError('ADMIN_ACCESS_DENIED');
      else if (!response.ok) setError('DISCONNECT_UNAVAILABLE');
      else {
        clearPrivateData();
        connectionRef.current = {enabled: true, connected: false};
        setConnection(connectionRef.current);
      }
    } catch { setError('NETWORK_UNAVAILABLE'); }
    finally { setAction(''); }
  };

  const inventory = useMemo(() => unifiedFlowInventoryEvidence(inventoryResult), [inventoryResult]);
  const environments = useMemo(() => flowDirectoryEnvironments(inventory.flows), [inventory.flows]);
  const directory = useMemo(() => flowDirectoryPage(inventory.flows, {
    search, environmentId: environmentFilter, page, pageSize,
  }), [inventory.flows, search, environmentFilter, page, pageSize]);
  const selectedRunEvidence = flowRunEvidence(runResult);
  const inventoryLoading = ['loading', 'refreshing'].includes(inventoryPhase);
  const busy = inventoryLoading || checkingStatus || Boolean(action);

  // Feature intentionally not installed in local dev or when server-disabled.
  if (connection?.enabled === false) return null;

  return <section className="administration-section riggs-flow-monitor" id="administration-power-automate" aria-label="Power Automate monitoring">
    <div className="administration-section-heading">
      <h2>Power Automate</h2><span>Read-only · signed-in Microsoft account</span>
    </div>
    {!connection && !statusError && <p role="status" className="riggs-flow-state">Checking Microsoft connection…</p>}
    {statusError && <div role="alert" className="administration-message administration-message-warning">
      Microsoft connection could not be verified: {statusError}.
      {inventoryResult ? ' Previously loaded results remain visible until access can be checked.' : ''}
      {!connection && <button type="button" onClick={() => void checkConnection()} disabled={checkingStatus}>Retry connection check</button>}
    </div>}
    {connection?.enabled && <div className="riggs-flow-actions riggs-flow-connection">
      <strong>{connection.connected ? 'Microsoft connection active' : 'Microsoft authorization required'}</strong>
      {connection.connected && <small>Expires {timestamp(connection.expiresAtUTC)}</small>}
      <button type="button" onClick={() => void checkConnection()} disabled={busy}>Check connection</button>
      {!connection.connected && <a href={`${API}/connect`} target="_blank" rel="noopener noreferrer">Authorize Power Automate</a>}
      {connection.connected && <button type="button" onClick={() => void disconnect()} disabled={busy}>Disconnect</button>}
    </div>}
    {connection?.connected && <>
      <div className="riggs-flow-directory-heading">
        <div>
          <strong>Flow directory</strong>
          <small>{inventoryResult ? `${inventory.flows.length} returned · Coverage: ${inventory.availability}`
            : 'Waiting for inventory evidence'}</small>
          {lastInventoryReadAt && <small>Checked {timestamp(lastInventoryReadAt)} · Sorted by last modification</small>}
        </div>
        <button type="button" onClick={() => void loadInventory({force: true})} disabled={busy || !visible || !statusChecked || Boolean(statusError)}>
          {inventoryLoading ? 'Loading…' : 'Reload flows'}
        </button>
      </div>
      {inventoryPhase === 'loading' && <p role="status" className="riggs-flow-state">Loading flow directory…</p>}
      {inventoryPhase === 'refreshing' && <p role="status" className="riggs-flow-state">Updating flow directory… Showing the previous results.</p>}
      {inventoryPhase === 'paused' && <p role="status" className="riggs-flow-state">Inventory paused while tab was hidden. Checking access before resuming.</p>}
      {inventoryResult && <>
        <div className="riggs-flow-directory-controls">
          <label>Find flow
            <input type="search" placeholder="Search flow or environment" value={search}
              onChange={event => {setSearch(event.target.value); setPage(1);}} />
          </label>
          <label>Environment
            <select value={environmentFilter} onChange={event => {setEnvironmentFilter(event.target.value); setPage(1);}}>
              <option value="ALL">All returned environments</option>
              {environments.map(env => <option value={env.id} key={env.id}>{env.name}</option>)}
            </select>
          </label>
          <label>Rows
            <select value={pageSize} onChange={event => {setPageSize(Number(event.target.value)); setPage(1);}}>
              <option value={25}>25</option><option value={50}>50</option>
            </select>
          </label>
        </div>
        <div className="riggs-flow-directory-summary" role="status">
          <span>Showing {directory.start}–{directory.end} of {directory.matched} returned matches</span>
          <span>{inventory.availability === 'PARTIAL' ? 'Partial inventory — more flows may exist' :
            inventory.availability === 'UNVERIFIED_EMPTY' ? 'No verified tenant-wide total' :
              'Coverage limited to checked providers'}</span>
        </div>
        {directory.rows.length > 0 ? <div className="administration-table-scroller">
          <table className="administration-table riggs-flow-directory-table">
            <thead><tr><th>Flow</th><th>Environment</th><th>State</th><th>Last modified</th><th>Run history</th></tr></thead>
            <tbody>{directory.rows.map(flow => <tr key={`${flow.environmentId}:${flow.workflowId}`}>
              <td><strong>{flow.name}</strong></td><td>{flow.environmentName}</td>
              <td>{flow.platformState}</td><td>{timestamp(flow.modifiedAtUTC)}</td>
              <td>{flow.runLookupVerified !== true
                ? <small title="Run lookup not verified">Not verified</small>
                : <button type="button" disabled={busy} onClick={() => void readRuns(flow)}>Recent runs</button>}</td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="riggs-flow-state">{inventory.flows.length ? 'No returned flows match these filters.' : inventory.message}</p>}
        {directory.pages > 1 && <div className="riggs-flow-pages" aria-label="Flow directory pages">
          <button type="button" disabled={directory.page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</button>
          <span>Page {directory.page} of {directory.pages}</span>
          <button type="button" disabled={directory.page >= directory.pages} onClick={() => setPage(p => Math.min(directory.pages, p + 1))}>Next</button>
        </div>}
        <details className="riggs-flow-details">
          <summary>Coverage and API diagnostics</summary>
          <p>{inventory.message} Last execution sorting is unavailable until actual run-history access is verified.</p>
          {inventory.providers?.length > 0 && <div aria-label="Microsoft flow inventory providers">
            {inventory.providers.map(provider => <p key={provider.provider}>
              {provider.provider === 'POWER_PLATFORM_TENANT_INVENTORY' ? 'Microsoft tenant inventory' : 'Environment flow reader'}:
              {' '}{provider.availability} · {provider.rows} returned{provider.hasMore ? ' · partial sample' : ''}
            </p>)}
          </div>}
          {inventory.environments?.length > 0 && <div aria-label="Environment coverage">
            {inventory.environments.map(env => <p key={env.environmentId}>
              {env.environmentName}: {env.flowsReturned === null ? env.availability : `${env.flowsReturned} returned`}
              {env.invalidRows ? ` · ${env.invalidRows} unreadable rows` : ''}
              {env.hasDataverse === false ? ' · Dataverse absent' : ''}
            </p>)}
          </div>}
          <p>Tenant-only entries show UNKNOWN state and Run lookup not verified; modified time does not prove a flow executed.</p>
        </details>
      </>}
      {runResult && <div className="riggs-flow-runs">
        <h3>{selectedFlow?.name || 'Selected flow'} — recent runs</h3>
        <p>Run evidence: {selectedRunEvidence.availability}. Last success in returned sample: {timestamp(selectedRunEvidence.lastSuccessInReturnedSampleUTC)}. Not a guaranteed lifetime last success.</p>
        {Array.isArray(runResult.runs) && <div className="administration-table-scroller">
          <table className="administration-table">
            <thead><tr><th>Run</th><th>Status</th><th>Started</th><th>Ended</th></tr></thead>
            <tbody>{runResult.runs.map(run => <tr key={run.runId}>
              <td className="administration-mono">{run.runId}</td><td>{run.status}</td><td>{timestamp(run.startedAtUTC)}</td><td>{timestamp(run.endedAtUTC)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </div>}
    </>}
    {error && <p role="alert" className="administration-message administration-message-warning">
      Power Automate request: {error}. Unavailable results are not treated as zero.
    </p>}
  </section>;
}
