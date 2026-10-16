import {useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react';
import './AdministrationDashboard.css';
import AdministrationUsagePanel from './AdministrationUsagePanel.jsx';

const LABELS = {
  current_project_summary: 'Current projects · summary',
  current_project_monthly_bulk: 'Current projects · monthly',
  current_project_primary_projection: 'Primary PM projection',
  active_bid_dashboard: 'Active bids',
  portfolio_balance: 'Portfolio review',
  schedule_review: 'Schedule review',
};

export function displayUTC(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Not recorded';
}

const humanSeconds = value =>
  typeof value === 'number' && Number.isFinite(value)
    ? `${value.toLocaleString()} sec` : 'Not recorded';

function State({value}) {
  const status = String(value || 'UNVERIFIED').toUpperCase();
  const tone = ['AVAILABLE', 'CONNECTED', 'FRESH', 'COMPLETE', 'ENABLED'].includes(status)
    ? 'good'
    : ['STALE', 'RUNNING', 'IDLE', 'UNVERIFIED', 'DISABLED'].includes(status)
      ? 'neutral' : 'attention';
  return <span className={`administration-state administration-state-${tone}`}>{status.replaceAll('_', ' ')}</span>;
}

function HealthCard({name, service, detail}) {
  return (
    <article className="administration-tile">
      <div className="administration-tile-head"><h3>{name}</h3><State value={service?.state}/></div>
      <p className="administration-tile-detail">{detail}</p>
      {service?.reasonCode && <small>Check: {service.reasonCode}</small>}
    </article>
  );
}

const QUEUE_LABELS = {
  accounting_tickets: 'Accounting · SharePoint tickets',
  cognito_staffing: 'Cognito · staffing',
  job_cognito: 'Cognito · job updates',
  job_sharepoint: 'SharePoint · job updates',
  ordering_center: 'SharePoint · ordering center',
  project_forecast: 'Project forecast',
};

const displayCount = value => Number.isSafeInteger(value) && value >= 0
  ? value.toLocaleString() : 'Not collected';

export function AdministrationView({
  overview, presence, leaderboard, usageMode = 'LIVE', leaderboardDays = 30,
  leaderboardApp = 'ALL', usageLoading = false,
  onUsageModeChange = () => {}, onLeaderboardDaysChange = () => {},
  onLeaderboardAppChange = () => {},
}) {
  const services = overview?.services || {};
  const cache = overview?.cache || {};
  const refresh = cache.refresh || {};
  const policy = cache.policy || {};
  const datasets = Array.isArray(cache.datasets) ? cache.datasets : [];
  const monitoring = overview?.monitoring || {};
  const usage = monitoring.usage || {};
  const queueRows = Array.isArray(monitoring.queues) ? monitoring.queues : [];
  const reconciler = monitoring.reconciliation || {};
  const started = refresh.startedAtUTC ? Date.parse(refresh.startedAtUTC) : NaN;
  const finished = refresh.finishedAtUTC ? Date.parse(refresh.finishedAtUTC) : NaN;
  const elapsed = Number.isFinite(started) && Number.isFinite(finished) && finished >= started
    ? `${((finished - started) / 1000).toFixed(0)} sec (timestamp resolution)` : 'Not recorded';

  return <>
    <section className="administration-section" aria-label="System health">
      <div className="administration-section-heading"><h2>System health</h2><span>Readiness observations, not uptime history</span></div>
      <div className="administration-tiles">
        <HealthCard name="Bid Log" service={services.bidLog} detail="This application responded to the owner-only request." />
        <HealthCard name="Data API" service={services.dataApi} detail="Cloudflare-protected bridge readiness check." />
        <HealthCard name="SQL Server" service={services.sql} detail="SQL readiness reported by the bridge; not a full query audit." />
      </div>
      <p className="administration-detail">Cloud Run revision: <strong>{services.bidLog?.cloudRunRevision || 'Not available locally'}</strong>. App version: {services.bidLog?.appVersion || 'Unknown'}.</p>
    </section>

    <AdministrationUsagePanel
      presence={presence} leaderboard={leaderboard} mode={usageMode}
      days={leaderboardDays} appCode={leaderboardApp} loading={usageLoading}
      onModeChange={onUsageModeChange} onDaysChange={onLeaderboardDaysChange}
      onAppChange={onLeaderboardAppChange} />

    <section className="administration-section" aria-label="Shared dashboard cache">
      <div className="administration-section-heading"><h2>Shared dashboard cache</h2><span>Current process-local snapshot · no historical ledger</span></div>
      {cache.availability === 'AVAILABLE' ? <>
        <div className="administration-tiles administration-tiles-two">
          <article className="administration-tile">
            <div className="administration-tile-head"><h3>Last coordinated rebuild</h3><State value={refresh.status}/></div>
            <dl className="administration-facts">
              <div><dt>Datasets completed</dt><dd>{refresh.completedDatasets ?? 'Unknown'} / {refresh.totalDatasets ?? 'Unknown'}</dd></div>
              <div><dt>Started</dt><dd>{displayUTC(refresh.startedAtUTC)}</dd></div>
              <div><dt>Finished</dt><dd>{displayUTC(refresh.finishedAtUTC)}</dd></div>
              <div><dt>Measured from timestamps</dt><dd>{elapsed}</dd></div>
              <div><dt>Failed datasets</dt><dd>{refresh.failedDatasetKeys?.length ?? 'Unknown'}</dd></div>
              <div><dt>Run ID</dt><dd className="administration-mono">{refresh.runId || 'Not recorded'}</dd></div>
            </dl>
          </article>
          <article className="administration-tile">
            <div className="administration-tile-head"><h3>Cache policy</h3><span className="administration-state administration-state-neutral">READ ONLY</span></div>
            <dl className="administration-facts">
              <div><dt>Soft TTL</dt><dd>{humanSeconds(policy.ttlSeconds)}</dd></div>
              <div><dt>Hard stale limit</dt><dd>{humanSeconds(policy.maxStaleSeconds)}</dd></div>
              <div><dt>Global manual cooldown</dt><dd>{humanSeconds(policy.manualCooldownSeconds)}</dd></div>
              <div><dt>Per-user cooldown</dt><dd>{humanSeconds(policy.perUserCooldownSeconds)}</dd></div>
            </dl>
          </article>
        </div>
        <div className="administration-table-scroller">
          <table className="administration-table">
            <thead><tr><th>Dataset</th><th>Current state</th><th>Age</th><th>Last updated</th><th>Last error type</th></tr></thead>
            <tbody>{datasets.map(item => <tr key={item.key}>
              <td><strong>{LABELS[item.key] || item.key}</strong></td>
              <td><State value={item.state}/></td>
              <td>{humanSeconds(item.ageSeconds)}</td>
              <td>{displayUTC(item.updatedAtUTC)}</td>
              <td>{item.errorType || '—'}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </> : <div className="administration-message administration-message-warning" role="status">
        Cache status could not be verified. {cache.reasonCode ? `Reason: ${cache.reasonCode}` : 'No current snapshot is available.'}
      </div>}
    </section>

    <section className="administration-section" aria-label="Usage and automatic closeout">
      <div className="administration-section-heading"><h2>Usage and session closeout</h2><span>SQL aggregate · no person-level tracking shown</span></div>
      {monitoring.availability === 'AVAILABLE' ? <>
        <p className="administration-detail">Observed {displayUTC(monitoring.observedAtUTC)} · Active means a heartbeat within {usage.activeDefinitionSeconds} seconds, not proof someone is at their desk.</p>
        <div className="administration-metrics">
          <article className="administration-tile administration-metric"><span>Recently heartbeating</span><strong>{displayCount(usage.recentlyActiveSessions)}</strong><small>Last 120 seconds</small></article>
          <article className="administration-tile administration-metric"><span>Open records</span><strong>{displayCount(usage.openSessions)}</strong><small>{displayCount(usage.totalSessions)} total session records</small></article>
          <article className="administration-tile administration-metric"><span>Eligible for closeout</span><strong>{displayCount(usage.eligibleForCloseout)}</strong><small>65-minute cutoff, timestamp checks</small></article>
          <article className="administration-tile administration-metric"><span>Already finalized</span><strong>{displayCount(usage.endedSessions)}</strong><small>{displayCount(usage.heartbeatExpiredSessions)} heartbeat expired · {displayCount(usage.endedLast24Hours)} ended within 24 hours</small></article>
        </div>
        <div className="administration-tiles administration-tiles-two administration-reconciler">
          <article className="administration-tile">
            <div className="administration-tile-head"><h3>Automatic closeout</h3><State value={reconciler.enabled ? 'ENABLED' : 'DISABLED'}/></div>
            <dl className="administration-facts">
              <div><dt>Run interval</dt><dd>{humanSeconds(reconciler.intervalSeconds)}</dd></div>
              <div><dt>Maximum per run</dt><dd>{displayCount(reconciler.batchLimit)} sessions</dd></div>
              <div><dt>Idle eligibility</dt><dd>{displayCount(reconciler.minimumIdleMinutes)} minutes</dd></div>
              <div><dt>Last successful scheduler run</dt><dd>Not collected</dd></div>
            </dl>
          </article>
          <article className="administration-tile">
            <div className="administration-tile-head"><h3>Session interpretation</h3><span className="administration-state administration-state-neutral">READ ONLY</span></div>
            <p className="administration-tile-detail">A missing heartbeat may mean a closed tab, disconnected network, or sleeping computer. Reconciliation uses <strong>heartbeat_expired</strong>, not a confirmed browser-close reason.</p>
            <p className="administration-tile-detail">Totals reflect current SQL rows. They are not a per-user performance report.</p>
          </article>
        </div>
      </> : <div className="administration-message administration-message-warning" role="status">
        Usage status unavailable. {monitoring.reasonCode ? `Reason: ${monitoring.reasonCode}` : 'No verified SQL aggregate.'}
      </div>}
    </section>

    <section className="administration-section" aria-label="Worker queue evidence">
      <div className="administration-section-heading"><h2>Worker queues</h2><span>Durable SQL outboxes · not Docker process monitoring</span></div>
      {monitoring.availability === 'AVAILABLE' ? <>
        <div className="administration-table-scroller">
          <table className="administration-table">
            <thead><tr><th>Queue lane</th><th>Pending</th><th>Processing</th><th>Failed</th><th>Oldest pending</th><th>Last processed event</th></tr></thead>
            <tbody>{queueRows.map(item => <tr key={item.laneKey}>
              <td><strong>{QUEUE_LABELS[item.laneKey] || item.laneKey}</strong></td>
              <td>{displayCount(item.pendingCount)}</td>
              <td>{displayCount(item.processingCount)}</td>
              <td>{displayCount(item.failedCount)}</td>
              <td>{displayUTC(item.oldestPendingAtUTC)}</td>
              <td>{displayUTC(item.latestProcessedAtUTC)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="administration-detail">An empty queue does not prove a worker is running. Process health is not collected here; last processed timestamps are historical evidence only.</p>
      </> : <div className="administration-message administration-message-warning" role="status">Queue status not verified.</div>}
    </section>

    <section className="administration-section" aria-label="Instrumentation not yet collected">
      <div className="administration-section-heading"><h2>Coming in a later monitoring stage</h2><span>Not connected · not zero</span></div>
      <div className="administration-pending">
        {(overview.notCollected || []).map(item => <div key={item}>
          <span>{item}</span><small>Not connected</small>
        </div>)}
      </div>
    </section>
  </>;
}

export default function AdministrationDashboard({onSessionError, refreshApiRef, onBusyChange}) {
  const [overview, setOverview] = useState(null);
  const [presence, setPresence] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [usageMode, setUsageMode] = useState('LIVE');
  const [leaderboardDays, setLeaderboardDays] = useState(30);
  const [leaderboardApp, setLeaderboardApp] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const [usageBusy, setUsageBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(null);
  const usagePending = useRef(null);
  const selection = useRef({mode: 'LIVE', days: 30, appCode: 'ALL'});
  const sessionCallback = useRef(onSessionError);
  useEffect(() => { sessionCallback.current = onSessionError; }, [onSessionError]);
  useEffect(() => {
    onBusyChange?.(busy || usageBusy);
    return () => onBusyChange?.(false);
  }, [busy, usageBusy, onBusyChange]);

  const loadUsage = useCallback(async ({mode, days, appCode}) => {
    usagePending.current?.abort();
    const controller = new AbortController();
    usagePending.current = controller;
    setUsageBusy(true);
    if (mode === 'LIVE') setPresence(null);
    else setLeaderboard(null);
    const isLive = mode === 'LIVE';
    try {
      const options = {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: {'Accept': 'application/json', 'X-Riggs-Passive-Read': '1'},
        signal: controller.signal,
      };
      const response = isLive ? await fetch('/api/admin/presence', options)
        : await fetch(`/api/admin/leaderboard?days=${days}&app=${encodeURIComponent(appCode)}`, options);
      if (response.status === 401) sessionCallback.current?.({status: 401, detail: 'authentication_required'});
      if (response.status === 403) throw new Error('Administration access was denied.');
      if (!response.ok) throw new Error('Usage evidence unavailable');
      const result = await response.json();
      if (result?.readOnly !== true || !['AVAILABLE', 'UNAVAILABLE'].includes(result.availability)
          || (!isLive && result.availability === 'AVAILABLE' &&
              (result.windowDays !== days || result.appCode !== appCode ||
               result.metric !== 'HEARTBEAT_CREDITED_ACTIVE_SECONDS' ||
               !Array.isArray(result.employees)))) {
        throw new Error('Invalid usage response');
      }
      if (!controller.signal.aborted) {
        if (isLive) setPresence(result);
        else setLeaderboard(result);
      }
    } catch (exc) {
      // Never convert an unavailable / denied read into an empty success.
      if (!controller.signal.aborted) {
        const unavailable = {availability: 'UNAVAILABLE', readOnly: true};
        if (isLive) setPresence(unavailable);
        else setLeaderboard(unavailable);
      }
    } finally {
      if (!controller.signal.aborted) setUsageBusy(false);
    }
  }, []);

  const checkStatus = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/overview', {
        method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: {'Accept': 'application/json', 'X-Riggs-Passive-Read': '1'},
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 401) sessionCallback.current?.({status: 401, detail: 'authentication_required'});
        if (response.status === 403) throw new Error('Administration access was denied.');
        throw new Error('Unable to check the monitoring services. Try again.');
      }
      const payload = await response.json();
      if (payload?.readOnly !== true || !payload?.services || !payload?.cache) {
        throw new Error('The monitoring service returned an invalid response.');
      }
      if (!controller.signal.aborted) {
        setOverview(payload);
        await loadUsage(selection.current);
      }
    } catch (exc) {
      if (!controller.signal.aborted) {
        setOverview(null);
        setError(exc.message || 'Unable to check monitoring status.');
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [loadUsage]);

  const changeUsageMode = useCallback(mode => {
    if (!['LIVE', 'LEADERBOARD'].includes(mode) || selection.current.mode === mode) return;
    selection.current = {...selection.current, mode};
    setUsageMode(mode);
    void loadUsage(selection.current);
  }, [loadUsage]);

  const changeLeaderboardDays = useCallback(days => {
    if (![7, 30, 90].includes(days) || selection.current.days === days) return;
    selection.current = {...selection.current, days};
    setLeaderboardDays(days);
    if (selection.current.mode === 'LEADERBOARD') void loadUsage(selection.current);
  }, [loadUsage]);

  const changeLeaderboardApp = useCallback(appCode => {
    if (!['ALL', 'BID_LOG', 'ACCOUNTING', 'OPERATIONS'].includes(appCode)
        || selection.current.appCode === appCode) return;
    selection.current = {...selection.current, appCode};
    setLeaderboardApp(appCode);
    if (selection.current.mode === 'LEADERBOARD') void loadUsage(selection.current);
  }, [loadUsage]);

  useImperativeHandle(refreshApiRef, () => ({refresh: checkStatus}), [checkStatus]);

  useEffect(() => {
    void checkStatus();
    return () => { pending.current?.abort(); usagePending.current?.abort(); };
  }, [checkStatus]);

  return <main className="page-shell administration-page">
    <div className="administration-heading">
      <div>
        <p className="administration-eyebrow">PRIVATE · READ ONLY</p>
        <h1>Administration</h1>
        <p className="administration-subtitle">Current Riggs services, cache, usage sessions, and queue evidence.</p>
      </div>
    </div>
    {error && <div className="administration-message administration-message-warning" role="alert">{error}</div>}
    {overview ? <>
      <p className="administration-observed">Observed {displayUTC(overview.observedAtUTC)} · Data reflects this check only; no automatic polling.</p>
      <AdministrationView overview={overview} presence={presence} leaderboard={leaderboard}
        usageMode={usageMode} leaderboardDays={leaderboardDays} leaderboardApp={leaderboardApp}
        usageLoading={usageBusy} onUsageModeChange={changeUsageMode}
        onLeaderboardDaysChange={changeLeaderboardDays} onLeaderboardAppChange={changeLeaderboardApp} />
    </> : !error && <div className="administration-message">Checking current status…</div>}
  </main>;
}
