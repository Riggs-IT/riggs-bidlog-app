// Presentation only: hide deferred job scheduling controls without changing
// the persisted values or server field catalog. Metrics have their own card.
const hiddenProjectFields = new Set(['jobNumber','numberOfBuildings','plannedStartDate','plannedEndDate','scheduleNotes']);
const metricKeys = new Set(['squareFootageSF','cubicYardsCY']);
export function projectEditorSectionFields(fields, section) {
  return fields.filter(field => {
    if (hiddenProjectFields.has(field.key)) return false;
    const target = metricKeys.has(field.key) ? 'metrics'
      : field.key === 'contractFlag' ? 'basics'
      : ['contract','accounting'].includes(field.section) ? 'admin' : field.section;
    return target === section;
  });
}

export function savedReferenceContact(field, selectedId, byKey, emailKey, addressKeys) {
  // Do not associate an old firm's contact data with a newly selected firm.
  // The save route will verify the new lookup and return the derived values.
  if (selectedId !== (field.selectionId ?? null)) return null;
  const text = key => {
    const value = byKey.get(key)?.value;
    return typeof value === 'string' ? value.trim() : '';
  };
  return {email:text(emailKey) || null,
    address:addressKeys.map(text).filter(Boolean).join('\n') || null};
}

// Contact preview is display-only: never submit a directory address/email as a
// browser-generated write. On a saved selection, keep authoritative JIS values.
export function selectedReferenceContact(field, selectedId, byKey, emailKey, addressKeys, directories={}) {
  if (selectedId == null) return null;
  if (selectedId === field.selectionId) return savedReferenceContact(field, selectedId, byKey, emailKey, addressKeys);
  if (!field.options?.some(option => option.id === selectedId)) return null;
  const gc = field.key === 'gcLookupId';
  const directory = gc ? directories.gcs : field.key === 'architectLookupId' ? directories.architects : field.key === 'structuralEngineerLookupId' ? directories.engineers : null;
  const matches = (directory || []).filter(row => (gc ? row.cognitoLookupId : row.id) === selectedId);
  if (matches.length !== 1) return null;
  const record = matches[0];
  const text = value => typeof value === 'string' ? value.trim() : '';
  return {email:text(record.email) || null,
    address:(gc ? [record.streetAddress,record.cityStateZip].map(text).filter(Boolean).join('\n') : text(record.address)) || null};
}

export function projectFieldAffix(field) {
  if (field.kind === 'percentText') return '%';
  if (field.kind === 'moneyText' || field.key === 'foundationContractAmount' ||
      (field.section === 'suppliers' && field.kind === 'number' && field.key.endsWith('Amount'))) return '$';
  return null;
}

// Read-only reference values are not new workflow actions or proof of delivery.
export function recordedProjectValue(value, kind) {
  if (kind === 'boolean') return value === true ? 'Yes' : value === false ? 'No' : 'Not recorded';
  return typeof value === 'string' && value.trim() ? value : 'Not recorded';
}

// A provider default NumberOfBuildings is not a named building row. Do not
// fabricate rows or write a count when rendering the layout.
export function projectBuildingLayout(rows, canAdd, editing=false) {
  const known=Array.isArray(rows);
  const named=known&&rows.some(row=>typeof row?.name==='string'&&row.name.trim()!=='');
  const showBuildings=known&&(named||editing||rows.some(row=>row?.id===null));
  return {showBuildings,canAddBuildings:known&&!showBuildings&&canAdd===true,unavailable:!known};
}

export function beginProjectBuildings(rows) {
  if (!Array.isArray(rows) || rows.some(row=>typeof row?.name!=='string'||row.name.trim())) return null;
  // Keep existing provider row IDs. If a legacy blank slot already exists,
  // use it rather than increment a provider default or invent a row ID.
  return rows.length?rows.map(row=>({...row})):[{id:null,name:''}];
}

// Cancelling the first unsaved building must restore the original field,
// including legacy blank provider rows, without submitting an empty repeater.
export function canCancelEmptyBuildingDraft(field) {
  return field?.key==='buildingNames' && field.kind==='rows' && field.editable===true &&
    Array.isArray(field.value) && field.value.every(row=>typeof row?.name==='string'&&!row.name.trim());
}

export function cancelEmptyBuildingDraft(values,field) {
  if (!canCancelEmptyBuildingDraft(field) || !Object.hasOwn(values,'buildingNames') ||
      !Array.isArray(values.buildingNames) || values.buildingNames.length!==1) return values;
  const next={...values};
  delete next.buildingNames;
  return next;
}
