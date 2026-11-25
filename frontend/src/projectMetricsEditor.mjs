/** Independent, revisioned SF/CY edits. No writes to Cognito or Bid Log.
 * The existing project drawer can combine UI save actions, but each backend
 * destination commits separately. No automatic PATCH retry on uncertain result.
 */
export function quantityDecimal(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  if (!/^\d{1,15}(?:\.\d{1,4})?$/.test(raw)) {
    throw new Error('Enter a nonnegative number with up to four decimal places. Zero is allowed.');
  }
  const [integer, fraction = ''] = raw.split('.');
  const whole = integer.replace(/^0+/, '') || '0';
  const places = fraction.replace(/0+$/, '');
  return places ? `${whole}.${places}` : whole;
}

// Display whole quantities without rewriting existing fractional SQL values.
export function quantityWholeDisplay(value) {
  if(value==null||value==='')return '';
  try {
    const normalized=quantityDecimal(value);
    const [whole,fraction='']=normalized.split('.');
    return String(BigInt(whole)+(fraction[0]>='5'?1n:0n));
  } catch {return '';}
}
export function quantityWholeEdit(value) {
  const normalized=quantityDecimal(value);
  if(normalized!==null&&normalized.includes('.'))throw new Error('Enter a whole number.');
  return normalized;
}

function sameQuantity(a, b) {
  try { return quantityDecimal(a) === quantityDecimal(b); }
  catch { return String(a ?? '') === String(b ?? ''); }
}

export function metricsChanges(base, draft) {
  if (!base || !draft) return [];
  const keys = base.panelApplicable === true ? ['squareFootage','cubicYards','numberOfPanels'] : ['squareFootage','cubicYards'];
  return keys.filter(key => !sameQuantity(quantityWholeDisplay(base[key]), draft[key]));
}

export function validateMetricEdits(base,draft) {
  return Object.fromEntries(metricsChanges(base,draft).map(field=>{
    const value=quantityWholeEdit(draft[field]);
    if(value===null)throw new Error('Enter a value or 0 for the quantity being edited.');
    if(field==='numberOfPanels'&&Number(value)>2147483647)throw new Error('Enter a panel count no greater than 2,147,483,647.');
    return [field,value];
  }));
}

function draftFrom(payload) {
  return {
    squareFootage: quantityWholeDisplay(payload.squareFootage),
    cubicYards: quantityWholeDisplay(payload.cubicYards),
    ...(payload.panelApplicable === true ? {numberOfPanels: quantityWholeDisplay(payload.numberOfPanels)} : {}),
  };
}

