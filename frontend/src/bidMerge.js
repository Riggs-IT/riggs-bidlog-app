// The preview mirrors the Data API's authoritative merge calculation.
// Source bid Notes are appended; source GCs precede target GCs, as in Power Fx.
export const MAX_BID_MERGE_SOURCES = 15;

function uniqueText(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = String(value ?? '').trim();
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function gcParts(value) {
  return String(value ?? '')
    .split('¡')
    .map(value => value.trim())
    .filter(Boolean);
}

export function calculateBidMergePreview(target, sources) {
  const originalNotes = String(target?.notes ?? '');
  const sourceNotes = uniqueText(sources.map(item => item?.notes));
  const notes = originalNotes
    + (originalNotes.trim() && sourceNotes.length ? '\n\n' : '')
    + sourceNotes.join('\n');
  const contractors = uniqueText([
    ...sources.flatMap(item => gcParts(item?.generalContractors)),
    ...gcParts(target?.generalContractors),
  ]);
  return {
    notes: notes || null,
    generalContractors: contractors,
  };
}

export function validMergeBid(row) {
  const id = row?.sharePointItemId;
  return Number.isSafeInteger(Number(id))
    && Number(id) > 0
    && ['POTENTIAL', 'ASSIGNED'].includes(String(row?.status ?? '').trim().toUpperCase());
}
