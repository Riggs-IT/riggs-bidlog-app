import './ProjectionDisplay.css';

// A system baseline is visible to reviewers only. It is not a PM submission
// and must never be included in portfolio totals, variance or exported PM data.
export const SYSTEM_ESTIMATE_TOOLTIP =
  'No PM Projection submitted. System Estimate is reference only. Displayed amounts are system presets, excluded from PM totals and variance.';

export function projectProjectionTitle(project, name) {
  return project && !project.projectCompleted && project.hasPmForecast === false
    ? `${name}\n* ${SYSTEM_ESTIMATE_TOOLTIP}`
    : name;
}

export function ProjectionEstimateMarker({ project, className = '' }) {
  if (!project || project.projectCompleted || project.hasPmForecast) return null;
  return <span className={`projection-estimate-marker ${className}`.trim()}
    title={SYSTEM_ESTIMATE_TOOLTIP}
    aria-label="No PM Projection; system estimate shown for reference only">*</span>;
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
