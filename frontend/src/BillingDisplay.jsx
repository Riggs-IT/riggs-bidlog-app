function hasValue(value) {
  return (
    value !== null
    && value !== undefined
    && String(value).trim() !== ''
  );
}


export function money(value) {
  if (!hasValue(value)) {
    return '—';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return new Intl.NumberFormat(
    'en-US',
    {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    },
  ).format(number);
}


export function moneyClass(value) {
  if (!hasValue(value)) {
    return '';
  }

  const number = Number(value);

  return (
    Number.isFinite(number)
    && number < 0
      ? 'money-negative'
      : ''
  );
}


export function MoneyValue({
  value,
  className = '',
}) {
  const classes = [
    className,
    moneyClass(value),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={
        classes || undefined
      }
    >
      {money(value)}
    </span>
  );
}


export function retentionNumber(value) {
  if (!hasValue(value)) {
    return null;
  }

  const raw =
    String(value)
      .trim()
      .replace(
        '%',
        '',
      );

  const number = Number(raw);

  if (!Number.isFinite(number)) {
    return null;
  }

  return (
    number > 0
    && number <= 1
      ? number * 100
      : number
  );
}


export function retentionLabel(value) {
  const number = retentionNumber(value);

  if (number === null) {
    return 'TBD';
  }

  return `${
    new Intl.NumberFormat(
      'en-US',
      {
        maximumFractionDigits: 2,
      },
    ).format(number)
  }%`;
}


export function moneyDifference(
  first,
  second,
) {
  if (
    !hasValue(first)
    || !hasValue(second)
  ) {
    return null;
  }

  const a = Number(first);
  const b = Number(second);

  if (
    !Number.isFinite(a)
    || !Number.isFinite(b)
  ) {
    return null;
  }

  return a - b;
}


export function commercialSourceLabel(value) {
  const labels = {
    FOUNDATION:
      'Foundation',

    COGNITO:
      'Cognito',

    BID_ESTIMATE:
      'Bid Estimate',

    PROJECTION:
      'Projection',

    MISSING:
      'Source pending',
  };

  return (
    labels[
      String(
        value || ''
      ).toUpperCase()
    ]
    || 'Source pending'
  );
}


export function ComparisonDetails({
  rows,
}) {
  return (
    <details className="source-comparison">
      <summary>
        Compare Sources
      </summary>

      <div className="source-comparison-panel">
        {rows.map(
          row => (
            <div
              className="source-comparison-row"
              key={row.label}
            >
              <span>
                {row.label}
              </span>

              <strong
                className={
                  row.money
                    ? (
                        moneyClass(
                          row.value
                        )
                      )
                    : undefined
                }
              >
                {row.display}
              </strong>
            </div>
          )
        )}
      </div>
    </details>
  );
}
