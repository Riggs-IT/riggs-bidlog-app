import {useCallback, useEffect, useState} from 'react';
import {flowInventoryEvidence, flowRunEvidence} from './administrationPowerAutomateEvidence.mjs';
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
  const [environments, setEnvironments] = useState(null);
  const [environment, setEnvironment] = useState('');
  const [flowResult, setFlowResult] = useState(null);
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
    setEnvironments(null);
    setEnvironment('');
    setFlowResult(null);
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

  async function runRequest(kind, path, callback) {
    setLoading(kind); setError(null);
    try {
      const result = await readJson(path);
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

  // Existing owner-only backend returns {enabled:false} unless both consent
  // and secure server-side credential storage were separately provisioned.
  if (connection?.enabled === false) return null;
  if (!connection && !statusError) return null;

  const visibleEnvs = Array.isArray(environments?.environments) ? environments.environments : [];
  const inventory = flowInventoryEvidence(flowResult);
  const selectedRunEvidence = flowRunEvidence(runResult);

  return <section className="administration-section riggs-flow-monitor" id="administration-power-automate" aria-label="Power Automate monitoring">
    <div className="administration-section-heading">
      <h2>Power Automate</h2><span>User-authorized · read-only · on demand</span>
    </div>
    <p className="administration-detail">Flows and run history are scoped to the connected Microsoft account. Missing Dataverse environments, denied access, or bounded results never count as verified zero.</p>
    {statusError ? <p role="status" className="administration-message administration-message-warning">Power Automate connection could not be verified. {statusError}</p> : null}
    {connection?.enabled && <div className="riggs-flow-actions">
      <strong>{connection.connected ? 'Microsoft connection active' : 'Microsoft connection required'}</strong>
      {connection.connected ? <small>Connection expires {timestamp(connection.expiresAtUTC)}</small> : null}
      <button type="button" onClick={() => checkConnection()} disabled={Boolean(loading)}>Check connection</button>
      {!connection.connected && <a href={`${API}/connect`} target="_blank" rel="noopener noreferrer">Connect Power Automate</a>}
      {connection.connected && <button type="button" onClick={disconnect} disabled={Boolean(loading)}>Disconnect</button>}
    </div>}
    {connection?.connected && <>
      <div className="riggs-flow-actions">
        <button type="button" disabled={Boolean(loading)} onClick={() => runRequest('environments', '/environments', data => {
          setEnvironments(data); setEnvironment(''); setFlowResult(null); setRunResult(null); setSelectedFlow(null);
        })}>List accessible environments</button>
        {environments?.availability && <span>Coverage: {environments.availability}</span>}
      </div>
      {environments && visibleEnvs.length === 0 && <p role="status">{environments.availability === 'AVAILABLE' ? 'No accessible environments returned.' : 'Environment inventory not fully available.'}</p>}
      {visibleEnvs.length > 0 && <div className="riggs-flow-actions">
        <label htmlFor="riggs-flow-environment">Environment</label>
        <select id="riggs-flow-environment" value={environment} onChange={event => {
          setEnvironment(event.target.value); setFlowResult(null); setRunResult(null); setSelectedFlow(null);
        }}>
          <option value="">Choose an environment</option>
          {visibleEnvs.map(env => <option key={env.environmentId} value={env.environmentId}>{env.displayName}</option>)}
        </select>
        <button type="button" disabled={!environment || Boolean(loading)} onClick={() => runRequest('flows', `/environments/${encodeURIComponent(environment)}/flows`, data => {
          setFlowResult(data); setRunResult(null); setSelectedFlow(null);
        })}>Load flows</button>
      </div>}
      {flowResult && <>
        <p role="status">Flow inventory: {inventory.availability}. {inventory.count === null ? 'Count unverified.' : `${inventory.count} returned; ${inventory.isComplete ? 'selected environment response complete' : 'coverage may be incomplete'}.`}</p>
        {inventory.flows && <div className="administration-table-scroller">
          <table className="administration-table">
            <thead><tr><th>Flow</th><th>Platform state</th><th>Modified</th><th>Run history</th></tr></thead>
            <tbody>{inventory.flows.map(flow => <tr key={`${flow.environmentId}:${flow.workflowId}`}>
              <td><strong>{flow.name}</strong></td><td>{flow.platformState}</td><td>{timestamp(flow.modifiedAtUTC)}</td>
              <td><button type="button" disabled={Boolean(loading)} onClick={() => runRequest('runs', `/environments/${encodeURIComponent(flow.environmentId)}/flows/${encodeURIComponent(flow.workflowId)}/runs`, data => {
                setSelectedFlow(flow); setRunResult(data);
              })}>Recent runs</button></td>
            </tr>)}</tbody>
          </table>
        </div>}
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
