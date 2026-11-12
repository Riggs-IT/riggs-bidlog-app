/** AP4F3U — Form 140 company reference versus project-specific draft overrides.
 * No provider writes; null inherits the verified directory value, while an
 * explicit empty string is a deliberate project-level blank override.
 */
export const GC_COMPANY_FIELDS = Object.freeze([
  Object.freeze({key:'streetAddress',label:'Street address',referenceKey:'streetAddress'}),
  Object.freeze({key:'cityStateZip',label:'City / state / ZIP',referenceKey:'cityStateZip'}),
  Object.freeze({key:'generalEmail',label:'Company email',referenceKey:'email'}),
]);
export const GC_COMPANY_PATHS = new Set(GC_COMPANY_FIELDS.map(field=>`gcContactInfo.${field.key}`));

export function gcCompanyFieldState(contactInfo, source, key) {
  const field = GC_COMPANY_FIELDS.find(value=>value.key===key);
  if (!field) throw new Error('Unsupported GC company field.');
  const saved = contactInfo?.[key];
  if (saved !== undefined && saved !== null && typeof saved !== 'string')
    throw new Error('Invalid GC company draft value.');
  const hasOverride = saved !== undefined && saved !== null;
  const value = source?.[field.referenceKey];
  const reference = typeof value === 'string' && value.trim() ? value.trim() : null;
  return {
    hasOverride,
    override: hasOverride ? saved : null,
    reference,
    effective: hasOverride ? (saved || null) : reference,
    sourceVerified: Boolean(source),
  };
}

// Changing the verified GC after adding contacts needs an explicit, separately
// designed migration so history from the previous company is not relabeled.
export function gcContactContextHasData(contactInfo) {
  if (!contactInfo || typeof contactInfo !== 'object') return false;
  if (Array.isArray(contactInfo.teamMembers) && contactInfo.teamMembers.length) return true;
  for (const field of GC_COMPANY_FIELDS) {
    if (contactInfo[field.key] !== undefined && contactInfo[field.key] !== null) return true;
  }
  for (const role of ['pm','superintendent']) {
    for (const key of ['name','office','mobile','email']) {
      const value = contactInfo[role]?.[key];
      if (value !== undefined && value !== null) return true;
    }
  }
  return false;
}
