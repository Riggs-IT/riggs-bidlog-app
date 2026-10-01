import './ProjectionDisplay.css';

export function ProjectionEstimateMarker({ project, className = '' }) {
  if (!project || project.projectCompleted || project.hasPmForecast) return null;
  return <span className={`projection-estimate-marker ${className}`.trim()}
    title="No PM Projection submitted; projected values use the System Estimate."
    aria-label="System Estimate">*</span>;
}
export function ProjectionAmount({ value, currency, missing = 0, baseline, compare = false }) {
  return <span className="primary-projection-amount">
    <span title={missing ? `${missing} PM month(s) have no entered amount; this total includes entered amounts only.` : undefined}>
      {value === null || value === undefined ? '—' : currency(value)}
    </span>
    {compare && <small className="baseline-reference">Baseline {baseline === null || baseline === undefined ? '—' : currency(baseline)}</small>}
  </span>;
}
