import './ProjectionDisplay.css';

// System estimates can be included in display-only projected totals while
// remaining separate from submitted PM projections, variance and CSV exports.
export const SYSTEM_ESTIMATE_TOOLTIP =
  'No PM Projection submitted. System estimate shown and included in displayed projected totals; it is not a submitted PM projection or part of PM-only variance.';

export function projectProjectionTitle(project, name) {
  return project && !project.projectCompleted && project.hasPmForecast === false
    ? `${name}\n${SYSTEM_ESTIMATE_TOOLTIP}`
    : name;
}

export function ProjectionAmount({ value, currency, missing = 0, baseline, compare = false,
  showSystemFallback = false }) {
  const hasPmValue = value !== null && value !== undefined;
  const showEstimate = showSystemFallback && !hasPmValue && baseline !== null && baseline !== undefined;
  return <span className="primary-projection-amount">
    <span className={showEstimate ? 'system-estimate-reference-value' : undefined}
      title={showEstimate ? SYSTEM_ESTIMATE_TOOLTIP
        : missing ? `${missing} PM month(s) have no entered amount; this total includes entered amounts only.` : undefined}>
      {hasPmValue ? currency(value) : showEstimate ? currency(baseline) : '—'}
    </span>
    {compare && !showEstimate && <small className="baseline-reference">System Estimate {baseline === null || baseline === undefined ? '—' : currency(baseline)}</small>}
  </span>;
}
