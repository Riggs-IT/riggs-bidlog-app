/** View-only project manager scoping. Server-side authorization remains authoritative. */
export function normalizePmIdentity(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function canStartWithMyJobs(user) {
  return String(user?.workspaceProfile ?? '').trim().toUpperCase() === 'PM'
    && Boolean(normalizePmIdentity(user?.displayName));
}

export function matchesSignedInPm(recordPm, displayName) {
  const own = normalizePmIdentity(displayName);
  return Boolean(own) && normalizePmIdentity(recordPm) === own;
}
