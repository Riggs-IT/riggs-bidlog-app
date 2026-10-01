const currencyFormatter = new Intl.NumberFormat(
    'en-US',
    {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    },
  );

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

  return currencyFormatter.format(number);
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


function teamName(value) {
  const text =
    String(value ?? '').trim();

  if (!text) {
    return null;
  }

  const normalized =
    text.toLowerCase();

  if (
    normalized === '—'
    || normalized === 'unassigned'
    || normalized === 'no pm assigned'
  ) {
    return null;
  }

  return text;
}


export function ProjectTeamCell({
  pe,
  superintendent,
  apm,
}) {
  const members = [
    {
      role: 'PE',
      name: teamName(pe),
    },
    {
      role: 'SUPER',
      name: teamName(superintendent),
    },
    {
      role: 'APM',
      name: teamName(apm),
    },
  ].filter(
    member => member.name
  );

  if (!members.length) {
    return (
      <span className="project-team-empty">
        —
      </span>
    );
  }

  return (
    <div className="project-team-cell">
      {members.map(
        member => (
          <div
            className="project-team-member"
            key={member.role}
            title={`${member.role}: ${member.name}`}
          >
            <span className="project-team-role">
              {member.role}
            </span>

            <span className="project-team-name">
              {member.name}
            </span>
          </div>
        )
      )}
    </div>
  );
}


function teamInitials(name, explicitInitials = null) {
  const provided =
    String(explicitInitials || '').trim();

  if (provided) {
    return provided.toUpperCase();
  }

  const parts =
    String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (!parts.length) {
    return '';
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`
  ).toUpperCase();
}


function teamBadgeTextColor(hexColor) {
  const match =
    String(hexColor || '')
      .trim()
      .match(/^#?([0-9a-f]{6})$/i);

  if (!match) {
    return '#ffffff';
  }

  const value = match[1];
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  const luminance =
    (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance > 160
    ? '#111111'
    : '#ffffff';
}


function validTeamColor(value, fallback) {
  const color = String(value || '').trim();

  return /^#[0-9a-f]{6}$/i.test(color)
    ? color
    : fallback;
}


export function ProjectTeamBadges({
  pm,
  pmInitials = null,
  pmHexColor = null,
  pe,
  peInitials = null,
  peHexColor = null,
  apm,
  apmInitials = null,
  apmHexColor = null,
  superintendent,
  superintendentInitials = null,
  superintendentHexColor = null,
  compact = false,
}) {
  const members = [
    {
      role: 'PM',
      tooltipRole: 'PM',
      name: teamName(pm),
      initials: teamInitials(pm, pmInitials),
      color: validTeamColor(pmHexColor, '#4b5563'),
    },
    {
      role: 'PE',
      tooltipRole: 'PE',
      name: teamName(pe),
      initials: teamInitials(pe, peInitials),
      color: validTeamColor(peHexColor, '#486878'),
    },
    {
      role: 'APM',
      tooltipRole: 'APM',
      name: teamName(apm),
      initials: teamInitials(apm, apmInitials),
      color: validTeamColor(apmHexColor, '#665985'),
    },
    {
      role: 'SUP',
      tooltipRole: 'Superintendent',
      name: teamName(superintendent),
      initials: teamInitials(
        superintendent,
        superintendentInitials,
      ),
      color: validTeamColor(
        superintendentHexColor,
        '#5a626b',
      ),
    },
  ].filter(
    member => member.name || member.initials
  );

  if (!members.length) {
    return (
      <span className="project-team-empty">
        —
      </span>
    );
  }

  return (
    <div
      className={
        compact
          ? 'project-team-badges compact'
          : 'project-team-badges'
      }
    >
      {members.map(
        member => (
          <span
            className="project-team-badge"
            key={member.role}
            title={`${member.tooltipRole}: ${member.name || member.initials}`}
            style={{
              backgroundColor: member.color,
              color: teamBadgeTextColor(member.color),
            }}
          >
            <strong>{member.initials || '—'}</strong>
          </span>
        )
      )}
    </div>
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
    || a === 0
    || b === 0
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


function comparisonRowHasValue(row) {
  const candidate =
    row?.value
    ?? row?.display;

  if (!hasValue(candidate)) {
    return false;
  }

  const normalized =
    String(candidate).trim();

  if (
    normalized === '—'
    || normalized === '-'
    || normalized.toUpperCase() === 'TBD'
  ) {
    return false;
  }

  const numericText =
    normalized
      .replaceAll(',', '')
      .replaceAll('$', '')
      .replaceAll('%', '')
      .replace(/\s*pts$/i, '')
      .trim();

  const numeric =
    Number(numericText);

  if (
    numericText !== ''
    && Number.isFinite(numeric)
  ) {
    return numeric !== 0;
  }

  return true;
}


export function ComparisonDetails({
  rows,
}) {
  const visibleRows =
    rows.filter(
      comparisonRowHasValue
    );

  if (!visibleRows.length) {
    return null;
  }

  return (
    <details className="source-comparison">
      <summary>
        Compare Sources
      </summary>

      <div className="source-comparison-panel">
        {visibleRows.map(
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
