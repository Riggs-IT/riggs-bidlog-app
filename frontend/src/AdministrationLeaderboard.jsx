import {useMemo} from 'react';

const APPS = {
  ALL: 'All applications', BID_LOG: 'Bid Log', ACCOUNTING: 'Accounting',
  OPERATIONS: 'Operations',
};

const PERIODS = [[7, 'Last 7 days'], [30, 'Last 30 days'],
  [90, 'Last 90 days'], [0, 'All Time']];
const MEDALS = ['🥇', '🥈', '🥉'];
const POSITIONS = ['1st', '2nd', '3rd'];

function hours(seconds) {
  return (seconds / 3600).toLocaleString(undefined, {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}
const count = number => number.toLocaleString();

function PodiumPerson({person, place}) {
  if (!person) return <div className="administration-podium-empty" aria-hidden="true" />;
  const standing = Math.min(person.rank, 3); // Honor shared ranks when activity hours tie.
  return <article className={`administration-podium-person place-${standing}`}>
    <div className="administration-podium-medal" aria-hidden="true">{MEDALS[standing - 1]}</div>
    <strong className="administration-podium-name">{person.displayName || `Employee ${person.eid}`}</strong>
    <span className="administration-podium-hours">{hours(person.recordedActiveSeconds)} <small>hrs</small></span>
    <small className="administration-podium-meta">{count(person.sessionCount)} sessions · {count(person.appsUsed)} apps</small>
    <div className="administration-podium-step" aria-label={`${POSITIONS[standing - 1]} place, rank ${person.rank}`}>
      <span>{POSITIONS[standing - 1]}</span>
    </div>
  </article>;
}

export default function AdministrationLeaderboard({
  leaderboard, days, appCode, loading, onDaysChange, onAppChange,
}) {
  const available = leaderboard?.availability === 'AVAILABLE'
    && leaderboard.windowDays === days && leaderboard.appCode === appCode;
  const people = useMemo(() => available ? leaderboard.employees : [], [available, leaderboard]);
  const top = people.slice(0, 3);
  const remaining = people.slice(3);
  return <div className="administration-leaderboard">
    <div className="administration-leaderboard-controls">
      <label>Period
        <select aria-label="Leaderboard period" value={days}
          onChange={event => onDaysChange(Number(event.target.value))}>
          {PERIODS.map(([value, title]) => <option value={value} key={value}>{title}</option>)}
        </select>
      </label>
      <label>Application
        <select aria-label="Leaderboard application" value={appCode}
          onChange={event => onAppChange(event.target.value)}>
          {Object.entries(APPS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
    </div>
    {loading || !leaderboard ? <div className="administration-message" role="status">
      Updating scores…
    </div> : !available ? <div className="administration-message administration-message-warning" role="status">
      Usage totals are temporarily unavailable. Try Refresh.
    </div> : <>
      <div className="administration-leaderboard-summary">
        <span>{count(leaderboard.totalEmployees)} employees</span>
        <span>{hours(leaderboard.totalRecordedActiveSeconds)} recorded hours</span>
        <span>Updated {new Date(leaderboard.observedAtUTC).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}</span>
        {leaderboard.totalPossibleOverlapSessions > 0 && <span className="administration-leaderboard-information"
          title="Some session windows overlap; past records do not show exactly which active seconds overlapped. Raw totals may include simultaneous tabs.">
          <span aria-hidden="true">ⓘ</span> About totals
        </span>}
      </div>
      {people.length ? <>
        <div className="administration-podium" aria-label="Top three activity leaderboard places">
          <PodiumPerson person={top[1]} place={2}/>
          <PodiumPerson person={top[0]} place={1}/>
          <PodiumPerson person={top[2]} place={3}/>
        </div>
        {remaining.length > 0 && <section className="administration-leaderboard-other" aria-label="Remaining standings">
          <h3>Everyone else</h3>
          <div className="administration-leaderboard-list">
            {remaining.map(person => <article className="administration-leaderboard-entry" key={person.eid}>
              <span className="administration-leaderboard-rank">#{person.rank}</span>
              <strong>{person.displayName || `Employee ${person.eid}`}</strong>
              <span className="administration-leaderboard-hours">{hours(person.recordedActiveSeconds)} hrs</span>
              <small>{count(person.sessionCount)} sessions</small>
            </article>)}
          </div>
        </section>}
      </> : <p className="administration-message">No recorded sessions for this period.</p>}
      {(leaderboard.carryInSessions > 0 || leaderboard.excludedInvalidSessions > 0 || leaderboard.employeesTruncated) &&
        <details className="administration-leaderboard-details"><summary>Data notes</summary>
          {leaderboard.carryInSessions > 0 && <p>{count(leaderboard.carryInSessions)} sessions started before the period and were excluded.</p>}
          {leaderboard.excludedInvalidSessions > 0 && <p>{count(leaderboard.excludedInvalidSessions)} invalid session records excluded.</p>}
          {leaderboard.employeesTruncated && <p>Showing the top {leaderboard.employeeLimit} employees.</p>}
        </details>}
    </>}
  </div>;
}
