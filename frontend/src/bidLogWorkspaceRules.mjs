// Selector rules shared by Bid Log Create, Active Edit and Outcome Edit.
// The independent PM badge directory comes from Operations.CognitoITUsers.
// Historical rows are not proof that an employee remains active.
function key(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function activePmChoices(directoryRows) {
  if (!Array.isArray(directoryRows)) return [];

  // The Data API derives pmSelectable from CognitoITUsers.OfficeDepartment
  // (Operations) and Separated (0 or NULL). Do not infer eligibility from
  // historical bid assignments, project roles, initials, or badge colors.
  const names = new Map();
  const seen = new Set();
  for (const row of directoryRows) {
    const name = String(row?.pm ?? '').trim();
    const identity = key(name);
    if (!identity || identity === 'no pm assigned') continue;
    if (seen.has(identity)) {
      names.delete(identity);
      continue;
    }
    seen.add(identity);
    if (row?.pmSelectable === true && row?.pmSeparated !== true) {
      names.set(identity, name);
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

// Queue COMPLETE is an authoritative success only after its SQL draft exists.
// View-only users must not be sent into an editor that requires ADMIN writes.
export function asyncAwardSetupId(progress, canAuthor) {
  if (canAuthor !== true || progress?.status !== 'COMPLETE'
      || progress?.awardCompleted !== true || progress?.draftReady !== true) {
    return null;
  }
  const id = progress.originalBidLogId;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
