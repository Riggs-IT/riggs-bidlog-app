// The owner-only API deliberately omits browser session IDs. Group only the
// bounded, sanitized session records returned by the existing presence read.
// A group is one employee (stable EID) in one application, not one display name.
const timestamp = value => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function latestFirst(a, b) {
  return timestamp(b.lastHeartbeatAtUTC) - timestamp(a.lastHeartbeatAtUTC)
    || timestamp(b.lastActiveAtUTC) - timestamp(a.lastActiveAtUTC)
    || timestamp(b.startedAtUTC) - timestamp(a.startedAtUTC);
}

export function groupPresenceSessions(sessions) {
  const groups = new Map();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const key = `${session.appCode}:${session.eid}`;
    if (!groups.has(key)) {
      groups.set(key, {key, appCode: session.appCode, eid: session.eid, sessions: []});
    }
    groups.get(key).sessions.push(session);
  }

  return Array.from(groups.values(), group => {
    // Sort a new per-group array, never the API response or session objects.
    group.sessions.sort(latestFirst);
    group.latest = group.sessions[0];
    return group;
  }).sort((a, b) => latestFirst(a.latest, b.latest)
    || a.appCode.localeCompare(b.appCode)
    || a.eid - b.eid);
}