export function createProjectMetricsEditor({
  jobListId, setupId = null, canEdit, fetcher = (...args) => globalThis.fetch(...args),
  newId = () => globalThis.crypto.randomUUID(), timeoutMs = 25000,
  onAuthFailure = () => {},
}) {
  const id = Number(jobListId);
  const setup = typeof setupId === 'string' ? setupId.toLowerCase() : null;
  const validSetup = setup !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(setup) && setup !== '00000000-0000-0000-0000-000000000000';
  const path = setup !== null ? `/api/project-setups/jis/${setup}/metrics` : `/api/active-projects/${id}/metrics`;
  const listeners = new Set();
  const controllers = new Set();
  let epoch = 0;
  let active = false;
  let writing = false;
  let state = {
    snapshot: null, draft: null, loading: false, saving: false,
    error: null, notice: null, unresolved: false, conflict: false, disabled: false,
  };
  const emit = patch => {
    if (!active) return;
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  };
  const live = generation => active && generation === epoch;
  const changed = () => metricsChanges(state.snapshot, state.draft);

  async function request(method, body) {
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(path, {
        method, cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
        ...(body ? {headers: {'Content-Type': 'application/json', ...(setup !== null ? {'X-Riggs-Setup-Write': '1'} : {})}, body: JSON.stringify(body)} : setup !== null ? {headers: {'X-Riggs-Passive-Read': '1'}} : {}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        onAuthFailure(response.status, payload?.detail, method);
        const error = new Error('Project quantities could not be loaded or saved.');
        error.status = response.status;
        error.detail = typeof payload?.detail === 'string' ? payload.detail : null;
        throw error;
      }
      if (!payload || (setup !== null ? payload.setupId !== setup || payload.projectMetricId !== 1 : Number(payload.jobListId) !== id)) throw new Error('Project metrics identity mismatch.');
      return payload;
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  }

  function isValidRead(payload) {
    return Number.isSafeInteger(payload?.revision) && payload.revision >= 0
      && (payload.squareFootage === null || typeof payload.squareFootage === 'string')
      && (payload.cubicYards === null || typeof payload.cubicYards === 'string')
      && typeof payload.canEdit === 'boolean';
  }
  function accept(payload) {
    if (!isValidRead(payload)) throw new Error('Project metrics response was invalid.');
    emit({snapshot: payload, draft: draftFrom(payload), error: null, disabled: false,
      unresolved: false, conflict: false});
  }

  async function load({force = false} = {}) {
    const generation = epoch;
    if (!live(generation) || writing || (!force && changed().length)) return false;
    emit({loading: true, error: null});
    try {
      const payload = await request('GET');
      if (!live(generation)) return false;
      accept(payload);
      return true;
    } catch (error) {
      if (live(generation)) {
        if (error.detail === 'project_metrics_reads_disabled') emit({disabled: true, error: null});
        else emit({error: 'Unable to load project quantities. Other project fields are still available.'});
      }
      return false;
    } finally {
      if (live(generation)) emit({loading: false});
    }
  }

  async function save() {
    const generation = epoch;
    if (!live(generation) || !canEdit || !state.snapshot?.canEdit || writing || state.unresolved || state.conflict) return false;
    const fields = changed();
    if (!fields.length) return true;
    let values;
    try {
      values = validateMetricEdits(state.snapshot,state.draft);
    } catch (error) {
      emit({error: error.message});
      return false;
    }
    writing = true;
    emit({saving: true, error: null, notice: null});
    let patchStarted = false;
    let acknowledged = false;
    try {
      const fresh = await request('GET');
      if (!live(generation)) return false;
      if (!isValidRead(fresh) || fresh.revision !== state.snapshot.revision
        || fields.some(field => !sameQuantity(fresh[field], state.snapshot[field]))) {
        emit({conflict: true, error: 'Project quantities changed elsewhere. Reload and review before saving.'});
        return false;
      }
      const payload = {
        operationId: newId(), expectedRevision: fresh.revision,
        setSquareFootage: fields.includes('squareFootage'),
        setCubicYards: fields.includes('cubicYards'),
        ...(fields.includes('squareFootage') ? {squareFootage: values.squareFootage} : {}),
        ...(fields.includes('cubicYards') ? {cubicYards: values.cubicYards} : {}),
        ...(fields.includes('numberOfPanels') ? {setNumberOfPanels: true, numberOfPanels: Number(values.numberOfPanels)} : {}),
      };
      patchStarted = true;
      const receipt = await request('PATCH', payload);
      if (!Number.isSafeInteger(receipt.revision) || (setup !== null ? receipt.revision !== fresh.revision + 1 || !['UPDATED','REPLAYED'].includes(receipt.result) : receipt.revision < fresh.revision)) {
        throw new Error('Project metrics save receipt invalid.');
      }
      acknowledged = true;
      // Acknowledged saves are not reissued even if post-save refresh fails.
      try {
        const after = await request('GET');
        if (!live(generation)) return false;
        if (!isValidRead(after) || (setup !== null && after.revision !== receipt.revision) || fields.some(field => !sameQuantity(after[field], values[field])) || (fields.includes('numberOfPanels') && after.panelApplicable !== true) || (setup !== null && ['squareFootage','cubicYards'].some(field => !fields.includes(field) && !sameQuantity(after[field], fresh[field])))) {
          emit({unresolved: true, error: 'Save was accepted, but the resulting values differ. Reload and review; nothing was resent.'});
          return false;
        }
        accept(after);
      } catch {
        if (!live(generation)) return false;
        if (setup !== null || fields.includes('numberOfPanels')) {
          emit({unresolved: true, error: 'SQL accepted the save, but fresh readback is unavailable. Reload and review; nothing was resent.'});
          return false;
        }
        const revised = {...fresh, revision: receipt.revision};
        for (const field of fields) revised[field] = values[field];
        accept(revised);
        emit({notice: 'Quantities saved. A fresh read is temporarily unavailable.'});
      }
      emit({notice: 'Project quantities saved.'});
      return true;
    } catch (error) {
      if (!live(generation)) return false;
      if (patchStarted && !acknowledged) {
        // Could be a lost response after a committed SQL operation. Never
        // resend automatically; a human must reload and review.
        emit({unresolved: true, error: 'Quantity save response was not confirmed. Reload and review before attempting another save.'});
      } else {
        emit({error: error.status === 409
          ? 'Project quantities changed elsewhere. Reload and review before saving.'
          : 'Unable to save project quantities. Your edits were preserved.',
          conflict: error.status === 409});
      }
      return false;
    } finally {
      writing = false;
      if (live(generation)) emit({saving: false});
    }
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot() { return state; },
    async start() {
      active = true; epoch++;
      if (setup !== null ? validSetup : Number.isSafeInteger(id) && id > 0) await load();
    },
    dispose() { active = false; epoch++; for (const c of controllers) c.abort(); controllers.clear(); },
    load, save,
    dismissNotice() { emit({notice: null}); },
    edit(field, value) {
      if (!active || !canEdit || !state.snapshot?.canEdit || writing || state.unresolved || state.conflict) return;
      if (!['squareFootage', 'cubicYards'].includes(field) && !(field === 'numberOfPanels' && state.snapshot?.panelApplicable === true)) return;
      emit({draft: {...state.draft, [field]: value}, error: null, notice: null});
    },
    discard() {
      if (writing || state.unresolved) return;
      if (state.snapshot) emit({draft: draftFrom(state.snapshot), error: null, notice: null, conflict: false});
    },
  };
}
