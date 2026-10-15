import {useMemo, useState} from 'react';
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

export default function AdministrationPresence({presence}) {
  const [selectedApp, setSelectedApp] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const available = presence?.availability === 'AVAILABLE';
  const sessions = Array.isArray(presence?.sessions) ? presence.sessions : [];
  const apps = Array.isArray(presence?.apps) ? presence.apps : [];
  const observedAt = presence?.observedAtUTC;

  const rows = useMemo(() => sessions.filter(item =>
    (selectedApp === 'ALL' || item.appCode === selectedApp) &&
    (selectedStatus === 'ALL' || item.status === selectedStatus) &&
    `${item.displayName} ${item.eid} ${item.currentPage || ''} ${APPS[item.appCode] || ''}`
      .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  ), [sessions, selectedApp, selectedStatus, search]);

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
        <table className="administration-table">
          <thead><tr><th>Employee</th><th>Application</th><th>Current page</th><th>Activity</th><th>Last signal</th></tr></thead>
          <tbody>{rows.length ? rows.map((item,index) => <tr key={`${item.appCode}-${item.eid}-${item.lastHeartbeatAtUTC}-${index}`}>
            <td><strong>{item.displayName}</strong><small className="administration-presence-secondary">EID {item.eid} · {item.appRole}</small></td>
            <td>{APPS[item.appCode] || item.appCode}</td>
            <td>{item.currentPage || 'Not recorded'}</td>
            <td><span className={`administration-state ${item.status === 'RECENT_ACTIVITY' ? 'administration-state-good' : 'administration-state-neutral'}`}>{STATUSES[item.status] || item.status}</span></td>
            <td>{ageLabel(item.lastHeartbeatAtUTC, observedAt)}</td>
          </tr>) : <tr><td colSpan="5" className="administration-presence-empty">No recently reporting sessions match these filters.</td></tr>}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
