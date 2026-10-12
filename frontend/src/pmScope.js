/** Match the signed-in PM to an existing dropdown option; never invent an option. */
export function normalizePmIdentity(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function isProjectManagerWorkspaceUser(user) {
  return String(user?.workspaceProfile ?? '').trim().toUpperCase() === 'PM'
    && Boolean(normalizePmIdentity(user?.displayName));
}

export function resolveSignedInPmOption(user, options) {
  if (!isProjectManagerWorkspaceUser(user) || !Array.isArray(options)) return null;
  const identity = normalizePmIdentity(user.displayName);
  const matches = options.filter(option => normalizePmIdentity(option) === identity);
  // Colliding distinct values are not a safe choice. Avoid a fuzzy fallback.
  return matches.length === 1 ? matches[0] : null;
}
