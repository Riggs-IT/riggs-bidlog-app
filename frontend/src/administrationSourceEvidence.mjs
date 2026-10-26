// Strict, data-only contract. No source-clock timestamps are silently UTC.
export const SOURCE_META = Object.freeze({
  foundation_jobs: {label: 'Foundation · Jobs', basis: 'UTC', type: 'SOURCE_LAST_MODIFIED', meaning: 'Latest Foundation job source modification recorded in the mirror'},
  foundation_billings: {label: 'Foundation · Billings', basis: 'UNVERIFIED_SOURCE_CLOCK', type: 'SOURCE_LAST_MODIFIED', meaning: 'Latest billing source modification; source timezone unverified'},
  sharepoint_bids: {label: 'SharePoint · Bid Log', basis: 'UTC', type: 'MIRROR_ITEM_SYNC', meaning: 'Latest recorded individual Bid Log mirror sync'},
  sharepoint_orders: {label: 'SharePoint · Ordering Center', basis: 'UTC', type: 'MIRROR_ITEM_SYNC', meaning: 'Latest recorded individual Ordering Center mirror sync'},
  ops_projects: {label: 'Ops · Projects', basis: 'UNVERIFIED_SOURCE_CLOCK', type: 'SOURCE_LAST_MODIFIED', meaning: 'Latest recorded Cognito source edit, not a sync heartbeat'},
});

const isoNaive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?$/;
const isoAware = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function validSourceEvidence(value) {
  if (!value || typeof value !== 'object' || value.readOnly !== true ||
      value.availability !== 'AVAILABLE' || value.source !== 'RIGGSDATAHUB_SOURCE_EVIDENCE' ||
      typeof value.observedAtUTC !== 'string' || !isoAware.test(value.observedAtUTC) ||
      !Number.isFinite(Date.parse(value.observedAtUTC)) ||
      !Array.isArray(value.rows) || value.rows.length !== Object.keys(SOURCE_META).length) return false;
  const seen = new Set();
  for (const row of value.rows) {
    if (!row || typeof row !== 'object') return false;
    const meta = SOURCE_META[row.sourceKey];
    if (!meta || seen.has(row.sourceKey) || row.timestampBasis !== meta.basis ||
        row.evidenceType !== meta.type || typeof row.recordFound !== 'boolean') return false;
    if (row.lastRecordedValue != null) {
      if (!row.recordFound || typeof row.lastRecordedValue !== 'string' ||
          !isoNaive.test(row.lastRecordedValue) ||
          !Number.isFinite(Date.parse(row.lastRecordedValue + 'Z'))) return false;
    }
    seen.add(row.sourceKey);
  }
  return seen.size === Object.keys(SOURCE_META).length;
}

export function describeSourceTimestamp(row, observedAtUTC) {
  if (!row?.recordFound) return {value: 'No source row', detail: 'No timestamp can be verified'};
  if (!row.lastRecordedValue) return {value: 'Not recorded', detail: 'Source row exists, timestamp unavailable'};
  if (row.timestampBasis !== 'UTC') {
    return {value: row.lastRecordedValue.replace('T', ' '), detail: 'Source clock · timezone unverified; no age calculated'};
  }
  const instant = Date.parse(row.lastRecordedValue + 'Z');
  const observed = Date.parse(observedAtUTC);
  const age = (observed - instant) / 1000;
  const detail = age < -300 ? 'Time ahead of observation — review clock/source' :
    age < 0 ? 'Recent · clock difference within five minutes' :
    age < 3600 ? `${Math.round(age / 60)} min since recorded event` :
    age < 86400 ? `${Math.round(age / 3600)} hr since recorded event` :
    `${Math.round(age / 86400)} days since recorded event`;
  return {value: new Date(instant).toLocaleString(), detail};
}
