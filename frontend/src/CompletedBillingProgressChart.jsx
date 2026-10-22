import {useId, useMemo} from 'react';
import {completedBillingProgress} from './completedBillingProgress.mjs';

const MONEY = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
});
const SHORT = new Intl.NumberFormat('en-US', {
  notation: 'compact', maximumFractionDigits: 1,
});
const compactMoney = amount => (amount < 0
  ? `−$${SHORT.format(Math.abs(amount))}`
  : `$${SHORT.format(amount)}`);
const MONTH = new Intl.DateTimeFormat('en-US', {
  month: 'short', year: 'numeric', timeZone: 'UTC',
});
const VIEW = {width: 820, height: 236, left: 74, right: 20, top: 19, bottom: 35};

function labelMonth(month) {
  return MONTH.format(new Date(`${month}T00:00:00Z`));
}

export default function CompletedBillingProgressChart({monthly, totalContract, expectedActual}) {
  const model = useMemo(
    () => completedBillingProgress(monthly, totalContract, expectedActual),
    [monthly, totalContract, expectedActual],
  );
  const chartId = useId();

  if (model.status !== 'ready') {
    return (
      <p className="completed-progress-unavailable" role="status">
        {model.status === 'empty'
          ? 'Monthly billing progression is not available for this project.'
          : 'Monthly billing totals could not be reconciled. The source table is retained below.'}
      </p>
    );
  }

  const {points, contract} = model;
  const {width, height, left, right, top, bottom} = VIEW;
  const bottomY = height - bottom;
  const chartWidth = width - left - right;
  const chartHeight = bottomY - top;
  const values = points.map(point => point.amount);
  if (contract !== null) values.push(contract);
  const smallest = Math.min(0, ...values);
  const largest = Math.max(0, ...values);
  const padding = Math.max((largest - smallest) * 0.08, largest === 0 && smallest === 0 ? 1 : 0.01);
  const minimum = smallest < 0 ? smallest - padding : 0;
  const maximum = largest + padding;
  const y = amount => top + ((maximum - amount) / (maximum - minimum)) * chartHeight;
  const x = index => left + (points.length === 1 ? chartWidth / 2 : index / (points.length - 1) * chartWidth);
  const path = points.map((point, index) =>
    `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(point.amount).toFixed(2)}`,
  ).join(' ');
  const labelIndices = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const tickAmounts = [...new Set([minimum < 0 ? minimum : 0, (minimum + maximum) / 2, maximum])];
  const visiblePointIndices = points.length <= 24
    ? points.map((_, index) => index)
    : [...new Set([0, ...points.map((_, index) => index).filter(index => index % Math.ceil(points.length / 14) === 0), points.length - 1])];
  const last = points[points.length - 1];

  return (
    <figure className="completed-progress" aria-label="Cumulative billing progression">
      <div className="completed-progress-legend" aria-hidden="true">
        <span className="completed-progress-legend-actual">Cumulative actual billings</span>
        {contract !== null && <span className="completed-progress-legend-contract">Total contract</span>}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img"
        aria-labelledby={`${chartId}-title ${chartId}-description`}>
        <title id={`${chartId}-title`}>Historical billing progression</title>
        <desc id={`${chartId}-description`}>
          {`Running Foundation billings across ${points.length} recorded months, ending ${labelMonth(last.month)} at ${MONEY.format(last.amount)}.`}
          {contract !== null ? ` Total contract reference: ${MONEY.format(contract)}.` : ' No total contract reference available.'}
          {' The source monthly table follows.'}
        </desc>
        {tickAmounts.map(amount => (
          <g key={`tick-${amount}`}>
            <line x1={left} x2={width - right} y1={y(amount)} y2={y(amount)}
              className="completed-progress-gridline" />
            <text x={left - 10} y={y(amount) + 4} textAnchor="end"
              className="completed-progress-axis">{compactMoney(amount)}</text>
          </g>
        ))}
        {contract !== null && (
          <line x1={left} x2={width - right} y1={y(contract)} y2={y(contract)}
            className="completed-progress-contract" />
        )}
        {points.length > 1 && <path d={path} className="completed-progress-line" />}
        {visiblePointIndices.map(index => (
          <circle key={points[index].month} cx={x(index)} cy={y(points[index].amount)}
            r={index === points.length - 1 ? 4.5 : 3.1} className="completed-progress-point">
            <title>{labelMonth(points[index].month)} · {MONEY.format(points[index].amount)} cumulative</title>
          </circle>
        ))}
        {labelIndices.map(index => (
          <text key={`month-${points[index].month}`} x={x(index)} y={height - 9}
            textAnchor={index === 0 && points.length > 1 ? 'start' : index === points.length - 1 && points.length > 1 ? 'end' : 'middle'}
            className="completed-progress-axis">{labelMonth(points[index].month)}</text>
        ))}
      </svg>
      <figcaption>
        Source: Foundation monthly billing history. Zero-billing months stay flat; credits can lower the line.
      </figcaption>
    </figure>
  );
}
