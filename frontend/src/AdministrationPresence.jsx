import {Fragment, useMemo, useState} from 'react';
import {groupPresenceSessions} from './administrationPresenceGrouping.mjs';
import './AdministrationPresence.css';

const APPS = {
  BID_LOG: 'Bid Log',
  ACCOUNTING: 'Accounting',
  OPERATIONS: 'Operations',
};

const STATUSES = {
  RECENT_ACTIVITY: 'Recent activity',
  RECENT_HEARTBEAT: 'Heartbeat only',
  IDLE_UNCONFIRMED: 'Idle / unconfirmed',
};

function ageLabel(last, observed) {
  const a = Date.parse(last);
  const b = Date.parse(observed);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 'Not recorded';
  const seconds = Math.round((b - a) / 1000);
  if (seconds < 60) return `${seconds} sec ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} hr ago`;
}

function lastSeen(last, observed) {
  if (!last) return 'No recorded heartbeat';
  const instant = new Date(last);
  if (!Number.isFinite(instant.getTime())) return 'Not recorded';
  if (Date.parse(observed) - instant.getTime() > 65 * 60 * 1000) {
    return `Last recorded ${instant.toLocaleString()}`;
  }
  return ageLabel(last, observed);
}

function PresenceState({status}) {
  return <span className={`administration-state ${status === 'RECENT_ACTIVITY' ? 'administration-state-good' : 'administration-state-neutral'}`}>
    {STATUSES[status] || status}
  </span>;
}

function GroupRow({group, observedAt, truncated}) {
  const [expanded, setExpanded] = useState(false);
  const latest = group.latest;
  const count = group.sessions.length;
  const detailId = `administration-presence-sessions-${group.appCode}-${group.eid}`;
  const appName = APPS[group.appCode] || group.appCode;

  return <Fragment>
    <tr>
      <td><strong>{latest.displayName}</strong><small className="administration-presence-secondary">EID {latest.eid} · {latest.appRole}</small></td>
      <td>{appName}</td>
      <td>{latest.currentPage || 'Not recorded'}</td>
      <td><PresenceState status={latest.status}/></td>
      <td>{ageLabel(latest.lastHeartbeatAtUTC, observedAt)}</td>
      <td>
        <button className="administration-presence-expand" type="button"
          aria-expanded={expanded} aria-controls={expanded ? detailId : undefined}
          aria-label={`${expanded ? 'Hide' : 'Show'} ${count} reported session${count === 1 ? '' : 's'} for ${latest.displayName} in ${appName}`}
          onClick={() => setExpanded(value => !value)}>
          {count} session{count === 1 ? '' : 's'} <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
        </button>
        {truncated && <small className="administration-presence-secondary">Showing returned records only</small>}
      </td>
    </tr>
    {expanded && <tr className="administration-presence-details-row" id={detailId}>
      <td colSpan="6" className="administration-presence-details-cell">
        <strong>{count} session report{count === 1 ? '' : 's'} for {latest.displayName} in {appName}</strong>
        <p>Most recent first. Individual browser sessions may be abandoned; these reports do not prove an active Microsoft login.</p>
        <ul className="administration-presence-session-list">
          {group.sessions.map((item, index) => <li key={index}>
            <span className="administration-presence-session-number">{index === 0 ? 'Latest' : `Earlier ${index + 1}`}</span>
            <span><small>Reported page</small><strong>{item.currentPage || 'Not recorded'}</strong></span>
            <span><small>Activity</small><PresenceState status={item.status}/></span>
            <span><small>Last signal</small><strong>{ageLabel(item.lastHeartbeatAtUTC, observedAt)}</strong></span>
            <span><small>Started</small><strong>{new Date(item.startedAtUTC).toLocaleString()}</strong></span>
          </li>)}
        </ul>
      </td>
    </tr>}
  </Fragment>;
}

