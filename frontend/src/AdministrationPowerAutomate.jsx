import {useCallback, useEffect, useMemo, useState} from 'react';
import {unifiedFlowInventoryEvidence, flowRunEvidence} from './administrationPowerAutomateEvidence.mjs';
import './AdministrationPowerAutomate.css';

const API = '/api/admin/power-platform';
const BASE_HEADERS = {'Accept': 'application/json', 'Cache-Control': 'no-store'};

async function readJson(path, {signal, passive = false} = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: 'same-origin', cache: 'no-store', signal,
    headers: {...BASE_HEADERS, ...(passive ? {'X-Riggs-Passive-Read': '1'} : {})},
  });
  if (response.status === 401) return {error: 'SESSION_EXPIRED'};
  if (response.status === 409) return {error: 'RECONNECT_REQUIRED'};
  if (!response.ok) return {error: 'READ_UNAVAILABLE'};
  try { return {data: await response.json()}; }
  catch { return {error: 'INVALID_RESPONSE'}; }
}

const timestamp = value => {
  if (typeof value !== 'string') return 'Not recorded';
  const when = new Date(value);
  return Number.isFinite(when.getTime()) ? when.toLocaleString() : 'Not recorded';
};

export default function AdministrationPowerAutomate({onSessionError}) {
  const [connection, setConnection] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [inventoryResult, setInventoryResult] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState(null);

  const handleResponseError = useCallback(errorCode => {
    if (errorCode === 'SESSION_EXPIRED') onSessionError?.();
    setError(errorCode || 'READ_UNAVAILABLE');
  }, [onSessionError]);

  const checkConnection = useCallback(async signal => {
    const result = await readJson('/status', {signal, passive: true});
    if (signal?.aborted) return;
    if (result.error) {
      if (result.error === 'SESSION_EXPIRED') onSessionError?.();
      setStatusError(result.error); return;
    }
    setStatusError(null);
    setConnection(result.data);
    setInventoryResult(null);
    setRunResult(null);
    setSelectedFlow(null);
  }, [onSessionError]);

  useEffect(() => {
    let controller = null;
    function onVisibility() {
      if (controller) controller.abort();
      controller = null;
      if (document.visibilityState !== 'visible') return;
      controller = new AbortController();
      const current = controller;
      checkConnection(current.signal).catch(() => {
        if (!current.signal.aborted) setStatusError('READ_UNAVAILABLE');
      });
    }
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (controller) controller.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [checkConnection]);

  // One bounded, passive inventory read after confirming an existing connection.
  // No extra environment picker, manual per-environment clicks or background polling.
  useEffect(() => {
    if (!connection?.connected || document.visibilityState !== 'visible') return;
    let controller = new AbortController();
    const stopWhenHidden = () => {
      if (document.visibilityState !== 'visible') controller.abort();
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    setLoading('inventory');
    setError(null);
    readJson('/inventory', {signal: controller.signal, passive: true})
      .then(result => {
        if (controller.signal.aborted) return;
        if (result.error) handleResponseError(result.error);
        else setInventoryResult(result.data);
      })
      .catch(() => { if (!controller.signal.aborted) handleResponseError('NETWORK_UNAVAILABLE'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(''); });
    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', stopWhenHidden);
    };
  }, [connection, handleResponseError]);

  async function runRequest(kind, path, callback) {
    setLoading(kind); setError(null);
    try {
      const result = await readJson(path, {passive: true});
      if (result.error) handleResponseError(result.error);
      else callback(result.data);
    } catch { handleResponseError('NETWORK_UNAVAILABLE'); }
    finally { setLoading(''); }
  }

  async function disconnect() {
    setLoading('disconnect'); setError(null);
    try {
      const response = await fetch(`${API}/disconnect`, {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: {'X-Riggs-PowerPlatform-Action': 'disconnect'},
      });
      if (response.status === 401) handleResponseError('SESSION_EXPIRED');
      else if (!response.ok) handleResponseError('DISCONNECT_UNAVAILABLE');
      else await checkConnection();
    } catch { handleResponseError('NETWORK_UNAVAILABLE'); }
    finally { setLoading(''); }
  }

  const inventory = useMemo(() => unifiedFlowInventoryEvidence(inventoryResult), [inventoryResult]);
  const selectedRunEvidence = flowRunEvidence(runResult);

  if (connection?.enabled === false) return null;
  if (!connection && !statusError) return null;

  return <section className="administration-section riggs-flow-monitor" id="administration-power-automate" aria-label="Power Automate monitoring">
    <div className="administration-section-heading">
      <h2>Power Automate</h2><span>Accessible environments · read-only · bounded</span>
    </div>
    <p className="administration-detail">Cloud flows from environments accessible to your Microsoft identity. This Power Platform API may miss non-Dataverse or differently owned flows. Zero returned here does not prove zero Power Automate flows exist.</p>
    {statusError ? <p role="status" className="administration-message administration-message-warning">Power Automate connection could not be verified. {statusError}</p> : null}
    {connection?.enabled && <div className="riggs-flow-actions">
      <strong>{connection.connected ? 'Microsoft connection active' : 'Microsoft authorization required'}</strong>
      {connection.connected ? <small>Access expires {timestamp(connection.expiresAtUTC)}</small> : null}
      <button type="button" onClick={() => checkConnection()} disabled={Boolean(loading)}>Check connection</button>
      {!connection.connected && <a href={`${API}/connect`} target="_blank" rel="noopener noreferrer">Authorize Power Automate</a>}
      {connection.connected && <button type="button" onClick={disconnect} disabled={Boolean(loading)}>Disconnect</button>}
    </div>}
    {connection?.connected && <>
      <div className="riggs-flow-actions">
        <strong>Flows across accessible environments</strong>
        <button type="button" disabled={Boolean(loading)} onClick={() => runRequest('inventory', '/inventory', data => {
          setInventoryResult(data); setRunResult(null); setSelectedFlow(null);
        })}>{loading === 'inventory' ? 'Checking…' : 'Reload flows'}</button>
        {inventoryResult && <span>Coverage: {inventory.availability}</span>}
      </div>
      {inventoryResult && <>
        <p role="status">{inventory.message}</p>
        {inventory.providers?.length > 0 && <div className="riggs-flow-actions" aria-label="Microsoft flow inventory providers">
          {inventory.providers.map(p => <small key={p.provider}>
            {p.provider === 'POWER_PLATFORM_TENANT_INVENTORY' ? 'Microsoft tenant inventory' : 'Environment flow reader'}:
            {' '}{p.availability} · {p.rows} returned{p.hasMore ? ' · partial sample' : ''}
          </small>)}
        </div>}
        {inventory.environments?.length > 0 && <div className="riggs-flow-actions" aria-label="Environment coverage">
          {inventory.environments.map(env => <small key={env.environmentId}>
            {env.environmentName}: {env.flowsReturned === null ? env.availability : `${env.flowsReturned} returned`}
            {typeof env.upstreamRowsSeen === 'number' ? ` · ${env.upstreamRowsSeen} API rows` : ''}{env.invalidRows ? ` · ${env.invalidRows} unreadable rows` : ''}{env.hasDataverse === false ? ' · Dataverse absent' : ''}
          </small>)}
        </div>}
        {inventory.flows?.length > 0 && <>
          <p className="administration-detail">Recently modified first. Last execution order cannot be verified until run history is checked; individual run reads remain on demand.</p>
          <div className="administration-table-scroller">
            <table className="administration-table">
              <thead><tr><th>Flow</th><th>Environment</th><th>State</th><th>Last modified</th><th>Run history</th></tr></thead>
              <tbody>{inventory.flows.map(flow => <tr key={`${flow.environmentId}:${flow.workflowId}`}>
                <td><strong>{flow.name}</strong></td><td>{flow.environmentName}</td>
                <td>{flow.platformState}</td><td>{timestamp(flow.modifiedAtUTC)}</td>
                <td>{flow.runLookupVerified === false
                  ? <small>Run lookup not verified</small>
                  : <button type="button" disabled={Boolean(loading)} onClick={() => runRequest('runs', `/environments/${encodeURIComponent(flow.environmentId)}/flows/${encodeURIComponent(flow.workflowId)}/runs`, data => {
                    setSelectedFlow(flow); setRunResult(data);
                  })}>Recent runs</button>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
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
    {error && <p role="alert" className="administration-message administration-message-warning">Power Automate request: {error}. No unavailable values are treated as zero.</p>}
  </section>;
}
