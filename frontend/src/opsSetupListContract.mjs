/** AP4E strict summary contract. Never fall back to an empty list on error. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = ['setupId', 'childId', 'originalBidLogId', 'revision', 'jobName',
  'createdAtUTC', 'updatedAtUTC', 'setupState', 'numberingState', 'externalState'];
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length &&
    keys.every(k => Object.prototype.hasOwnProperty.call(value, k));
}
function guid(value) { return typeof value === 'string' && UUID_RE.test(value) &&
  value.toLowerCase() !== '00000000-0000-0000-0000-000000000000'; }
function moment(value) {
  return typeof value === 'string' && /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}
export function validateOpsSetupList(payload, pageSize=25) {
  if (!exact(payload, ['items','nextCursor','persistence']) ||
      payload.persistence !== 'SQL_DRAFT_ONLY' || !Array.isArray(payload.items) ||
      payload.items.length > pageSize) throw new Error('Invalid Ops setup response');
  const ids = new Set(); let last = null;
  for (const item of payload.items) {
    if (!exact(item, KEYS) || !guid(item.setupId) || !guid(item.childId) ||
        !Number.isSafeInteger(item.originalBidLogId) || item.originalBidLogId < 1 ||
        !Number.isSafeInteger(item.revision) || item.revision < 1 ||
        (item.jobName !== null && (typeof item.jobName !== 'string' || item.jobName.length > 1000)) ||
        !moment(item.createdAtUTC) || !moment(item.updatedAtUTC) ||
        item.setupState !== 'PENDING_SETUP' ||
        item.numberingState !== 'AWAITING_JOB_NUMBER' ||
        item.externalState !== 'NOT_CONNECTED' || ids.has(item.setupId))
      throw new Error('Invalid Ops setup item');
    ids.add(item.setupId);
    // SQL Server GUID ordering differs from lexicographic UUID ordering.
    const timestamp = Date.parse(item.createdAtUTC);
    if (last !== null && timestamp < last) throw new Error('Unordered Ops setup items');
    last = timestamp;
  }
  if (payload.nextCursor !== null) {
    const cursor = payload.nextCursor;
    if (!exact(cursor,['createdAtUTC','setupId']) || !moment(cursor.createdAtUTC) ||
        !guid(cursor.setupId) || !payload.items.length ||
        cursor.setupId.toLowerCase() !== payload.items.at(-1).setupId.toLowerCase() ||
        Date.parse(cursor.createdAtUTC) !== Date.parse(payload.items.at(-1).createdAtUTC))
      throw new Error('Invalid Ops setup cursor');
  }
  return payload;
}
