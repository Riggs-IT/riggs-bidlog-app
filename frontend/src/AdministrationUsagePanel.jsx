import AdministrationPresence from './AdministrationPresence.jsx';
import AdministrationLeaderboard from './AdministrationLeaderboard.jsx';
import './AdministrationUsagePanel.css';

export default function AdministrationUsagePanel({
  presence, leaderboard, mode, days, appCode, loading,
  onModeChange, onDaysChange, onAppChange,
}) {
  const live = mode === 'LIVE';
  return <section className="administration-section" aria-label="Riggs application usage">
    <div className="administration-section-heading">
      <h2>Who's using Riggs apps</h2>
      <span>Private · owner-only · SQL-backed records</span>
    </div>
    <div className="administration-usage-tabs" role="tablist" aria-label="Usage view">
      <button type="button" role="tab" id="administration-usage-live-tab"
        aria-selected={live} aria-controls="administration-usage-view"
        className={live ? 'administration-usage-tab is-active' : 'administration-usage-tab'}
        onClick={() => onModeChange('LIVE')}>Live Users</button>
      <button type="button" role="tab" id="administration-usage-leaderboard-tab"
        aria-selected={!live} aria-controls="administration-usage-view"
        className={!live ? 'administration-usage-tab is-active' : 'administration-usage-tab'}
        onClick={() => onModeChange('LEADERBOARD')}>Usage Leaderboard</button>
    </div>
    <div id="administration-usage-view" role="tabpanel"
      aria-labelledby={live ? 'administration-usage-live-tab' : 'administration-usage-leaderboard-tab'}>
      {live ? <AdministrationPresence presence={presence} embedded />
        : <AdministrationLeaderboard leaderboard={leaderboard} days={days} appCode={appCode}
            loading={loading} onDaysChange={onDaysChange} onAppChange={onAppChange} />}
    </div>
  </section>;
}
