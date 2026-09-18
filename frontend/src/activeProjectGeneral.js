export function generalDraft(values) {
  return {
    scope: values.scope ?? '',
    leed: values.leed === null ? '' : String(values.leed),
    ndaRequired: values.ndaRequired === null ? '' : String(values.ndaRequired),
    numberOfBuildings: values.numberOfBuildings === null ? '' : String(values.numberOfBuildings),
    buildingNames: values.buildingNames.map(row => ({ id: row.id, name: row.name ?? '' })),
  };
}

export function generalChanges(values, draft) {
  const original = generalDraft(values);
  const changes = {};
  if (draft.scope !== original.scope) changes.scope = draft.scope === '' ? null : draft.scope;
  for (const field of ['leed', 'ndaRequired']) {
    if (draft[field] !== original[field]) changes[field] = draft[field] === '' ? null : draft[field] === 'true';
  }
  if (draft.numberOfBuildings !== original.numberOfBuildings) {
    changes.numberOfBuildings = draft.numberOfBuildings === '' ? null : Number(draft.numberOfBuildings);
  }
  if (JSON.stringify(draft.buildingNames) !== JSON.stringify(original.buildingNames)) {
    changes.buildingNames = draft.buildingNames.map(row => {
      const old = values.buildingNames.find(item => item.id === row.id);
      // Preserve exact null/empty representation on unchanged pre-existing names.
      const name = old && (old.name ?? '') === row.name ? old.name : (row.name === '' ? null : row.name);
      return { id: row.id, name };
    });
  }
  return changes;
}

export function validateGeneralChanges(values, draft) {
  const changes = generalChanges(values, draft);
  if (draft.scope.length > 20000) return 'Scope must be 20,000 characters or fewer for this test.';
  for (const field of ['leed', 'ndaRequired']) {
    if (Object.hasOwn(changes, field) && !['true', 'false'].includes(draft[field])) {
      return 'Choose Yes or No for the changed requirement.';
    }
  }
  if (Object.hasOwn(changes, 'numberOfBuildings') || Object.hasOwn(changes, 'buildingNames')) {
    const count = Number(draft.numberOfBuildings);
    if (!/^\d+$/.test(draft.numberOfBuildings) || !Number.isInteger(count) || count < 1 || count > 100) {
      return 'Building count must be a whole number from 1 to 100 for this test.';
    }
    if (draft.buildingNames.length > count) return 'Building count must cover every building row. Remove rows explicitly before reducing it.';
  }
  if (draft.buildingNames.length > 100 || draft.buildingNames.some(row => row.name.length > 1000)) {
    return 'Use at most 100 building rows, with names of 1,000 characters or fewer.';
  }
  return null;
}

export function generalErrorMessage(detail) {
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    return detail.message || 'General Information could not be saved. Reload and review the current values.';
  }
  const messages = {
    bid_log_admin_required: 'Only administrators can edit project information.',
    cognito_general_writes_disabled: 'General Information test writes are disabled.',
    cognito_general_test_job_only: 'Editing is currently limited to test Job 11111.',
    service_auth_unavailable: 'The secure connection is not configured for this section.',
    cognito_unavailable: 'Cognito is temporarily unavailable.',
    data_api_unavailable: 'Riggs data services are temporarily unavailable.',
    cognito_configuration_unavailable: 'The Cognito connection is not configured.',
    cognito_general_unavailable: 'General Information is temporarily unavailable.',
  };
  return messages[detail] || 'General Information could not be loaded or saved. Review the current values before retrying.';
}
