/** Canonical Form 140 directory. Legacy bid writes still persist names, not IDs. */
export const MULTIPLE_GCS = '__MULTIPLE_GCS__';
export const GC_REFERENCE_TTL_MS = 60_000;

export function nameKey(value) {
  return String(value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

function formatKey(value) {
  // Only typography, not words, abbreviations, accents, or company suffixes.
  return nameKey(value).replace(/[\s.,'’\-‐‑–—]/gu, '');
}

export function generalContractorNames(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [value])
    .flatMap(item => String(item ?? '').split('¡'))
    .map(item => item.trim()).filter(Boolean)
    .filter(name => {
      const key = name.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function canonicalDirectory(items) {
  if (!Array.isArray(items)) throw new Error('General Contractor directory returned an invalid response.');
  const byId = new Map();
  const byName = new Map();
  const byFormat = new Map();
  const add = (map, key, row) => map.set(key, [...(map.get(key) || []), row]);
  for (const item of items) {
    if (item?.isActive === false || item?.isActive === 0) continue;
    // sharePointItemId currently contains PotentialGCID, not a SharePoint ID.
    const rawId = item?.potentialGCID ?? item?.potentialGcId ?? item?.sharePointItemId;
    const id = String(rawId ?? '').trim();
    const name = String(item?.name ?? '').trim();
    if (!/^[1-9]\d*$/.test(id) || !name || name.includes('¡')
        || (typeof rawId === 'number' && !Number.isSafeInteger(rawId))) {
      throw new Error('General Contractor directory contains an invalid identity or name.');
    }
    if (byId.has(id)) throw new Error('General Contractor directory contains a duplicate record ID.');
    const cityStateZip = String(item.cityStateZip ?? '').trim();
    const streetAddress = String(item.streetAddress ?? '').trim();
    const row = Object.freeze({ ...item, id, name, cityStateZip, streetAddress,
      searchText: nameKey([name, cityStateZip, streetAddress, item.email, item.phoneNumber].filter(Boolean).join(' ')),
    });
    byId.set(id, row);
    add(byName, nameKey(name), row);
    add(byFormat, formatKey(name), row);
  }
  const rows = Object.freeze([...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name) || a.cityStateZip.localeCompare(b.cityStateZip)
    || a.streetAddress.localeCompare(b.streetAddress) || a.id.localeCompare(b.id, 'en', { numeric: true })));
  return Object.freeze({ items: rows, byId, byName, byFormat });
}

// Explicit mapping requested in the GC handoff, not fuzzy company matching.
// Applies only when the target resolves to exactly one active directory record.
const APPROVED_ALIASES = new Map([
  [formatKey('A.R. Mays'), ['A.R. Mays Construction']],
  [formatKey('Willmeng'), ['Willmeng Construction', 'Willmeng Construction Inc.', 'Willmeng Construction, Inc.']],
  [formatKey('SUNSTATE'), ['Sun State Builders']],
  [formatKey('Wespac'), ['Wespac Construction', 'Wespac Construction Inc.', 'Wespac Construction, Inc.']],
  [formatKey('LGE'), ['LGE Design Build']],
  [formatKey('LGE Design'), ['LGE Design Build']],
  [formatKey('BIG-D'), ['Big-D Construction', 'Big D Construction']],
]);

function approvedAliasMatches(raw, directory) {
  const targets = APPROVED_ALIASES.get(formatKey(raw)) || [];
  const unique = new Map();
  for (const target of targets) {
    for (const row of directory.byFormat.get(formatKey(target)) || []) {
      unique.set(row.id, row);
    }
  }
  return [...unique.values()];
}

export function resolveContractor(name, directory) {
  const raw = String(name ?? '').trim();
  const exact = directory.byName.get(nameKey(raw)) || [];
  const formatted = directory.byFormat.get(formatKey(raw)) || [];
  let matches = exact.length ? exact : formatted;
  let method = exact.length ? 'NAME' : 'FORMAT';
  if (!matches.length && APPROVED_ALIASES.has(formatKey(raw))) {
    matches = approvedAliasMatches(raw, directory);
    method = 'APPROVED_ALIAS';
  }
  if (matches.length === 1) return { key: `gc:${matches[0].id}`, name: matches[0].name,
    record: matches[0], status: 'CANONICAL', method, raw };
  return { key: `raw:${nameKey(raw)}`, name: raw, record: null,
    status: matches.length > 1 ? 'AMBIGUOUS' : 'UNMATCHED', method: null, raw };
}

export function contractorTokens(value, directory) {
  const seen = new Set();
  return generalContractorNames(value).map(name => resolveContractor(name, directory))
    .filter(token => { if (seen.has(token.key)) return false; seen.add(token.key); return true; });
}

// Preserve a selected legacy name when directory loading gives it a canonical key.
export function canonicalFilterKey(value, directory) {
  return typeof value === 'string' && value.startsWith('raw:')
    ? resolveContractor(value.slice(4), directory).key : value;
}

export function contractorFilterOptions(values, directory, selected = null) {
  const map = new Map();
  for (const value of values) for (const token of contractorTokens(value, directory)) {
    if (!map.has(token.key)) map.set(token.key, { value: token.key, label: token.name,
      status: token.status });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
}

export function contractorFilterMatch(value, filter, allValue, directory) {
  if (!filter || filter === allValue) return true;
  if (filter === MULTIPLE_GCS) return generalContractorNames(value).length > 1;
  const tokens = contractorTokens(value, directory);
  if (/^(gc|raw):/.test(filter)) return tokens.some(token => token.key === filter);
  const target = resolveContractor(filter, directory);
  return tokens.some(token => token.key === target.key || nameKey(token.raw) === nameKey(filter));
}

export function selectedRecords(value, directory, chosenIds = {}) {
  return generalContractorNames(value).map(name => {
    const hasChosenId = Object.hasOwn(chosenIds, nameKey(name));
    const candidate = directory.byId.get(chosenIds[nameKey(name)]);
    const resolution = resolveContractor(name, directory);
    const record = hasChosenId ? (candidate && nameKey(candidate.name) === nameKey(name) ? candidate : null) : resolution.record;
    return { name, record, ambiguous: !record && !hasChosenId && resolution.status === 'AMBIGUOUS',
      currentOnly: !record && (hasChosenId || resolution.status !== 'AMBIGUOUS') };
  });
}

export function selectContractor(value, id, directory, multiple = true, chosenIds = {}) {
  const option = directory.byId.get(String(id));
  if (!option) throw new Error('Choose an active General Contractor directory record.');
  const selected = selectedRecords(value, directory, chosenIds);
  const alreadyChosen = selected.some(entry => entry.record?.id === option.id);
  const keep = selected.filter(entry => entry.record?.id !== option.id
    && nameKey(entry.name) !== nameKey(option.name)
    && !(entry.record && nameKey(entry.record.name) === nameKey(option.name)));
  const ids = { ...chosenIds };
  delete ids[nameKey(option.name)];
  if (!alreadyChosen) ids[nameKey(option.name)] = option.id;
  return { value: alreadyChosen ? keep.map(entry => entry.name)
    : multiple ? [...keep.map(entry => entry.name), option.name] : [option.name],
    chosenIds: multiple ? ids : alreadyChosen ? {} : { [nameKey(option.name)]: option.id } };
}

/** One bounded response + one in-flight request, shared by filters and editors. */
export function createGcReferenceStore({ fetcher, now = Date.now, ttl = GC_REFERENCE_TTL_MS } = {}) {
  const emptyDirectory = canonicalDirectory([]);
  const initial = () => Object.freeze({ directory: emptyDirectory, items: emptyDirectory.items,
    loading: false, error: null, loadedAt: null });
  let snapshot = initial();
  let generation = 0;
  let flight = null;
  const listeners = new Set();
  const publish = changes => { snapshot = Object.freeze({ ...snapshot, ...changes }); listeners.forEach(fn => fn()); };
  const getSnapshot = () => snapshot;
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const clear = () => { ++generation; flight?.controller.abort(); flight = null; snapshot = initial(); listeners.forEach(fn => fn()); };
  function load({ force = false } = {}) {
    if (flight && !force) return flight.promise;
    if (!force && !snapshot.error && snapshot.loadedAt !== null && now() - snapshot.loadedAt < ttl) return Promise.resolve(snapshot.items);
    const token = ++generation;
    flight?.controller.abort();
    const controller = new AbortController();
    const current = { controller, promise: null };
    flight = current;
    publish({ loading: true, error: null });
    current.promise = Promise.resolve().then(async () => {
      const response = await (fetcher || ((...args) => window.fetch(...args)))(
        '/api/bid-log/reference/general-contractors', { method: 'GET', credentials: 'same-origin',
          cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`General Contractor directory unavailable (HTTP ${response.status}).`);
      const payload = await response.json();
      const directory = canonicalDirectory(payload?.items);
      if (generation !== token || controller.signal.aborted) throw Object.assign(new Error('Directory read superseded.'), { name: 'AbortError' });
      publish({ directory, items: directory.items, loading: false, error: null, loadedAt: now() });
      return directory.items;
    }).catch(error => {
      if (generation !== token || controller.signal.aborted) throw Object.assign(new Error('Directory read superseded.'), { name: 'AbortError' });
      publish({ loading: false, error: error.message || 'Unable to load General Contractors.' });
      throw error;
    }).finally(() => { if (flight === current) flight = null; });
    return current.promise;
  }
  return Object.freeze({ subscribe, getSnapshot, load, clear });
}

export const gcReference = createGcReferenceStore();
