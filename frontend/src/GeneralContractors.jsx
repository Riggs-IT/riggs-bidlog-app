export const MULTIPLE_GCS = '__MULTIPLE_GCS__';


export function generalContractorNames(value) {
  const rawValues =
    Array.isArray(value)
      ? value
      : [value];

  const names = rawValues
    .flatMap(
      item =>
        String(item ?? '')
          .split('¡')
    )
    .map(
      item => item.trim()
    )
    .filter(Boolean);

  const seen = new Set();

  return names.filter(
    name => {
      const key =
        name.toLocaleLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }
  );
}


export function generalContractorDisplayText(
  value,
  fallback = '—',
) {
  const names =
    generalContractorNames(value);

  return names.length
    ? names.join(' · ')
    : fallback;
}


export function generalContractorFilterMatch(
  value,
  filterValue,
  allValue,
) {
  if (
    !filterValue
    || filterValue === allValue
  ) {
    return true;
  }

  const names =
    generalContractorNames(value);

  if (filterValue === MULTIPLE_GCS) {
    return names.length > 1;
  }

  const normalizedFilter =
    String(filterValue)
      .trim()
      .toLocaleLowerCase();

  return names.some(
    name =>
      name.toLocaleLowerCase()
      === normalizedFilter
  );
}


export function GeneralContractorDisplay({
  value,
  fallback = '—',
  compact = false,
}) {
  const names =
    generalContractorNames(value);

  if (!names.length) {
    return (
      <span className="gc-empty">
        {fallback}
      </span>
    );
  }

  const visibleNames =
    compact
      ? names.slice(0, 2)
      : names;

  const hiddenCount =
    names.length - visibleNames.length;

  return (
    <div
      className={
        compact
          ? 'gc-display compact'
          : 'gc-display'
      }
      title={names.join(' · ')}
    >
      {visibleNames.map(
        name => (
          <span
            className="gc-chip"
            key={name}
          >
            {name}
          </span>
        )
      )}

      {hiddenCount > 0 && (
        <span className="gc-chip gc-chip-more">
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}
