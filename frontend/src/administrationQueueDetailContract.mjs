/** Restrict the browser to the fixed, non-sensitive queue event contract. */
export const CATEGORIES = Object.freeze({
  NOT_RECORDED: 'No error recorded',
  AUTHORIZATION: 'Authentication / access',
  RATE_LIMIT: 'Rate limit',
  TIMEOUT: 'Timeout',
  CONNECTIVITY: 'Connection / DNS',
  CONFLICT: 'Conflict',
  VALIDATION: 'Validation',
  UPSTREAM_ERROR: 'Upstream response',
  UNCLASSIFIED: 'Unclassified',
});

const RESPONSE_KEYS = ['readOnly','source','observedAtUTC','laneKey','status','limit','hasMore','events'].sort();
const EVENT_KEYS = ['eventId','identityType','jobListId','ticketKey','jobNumber','retryCount','createdAtUTC','eligibleAfterUTC','errorCategory'].sort();
const TICKET = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sameKeys = (obj, keys) => obj !== null && typeof obj === 'object'
  && !Array.isArray(obj) && JSON.stringify(Object.keys(obj).sort()) === JSON.stringify(keys);
const utcMs = value => typeof value === 'string' && value.length <= 48
  && (/Z$/i.test(value) || /\+00:00$/.test(value)) ? Date.parse(value) : NaN;

export function validQueueDetail(response, laneKey, status) {
  if (!sameKeys(response, RESPONSE_KEYS) || response.readOnly !== true
      || response.source !== 'RIGGSDATAHUB_OUTBOX'
      || response.laneKey !== laneKey || response.status !== status
      || !['FAILED', 'PENDING'].includes(status)
      || !Number.isInteger(response.limit) || response.limit < 1 || response.limit > 20
      || typeof response.hasMore !== 'boolean' || !Array.isArray(response.events)
      || response.events.length > response.limit
      || (response.hasMore && response.events.length !== response.limit)
      || !Number.isFinite(utcMs(response.observedAtUTC))) return false;
  const ids = new Set();
  let previous = null;
  for (const event of response.events) {
    if (!sameKeys(event, EVENT_KEYS) || !Number.isSafeInteger(event.eventId)
        || event.eventId <= 0 || ids.has(event.eventId)
        || !Number.isSafeInteger(event.retryCount) || event.retryCount < 0
        || !Object.hasOwn(CATEGORIES, event.errorCategory)
        || !Number.isFinite(utcMs(event.createdAtUTC))
        || (event.jobNumber !== null && (typeof event.jobNumber !== 'string'
            || !event.jobNumber.trim() || event.jobNumber.length > 50))
        || (status === 'FAILED' && event.eligibleAfterUTC !== null)
        || (status === 'PENDING' && !Number.isFinite(utcMs(event.eligibleAfterUTC)))) return false;
    const job = event.identityType === 'JOB_LIST_ID' && laneKey !== 'accounting_tickets'
      && Number.isSafeInteger(event.jobListId) && event.jobListId > 0 && event.ticketKey === null;
    const ticket = event.identityType === 'TICKET_KEY' && laneKey === 'accounting_tickets'
      && event.jobListId === null && typeof event.ticketKey === 'string'
      && TICKET.test(event.ticketKey) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(event.ticketKey);
    if (!job && !ticket) return false;
    const order = [utcMs(event.createdAtUTC), event.eventId];
    if (previous && (order[0] > previous[0]
          || (order[0] === previous[0] && order[1] >= previous[1]))) return false;
    previous = order;
    ids.add(event.eventId);
  }
  return true;
}
