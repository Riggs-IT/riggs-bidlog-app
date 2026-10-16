const APPS = {
  ALL: 'All applications',
  BID_LOG: 'Bid Log',
  ACCOUNTING: 'Accounting',
  OPERATIONS: 'Operations',
};

function hours(seconds) {
  // Presentation only. The API and SQL preserve integer, heartbeat-credited
  // active seconds. No rounding is applied to an underlying financial metric.
  return (seconds / 3600).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

const integer = n => n.toLocaleString();

export default function AdministrationLeaderboard({
  leaderboard, days, appCode, loading, onDaysChange, onAppChange,
}) {
  const available = leaderboard?.availability === 'AVAILABLE'
    && leaderboard.windowDays === days && leaderboard.appCode === appCode;
  const employees = available ? leaderboard.employees : [];

  return <div className="administration-leaderboard">
    <div className="administration-leaderboard-controls">
      <label>Period
        <select aria-label="Leaderboard period" value={days}
          onChange={event => onDaysChange(Number(event.target.value))}>
          <option value={7}>Last 7 Arizona days</option>
          <option value={30}>Last 30 Arizona days</option>
          <option value={90}>Last 90 Arizona days</option>
        </select>
      </label>
      <label>Application
        <select aria-label="Leaderboard application" value={appCode}
          onChange={event => onAppChange(event.target.value)}>
          {Object.entries(APPS).map(([key, name]) =>
            <option key={key} value={key}>{name}</option>)}
        </select>
      </label>
    </div>
    <p className="administration-detail administration-leaderboard-explanation">
      Rankings use heartbeat-credited active-use time from sessions that <strong>started</strong> in the selected Arizona-day period.
      Concurrent browser tabs and applications can overlap; totals are <strong>not deduplicated</strong>.
      This is recorded application activity, not employee productivity or hours worked.
    </p>
    {loading || !leaderboard ? <div className="administration-message" role="status">
      Checking recorded activity…
    </div> : !available ? <div className="administration-message administration-message-warning" role="status">
      Usage leaderboard could not be verified. Other Administration information remains available.
    </div> : <>
      <p className="administration-detail">Observed {new Date(leaderboard.observedAtUTC).toLocaleString()}
        {' · '}Window starts {leaderboard.windowStartArizonaDate} (Arizona)
        {' · '}Only sessions started during this window are included.
      </p>
      <div className="administration-leaderboard-metrics">
        <article className="administration-tile administration-leaderboard-metric">
          <span>Recorded active-use hours</span><strong>{hours(leaderboard.totalRecordedActiveSeconds)}</strong>
          <small>Heartbeat-credited, potentially overlapping</small>
        </article>
        <article className="administration-tile administration-leaderboard-metric">
          <span>Employees</span><strong>{integer(leaderboard.totalEmployees)}</strong>
          <small>With records in this period</small>
        </article>
        <article className="administration-tile administration-leaderboard-metric">
          <span>Session records</span><strong>{integer(leaderboard.totalSessions)}</strong>
          <small>Not sign-ins or verified browser closures</small>
        </article>
        <article className="administration-tile administration-leaderboard-metric">
          <span>Potentially overlapping sessions</span><strong>{integer(leaderboard.totalPossibleOverlapSessions)}</strong>
          <small>Window overlap warning, not duplicated active seconds</small>
        </article>
      </div>
      {leaderboard.totalPossibleOverlapSessions > 0 &&
        <p className="administration-leaderboard-caveat" role="note">
          Some session windows overlap. Recorded hours may count simultaneous activity more than once;
          we cannot precisely subtract duplicated time from the historical session totals.
        </p>}
      {(leaderboard.carryInSessions > 0 || leaderboard.excludedInvalidSessions > 0 || leaderboard.employeesTruncated) &&
        <p className="administration-leaderboard-caveat" role="note">
          {leaderboard.carryInSessions > 0 && `${integer(leaderboard.carryInSessions)} session(s) started before the period and are excluded. `}
          {leaderboard.excludedInvalidSessions > 0 && `${integer(leaderboard.excludedInvalidSessions)} invalid session(s) were excluded. `}
          {leaderboard.employeesTruncated && `Showing the top ${leaderboard.employeeLimit} employees only. `}
        </p>}
      <div className="administration-table-scroller">
        <table className="administration-table administration-leaderboard-table">
          <thead><tr><th>Rank</th><th>Employee</th><th>Recorded hours</th><th>Sessions</th><th>Apps used</th><th>Overlap warning</th></tr></thead>
          <tbody>{employees.length ? employees.map(person => <tr key={person.eid}>
            <td className="administration-leaderboard-rank">#{person.rank}</td>
            <td><strong>{person.displayName || `Employee ${person.eid}`}</strong>
              <small className="administration-leaderboard-secondary">EID {person.eid}</small></td>
            <td className="administration-leaderboard-hours">{hours(person.recordedActiveSeconds)} h</td>
            <td>{integer(person.sessionCount)}</td>
            <td>{integer(person.appsUsed)}</td>
            <td>{person.possibleOverlapSessions > 0
              ? `${integer(person.possibleOverlapSessions)} possible overlap${person.possibleOverlapSessions === 1 ? '' : 's'}`
              : 'None flagged'}</td>
          </tr>) : <tr><td colSpan="6" className="administration-presence-empty">
            No recorded sessions for this selection.
          </td></tr>}</tbody>
        </table>
      </div>
      <p className="administration-detail">Tied hours share the same rank; rows are then ordered by employee ID.
        No session histories, emails, or Microsoft identifiers are included in this view.</p>
    </>}
  </div>;
}
