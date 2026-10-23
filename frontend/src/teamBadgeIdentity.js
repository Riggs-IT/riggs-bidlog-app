// Shared, read-only display identities. The existing Bid Log PM-badge API
// queries Operations.CognitoITUsers for every named employee, not just PMs.
// It excludes ambiguous duplicate display names before sending the response.
export function teamNameKey(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function configuredTeamColor(value) {
  const color = String(value ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}

export function teamIdentityMap(rows) {
  const identities = new Map();
  const ambiguous = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = teamNameKey(row?.pm);
    if (!key || ambiguous.has(key)) continue;

    if (identities.has(key)) {
      identities.delete(key);
      ambiguous.add(key);
      continue;
    }

    const initials = typeof row.pmInitials === 'string'
      ? row.pmInitials.trim().slice(0, 5) : '';
    const color = configuredTeamColor(row.pmHexColor);
    identities.set(key, {initials, color});
  }
  return identities;
}

// Direct typed project fields win; otherwise use the same person's
// exact Cognito directory identity. No partial/fuzzy name guessing.
export function resolveTeamBadge(name, explicitInitials, explicitColor, identities) {
  const directory = identities instanceof Map
    ? identities.get(teamNameKey(name)) : null;
  return {
    initials: String(explicitInitials ?? '').trim() || directory?.initials || '',
    color: configuredTeamColor(explicitColor) || directory?.color || null,
  };
}

// The previous perceived-brightness rule keeps dark orange (AC) readable
// with white initials while light yellows/greens use dark initials.
// The WCAG contrast-ratio comparison favored black for saturated oranges,
// which did not match the team's preferred badge appearance.
export function teamBadgeTextColor(value) {
  const hex = configuredTeamColor(value);
  if (!hex) return '#ffffff';
  const digits = hex.slice(1);
  const red = parseInt(digits.slice(0, 2), 16);
  const green = parseInt(digits.slice(2, 4), 16);
  const blue = parseInt(digits.slice(4, 6), 16);
  const perceivedBrightness = (red * 299 + green * 587 + blue * 114) / 1000;
  return perceivedBrightness > 160 ? '#111111' : '#ffffff';
}