export default function AdministrationPresence({presence}) {
  const [selectedApp, setSelectedApp] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const available = presence?.availability === 'AVAILABLE';
  const sessions = Array.isArray(presence?.sessions) ? presence.sessions : [];
  const apps = Array.isArray(presence?.apps) ? presence.apps : [];
  const observedAt = presence?.observedAtUTC;

  // Filters apply to the latest reported session for each employee/app.
  const rows = useMemo(() => groupPresenceSessions(sessions).filter(group => {
    const latest = group.latest;
    return (selectedApp === 'ALL' || latest.appCode === selectedApp) &&
      (selectedStatus === 'ALL' || latest.status === selectedStatus) &&
      `${latest.displayName} ${latest.eid} ${latest.currentPage || ''} ${APPS[latest.appCode] || ''}`
        .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  }), [sessions, selectedApp, selectedStatus, search]);

  const truncatedApps = new Set(apps.filter(item => item.truncated).map(item => item.appCode));

  return <section className="administration-section" aria-label="Live users">
    <div className="administration-section-heading">
      <h2>Who's using Riggs apps</h2>
      <span>Owner-only · live SQL session evidence</span>
    </div>
    {!available ? <div className="administration-message administration-message-warning" role="status">
      {presence?.availability === 'UNAVAILABLE'
        ? 'User presence could not be verified. Other monitoring remains available.'
        : 'Checking cross-application usage…'}
    </div> : <>
      <p className="administration-detail">
        Observed {new Date(observedAt).toLocaleString()} · Recent activity means a heartbeat and activity within 120 seconds.
        Sessions without a heartbeat for over 2 minutes are unconfirmed; only the last 65 minutes are listed.
        These are application reports, not verified Microsoft sign-in sessions.
      </p>
      <div className="administration-presence-apps">
        {apps.map(app => <article key={app.appCode} className="administration-tile administration-presence-app">
          <div className="administration-tile-head"><h3>{APPS[app.appCode] || app.appCode}</h3>
            <span className="administration-state administration-state-neutral">{app.recentUsers} recent user{app.recentUsers === 1 ? '' : 's'}</span>
          </div>
          <p className="administration-presence-count"><strong>{app.recentlyActiveSessions}</strong> recently active sessions</p>
          <p className="administration-tile-detail">{app.recentSessions} sessions in 65 minutes · {app.openSessions} not formally ended</p>
          <small>Last open-session signal: {lastSeen(app.lastOpenHeartbeatAtUTC, observedAt)}</small>
          {app.truncated && <small className="administration-presence-warning">Only the 50 most recent sessions are shown.</small>}
        </article>)}
      </div>
      <p className="administration-detail administration-presence-group-description">
        One row per employee per app, using the latest heartbeat. Activity and search filters apply to that latest report.
        Expand the session count to inspect individual browser reports. Counts describe returned records, not confirmed open logins.
      </p>
      <div className="administration-presence-controls">
        <label>Application
          <select value={selectedApp} onChange={event => setSelectedApp(event.target.value)}>
            <option value="ALL">All three apps</option>
            {Object.entries(APPS).map(([code,name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
        <label>Activity
          <select value={selectedStatus} onChange={event => setSelectedStatus(event.target.value)}>
            <option value="ALL">All recent signals</option>
            {Object.entries(STATUSES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label className="administration-presence-search">Find employee or page
          <input type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Search name, EID, or page" autoComplete="off" />
        </label>
      </div>
      <div className="administration-table-scroller">
        <table className="administration-table administration-presence-grouped-table">
          <thead><tr><th>Employee</th><th>Application</th><th>Current page</th><th>Activity</th><th>Last signal</th><th>Sessions shown</th></tr></thead>
          <tbody>{rows.length ? rows.map(group => <GroupRow key={group.key} group={group} observedAt={observedAt}
            truncated={truncatedApps.has(group.appCode)}/>) : <tr><td colSpan="6" className="administration-presence-empty">No recently reporting employees match these filters.</td></tr>}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
