// AP4F4F: validate read-only saved-revision result. Never grant create authority.
import {validId} from './projectSetupAuthoring.mjs';
export function validateSavedReadiness(data, setupId, revision) {
  if (!validId(setupId) || !Number.isInteger(revision) || revision < 1 ||
    !data || typeof data !== 'object' || Array.isArray(data) ||
    data.setupId !== setupId || data.revision !== revision ||
    data.mappingVersion !== 'AP4F4F_51' || data.basis !== 'SAVED_SQL_REVISION' ||
    data.readiness !== 'BLOCKED' || data.readyForJis !== false ||
    data.form19CreateAuthorized !== false || data.canSaveIncompleteDraft !== true ||
    data.externalWrites !== 0 || data.fieldReviewIsAdvisory !== true ||
    data.fieldCount !== 51 || data.rootCount !== 32 ||
    !Array.isArray(data.fields) || data.fields.length !== 51 ||
    !Array.isArray(data.missingReviewFields) ||
    !Array.isArray(data.blockers) || data.blockers.length < 1) {
    throw new Error('Invalid saved-revision readiness response.');
  }
  const allowedStates = new Set(['PRESENT','MISSING','REVIEW','NOT_SENT','SECTION']);
  const paths = new Set();
  for (const f of data.fields) {
    if (!f || typeof f.path !== 'string' || paths.has(f.path) ||
      !allowedStates.has(f.state) || !['BID','OPS'].includes(f.collector))
      throw new Error('Invalid field mapping response.');
    paths.add(f.path);
  }
  if (data.missingReviewFields.some(x => typeof x !== 'string' || !paths.has(x)))
    throw new Error('Invalid missing-field response.');
  if (data.blockers.some(x => !x || typeof x.code !== 'string' ||
    !['BUSINESS','PROVIDER','ENGINEERING'].includes(x.scope)))
    throw new Error('Invalid policy-gate response.');
  return data;
}
