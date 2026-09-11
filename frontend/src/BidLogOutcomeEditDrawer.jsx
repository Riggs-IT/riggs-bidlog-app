import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import BidLogGeneralContractorSelect from './BidLogGeneralContractorSelect.jsx';
import FloatingEditorShell from './FloatingEditorShell.jsx';
import {
  generalContractorNames,
} from './GeneralContractors.jsx';


const PROJECT_TYPES = [
  'Tilt',
  'CIP',
  'PRE',
  'SITE',
  'Other',
];

const PURPOSES = [
  'RET',
  'OFF',
  'PAR',
  'IND',
  'EDU',
  'MED',
  'RES',
  'MIX',
  'DAT',
  'STG',
  'SIDE',
];


function textValue(value) {
  return value === null || value === undefined
    ? ''
    : String(value);
}


function dateValue(value) {
  return value
    ? String(value).slice(0, 10)
    : '';
}


function numberValue(value) {
  return value === null || value === undefined || value === ''
    ? ''
    : String(value);
}


function percentValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '';
  }

  return String(Math.round(number * 10000) / 100);
}


function initialForm(detail) {
  return {
    bidName: textValue(detail?.bidName),
    pm: textValue(detail?.pm),
    dueDate: dateValue(detail?.dueDate),
    projectType: textValue(detail?.projectType),
    purpose: textValue(detail?.purpose),
    generalContractors: generalContractorNames(detail?.generalContractors),
    developer: textValue(detail?.developer),
    streetAddress: textValue(detail?.streetAddress),
    city: textValue(detail?.city),
    state: textValue(detail?.state),
    estimatedPrice: numberValue(detail?.estimatedPrice),
    margin: numberValue(detail?.margin),
    probabilityPercent: percentValue(detail?.probability),
    retentionPercent: percentValue(detail?.retention),
    anticipatedStartDate: dateValue(detail?.anticipatedStartDate),
    lastContactDate: dateValue(detail?.lastContactDate),
    numberOfBuildings: numberValue(detail?.numberOfBuildings),
    numberOfPanels: numberValue(detail?.numberOfPanels),
    manHours: numberValue(detail?.manHours),
    cubicYards: numberValue(detail?.cubicYards),
    squareFootage: numberValue(detail?.squareFootage),
    pavingFootage: numberValue(detail?.pavingFootage),
    redimixFootingPrice: numberValue(detail?.redimixFootingPrice),
    rebarPrice: numberValue(detail?.rebarPrice),
    notes: textValue(detail?.notes),
    reason: textValue(detail?.reason),
    realEstimate: detail?.realEstimate === true,
  };
}


function optionalText(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}


function optionalNumber(value) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    return null;
  }

  const number = Number(normalized.replaceAll(',', ''));
  return Number.isFinite(number) ? number : Number.NaN;
}


function optionalInteger(value) {
  const number = optionalNumber(value);

  if (number === null) {
    return null;
  }

  return Number.isInteger(number)
    ? number
    : Number.NaN;
}


function optionalPercentFraction(value) {
  const number = optionalNumber(value);

  if (number === null) {
    return null;
  }

  if (!Number.isFinite(number) || number < 0 || number > 100) {
    return Number.NaN;
  }

  return number / 100;
}


function arraysEqual(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}


function valuesEqual(left, right) {
  if (left === null && right === undefined) {
    return true;
  }

  if (left === undefined && right === null) {
    return true;
  }

  return left === right;
}


function errorMessage(error, fallback) {
  const detail = String(error?.message || '').trim();

  if (detail === 'bid_log_outcome_changed') {
    return 'This bid changed after you opened it. Reload the latest version before saving.';
  }

  if (detail === 'bid_log_outcome_identity_conflict') {
    return 'More than one SharePoint outcome item matches this bid. Nothing was saved.';
  }

  if (detail === 'bid_log_outcome_not_found') {
    return 'The matching SharePoint outcome item could not be found.';
  }

  if (
    detail === 'invalid_bid_log_outcome_update'
    || detail === 'invalid_bid_log_outcome_status'
  ) {
    return 'One or more values were rejected by the outcome Bid Log write contract.';
  }

  return detail || fallback;
}


async function requestJson(path, options = {}) {
  const response = await window.fetch(
    path,
    {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    },
  );

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    // Some failures may not include JSON.
  }

  if (!response.ok) {
    const error = new Error(
      payload?.detail || `Request failed with HTTP ${response.status}.`,
    );
    error.status = response.status;
    throw error;
  }

  return payload;
}


let cachedGeneralContractorOptions = null;
let generalContractorOptionsRequest = null;


async function loadGeneralContractorOptions({ force = false } = {}) {
  if (force) {
    cachedGeneralContractorOptions = null;
    generalContractorOptionsRequest = null;
  }

  if (cachedGeneralContractorOptions) {
    return cachedGeneralContractorOptions;
  }

  if (!generalContractorOptionsRequest) {
    generalContractorOptionsRequest = requestJson(
      '/api/bid-log/reference/general-contractors',
    )
      .then(payload => {
        if (!Array.isArray(payload?.items)) {
          throw new Error('General contractor reference returned an invalid response.');
        }

        cachedGeneralContractorOptions = payload.items;
        return cachedGeneralContractorOptions;
      })
      .catch(error => {
        generalContractorOptionsRequest = null;
        throw error;
      });
  }

  return generalContractorOptionsRequest;
}


function Field({
  label,
  children,
  wide = false,
  hint,
}) {
  return (
    <label className={`bid-edit-field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}


function ToggleField({
  checked,
  label,
  description,
  onChange,
  disabled = false,
}) {
  return (
    <label className="bid-edit-toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
      />
      <span className="bid-edit-toggle-control" aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}


export default function BidLogOutcomeEditDrawer({
  originalBidLogId,
  outcomeStatus,
  initialBidName = '',
  user,
  pmOptions = [],
  onClose,
  onSaved,
}) {
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const [gcOptions, setGcOptions] = useState(cachedGeneralContractorOptions || []);
  const [gcOptionsLoading, setGcOptionsLoading] = useState(false);
  const [gcOptionsError, setGcOptionsError] = useState(null);

  const role = String(user?.appRole || '').trim().toUpperCase();
  const canEdit = role === 'ADMIN' || role === 'OPERATIONS';

  const editableFields = useMemo(
    () => new Set(Array.isArray(detail?.editableFields) ? detail.editableFields : []),
    [detail?.editableFields],
  );

  const canField = name => canEdit && editableFields.has(name);
  const showField = name => editableFields.has(name);

  const editorPmOptions = useMemo(
    () => Array.from(
      new Set(
        [detail?.pm, ...pmOptions]
          .filter(Boolean)
          .map(value => String(value).trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b)),
    [detail?.pm, pmOptions],
  );

  async function loadGcOptions({ force = false } = {}) {
    if (!canEdit) {
      return;
    }

    setGcOptionsLoading(true);
    setGcOptionsError(null);

    try {
      setGcOptions(await loadGeneralContractorOptions({ force }));
    } catch (error) {
      setGcOptionsError(
        errorMessage(error, 'Unable to load the Potential GCs list.'),
      );
    } finally {
      setGcOptionsLoading(false);
    }
  }

  async function loadDetail() {
    if (!originalBidLogId || !outcomeStatus) {
      return;
    }

    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const next = await requestJson(
        `/api/bid-log/outcomes/${originalBidLogId}?status=${encodeURIComponent(outcomeStatus)}`,
      );

      const normalized =
        !textValue(next?.bidName).trim()
        && textValue(initialBidName).trim()
          ? {
              ...next,
              bidName:
                textValue(initialBidName)
                  .trim(),
            }
          : next;

      setDetail(normalized);
      setForm(initialForm(normalized));
    } catch (error) {
      setLoadError(errorMessage(error, 'Unable to load this bid.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(
    () => {
      loadDetail();
    },
    [originalBidLogId, outcomeStatus],
  );

  useEffect(
    () => {
      loadGcOptions();
    },
    [canEdit],
  );

  function updateField(name, value) {
    setForm(current => ({
      ...current,
      [name]: value,
    }));
    setSaveError(null);
    setSaveMessage(null);
  }

  function buildChanges() {
    const changes = {};
    const invalid = [];

    if (!form || !detail) {
      return { changes, invalid };
    }

    const textFields = [
      'bidName',
      'pm',
      'projectType',
      'purpose',
      'developer',
      'streetAddress',
      'city',
      'state',
      'notes',
      'reason',
    ];

    for (const name of textFields) {
      if (!editableFields.has(name)) {
        continue;
      }

      const next = optionalText(form[name]);
      const original = optionalText(detail?.[name]);

      if (!valuesEqual(next, original)) {
        changes[name] = next;
      }
    }

    if (editableFields.has('generalContractors')) {
      const nextGcs = generalContractorNames(form.generalContractors);
      const originalGcs = generalContractorNames(detail?.generalContractors);

      if (!arraysEqual(nextGcs, originalGcs)) {
        changes.generalContractors = nextGcs.length ? nextGcs : null;
      }
    }

    for (const name of ['dueDate', 'anticipatedStartDate', 'lastContactDate']) {
      if (!editableFields.has(name)) {
        continue;
      }

      const next = optionalText(form[name]);
      const original = dateValue(detail?.[name]) || null;

      if (!valuesEqual(next, original)) {
        changes[name] = next;
      }
    }

    for (const name of [
      'estimatedPrice',
      'margin',
      'cubicYards',
      'squareFootage',
      'pavingFootage',
      'redimixFootingPrice',
      'rebarPrice',
    ]) {
      if (!editableFields.has(name)) {
        continue;
      }

      const next = optionalNumber(form[name]);
      const original = detail?.[name] === null || detail?.[name] === undefined
        ? null
        : Number(detail[name]);

      if (Number.isNaN(next)) {
        invalid.push(`${name} must be a valid number.`);
        continue;
      }

      if (next !== null && name !== 'margin' && next < 0) {
        invalid.push(`${name} cannot be negative.`);
        continue;
      }

      if (!valuesEqual(next, original)) {
        changes[name] = next;
      }
    }

    for (const name of ['numberOfBuildings', 'numberOfPanels', 'manHours']) {
      if (!editableFields.has(name)) {
        continue;
      }

      const next = optionalInteger(form[name]);
      const original = detail?.[name] === null || detail?.[name] === undefined
        ? null
        : Number(detail[name]);

      if (Number.isNaN(next) || (next !== null && next < 0)) {
        invalid.push(`${name} must be a whole number of zero or more.`);
        continue;
      }

      if (!valuesEqual(next, original)) {
        changes[name] = next;
      }
    }

    for (const [formName, apiName] of [
      ['probabilityPercent', 'probability'],
      ['retentionPercent', 'retention'],
    ]) {
      if (!editableFields.has(apiName)) {
        continue;
      }

      const next = optionalPercentFraction(form[formName]);
      const original = detail?.[apiName] === null || detail?.[apiName] === undefined
        ? null
        : Number(detail[apiName]);

      if (Number.isNaN(next)) {
        invalid.push(`${apiName} must be between 0 and 100%.`);
        continue;
      }

      if (!valuesEqual(next, original)) {
        changes[apiName] = next;
      }
    }

    if (editableFields.has('realEstimate')) {
      const next = form.realEstimate === true;
      const original = detail?.realEstimate === true;

      if (next !== original) {
        changes.realEstimate = next;
      }
    }

    return { changes, invalid };
  }

  function requestClose() {
    if (saving) {
      return;
    }

    const pending = form && detail
      ? buildChanges().changes
      : {};

    if (
      Object.keys(pending).length > 0
      && !window.confirm('Discard unsaved bid changes and return to the Bid Log?')
    ) {
      return;
    }

    onClose();
  }

  async function save() {
    if (!canEdit || !detail?.etag || !form || saving) {
      return;
    }

    const { changes, invalid } = buildChanges();

    if (invalid.length) {
      setSaveError(invalid[0]);
      return;
    }

    if (!Object.keys(changes).length) {
      setSaveMessage('No changes to save.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const updated = await requestJson(
        `/api/bid-log/outcomes/${originalBidLogId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: outcomeStatus,
            expectedEtag: detail.etag,
            ...changes,
          }),
        },
      );

      setDetail(updated);
      setForm(initialForm(updated));
      setSaveMessage('Bid saved.');
      onSaved?.(updated);
    } catch (error) {
      setSaveError(errorMessage(error, 'Unable to save this bid.'));
    } finally {
      setSaving(false);
    }
  }

  const hasUnsavedChanges = Boolean(
    form
    && detail
    && Object.keys(buildChanges().changes).length,
  );

  const showProject = [
    'generalContractors',
    'developer',
    'streetAddress',
    'city',
    'state',
  ].some(showField);

  const showEstimate = [
    'estimatedPrice',
    'margin',
    'probability',
    'retention',
    'numberOfBuildings',
    'numberOfPanels',
    'manHours',
    'cubicYards',
    'squareFootage',
    'pavingFootage',
    'redimixFootingPrice',
    'rebarPrice',
  ].some(showField);

  const showSchedule = [
    'anticipatedStartDate',
    'lastContactDate',
  ].some(showField);

  if (!originalBidLogId || !outcomeStatus) {
    return null;
  }

  return (
    <FloatingEditorShell
      eyebrow={`${outcomeStatus.toUpperCase()} · EDIT BID LOG`}
      title={detail?.bidName || initialBidName || `Bid ${originalBidLogId}`}
      subtitle={detail?.sourceListName || outcomeStatus}
      backLabel="Back to Bid Log"
      onClose={requestClose}
      saving={saving}
      className="bid-log-edit-drawer bid-log-outcome-edit-drawer"
      bodyClassName="bid-log-edit-body"
      footer={
        !loading && !loadError && detail && form ? (
          <footer className="bid-log-edit-footer floating-editor-footer">
            <div className="floating-editor-footer-status">
              <small>
                Save updates the live {detail.sourceListName} SharePoint item.
              </small>
              {hasUnsavedChanges && (
                <span className="floating-editor-dirty-indicator">
                  Unsaved changes
                </span>
              )}
            </div>
            <div className="bid-log-edit-footer-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={requestClose}
                disabled={saving}
              >
                Back to Bid Log
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="primary-button bid-log-save-button"
                  onClick={save}
                  disabled={saving || !detail.etag || !hasUnsavedChanges}
                >
                  {saving ? 'Saving…' : 'Save Bid'}
                </button>
              )}
            </div>
          </footer>
        ) : null
      }
    >
      {loading && (
        <div className="bid-edit-message">
          Loading latest {outcomeStatus} values…
        </div>
      )}

      {loadError && (
        <div className="bid-edit-message error">
          <span>{loadError}</span>
          <button type="button" className="secondary-button" onClick={loadDetail}>
            Retry
          </button>
        </div>
      )}

      {!loading && !loadError && detail && form && (
        <>
          {!canEdit && (
            <div className="bid-edit-message">
              Your role can view this bid, but only Administrators and Operations can edit it.
            </div>
          )}

          <div className="bid-edit-message outcome">
            This is the stored <strong>{outcomeStatus}</strong> record. Saving changes its fields only; it does not move the bid to another lifecycle status.
          </div>

          {saveError && (
            <div className="bid-edit-message error bid-edit-save-message">
              <span>{saveError}</span>
              {saveError.startsWith('This bid changed after') && (
                <button type="button" className="secondary-button" onClick={loadDetail}>
                  Reload Latest
                </button>
              )}
            </div>
          )}

          {saveMessage && (
            <div className="bid-edit-message success">
              {saveMessage}
            </div>
          )}

          <section className="bid-edit-section">
            <div className="bid-edit-section-heading">
              <div>
                <span className="section-kicker">BID</span>
                <h3>Bid & Assignment</h3>
              </div>
              {detail.etag && <small>Optimistic concurrency enabled</small>}
            </div>

            <div className="bid-edit-grid three-column">
              {showField('bidName') && (
                <Field label="Bid Name" wide>
                  <input
                    type="text"
                    value={form.bidName}
                    disabled={!canField('bidName')}
                    onChange={event => updateField('bidName', event.target.value)}
                  />
                </Field>
              )}

              {showField('pm') && (
                <Field label="PM">
                  <input
                    type="text"
                    list="bid-log-outcome-pm-options"
                    value={form.pm}
                    disabled={!canField('pm')}
                    onChange={event => updateField('pm', event.target.value)}
                  />
                  <datalist id="bid-log-outcome-pm-options">
                    {editorPmOptions.map(pm => <option key={pm} value={pm} />)}
                  </datalist>
                </Field>
              )}

              {showField('dueDate') && (
                <Field label="Due Date">
                  <input
                    type="date"
                    value={form.dueDate}
                    disabled={!canField('dueDate')}
                    onChange={event => updateField('dueDate', event.target.value)}
                  />
                </Field>
              )}

              <Field label="Status" hint="Lifecycle status is fixed in this editor.">
                <input
                  type="text"
                  value={outcomeStatus}
                  readOnly
                  className="bid-edit-readonly-input"
                />
              </Field>

              {showField('projectType') && (
                <Field label="Project Type">
                  <select
                    value={form.projectType}
                    disabled={!canField('projectType')}
                    onChange={event => updateField('projectType', event.target.value)}
                  >
                    <option value="">—</option>
                    {PROJECT_TYPES.map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Field>
              )}

              {showField('purpose') && (
                <Field label="Purpose">
                  <select
                    value={form.purpose}
                    disabled={!canField('purpose')}
                    onChange={event => updateField('purpose', event.target.value)}
                  >
                    <option value="">—</option>
                    {PURPOSES.map(value => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Field>
              )}
            </div>

            {showField('realEstimate') && (
              <div className="bid-edit-toggle-row">
                <ToggleField
                  checked={form.realEstimate}
                  label="Real Bid"
                  description="Historical Real Bid flag for this outcome record."
                  disabled={!canField('realEstimate')}
                  onChange={value => updateField('realEstimate', value)}
                />
              </div>
            )}
          </section>

          {showProject && (
            <section className="bid-edit-section">
              <div className="bid-edit-section-heading">
                <div>
                  <span className="section-kicker">PROJECT</span>
                  <h3>GC & Location</h3>
                </div>
              </div>

              <div className="bid-edit-grid two-column">
                {showField('generalContractors') && (
                  <Field label="General Contractors" wide>
                    <BidLogGeneralContractorSelect
                      value={form.generalContractors}
                      options={gcOptions}
                      loading={gcOptionsLoading}
                      error={gcOptionsError}
                      disabled={!canField('generalContractors')}
                      onChange={value => updateField('generalContractors', value)}
                      onRetry={() => loadGcOptions({ force: true })}
                    />
                  </Field>
                )}

                {showField('developer') && (
                  <Field label="Developer">
                    <input type="text" value={form.developer} disabled={!canField('developer')} onChange={event => updateField('developer', event.target.value)} />
                  </Field>
                )}

                {showField('streetAddress') && (
                  <Field label="Street Address">
                    <input type="text" value={form.streetAddress} disabled={!canField('streetAddress')} onChange={event => updateField('streetAddress', event.target.value)} />
                  </Field>
                )}

                {showField('city') && (
                  <Field label="City">
                    <input type="text" value={form.city} disabled={!canField('city')} onChange={event => updateField('city', event.target.value)} />
                  </Field>
                )}

                {showField('state') && (
                  <Field label="State">
                    <input type="text" value={form.state} disabled={!canField('state')} onChange={event => updateField('state', event.target.value)} />
                  </Field>
                )}
              </div>
            </section>
          )}

          {showEstimate && (
            <section className="bid-edit-section">
              <div className="bid-edit-section-heading">
                <div>
                  <span className="section-kicker">ESTIMATE</span>
                  <h3>Estimate & Quantities</h3>
                </div>
              </div>

              <div className="bid-edit-grid four-column">
                {showField('estimatedPrice') && <Field label="Estimated Price"><input type="number" min="0" step="0.01" value={form.estimatedPrice} disabled={!canField('estimatedPrice')} onChange={event => updateField('estimatedPrice', event.target.value)} /></Field>}
                {showField('margin') && <Field label="Margin"><input type="number" step="0.0001" value={form.margin} disabled={!canField('margin')} onChange={event => updateField('margin', event.target.value)} /></Field>}
                {showField('probability') && <Field label="Probability %"><input type="number" min="0" max="100" step="0.1" value={form.probabilityPercent} disabled={!canField('probability')} onChange={event => updateField('probabilityPercent', event.target.value)} /></Field>}
                {showField('retention') && <Field label="Retention %"><input type="number" min="0" max="100" step="0.1" value={form.retentionPercent} disabled={!canField('retention')} onChange={event => updateField('retentionPercent', event.target.value)} /></Field>}
                {showField('numberOfBuildings') && <Field label="# Buildings"><input type="number" min="0" step="1" value={form.numberOfBuildings} disabled={!canField('numberOfBuildings')} onChange={event => updateField('numberOfBuildings', event.target.value)} /></Field>}
                {showField('numberOfPanels') && <Field label="# Panels"><input type="number" min="0" step="1" value={form.numberOfPanels} disabled={!canField('numberOfPanels')} onChange={event => updateField('numberOfPanels', event.target.value)} /></Field>}
                {showField('manHours') && <Field label="Man Hours"><input type="number" min="0" step="1" value={form.manHours} disabled={!canField('manHours')} onChange={event => updateField('manHours', event.target.value)} /></Field>}
                {showField('cubicYards') && <Field label="Cubic Yards"><input type="number" min="0" step="0.01" value={form.cubicYards} disabled={!canField('cubicYards')} onChange={event => updateField('cubicYards', event.target.value)} /></Field>}
                {showField('squareFootage') && <Field label="Square Footage"><input type="number" min="0" step="0.01" value={form.squareFootage} disabled={!canField('squareFootage')} onChange={event => updateField('squareFootage', event.target.value)} /></Field>}
                {showField('pavingFootage') && <Field label="Paving SF"><input type="number" min="0" step="0.01" value={form.pavingFootage} disabled={!canField('pavingFootage')} onChange={event => updateField('pavingFootage', event.target.value)} /></Field>}
                {showField('redimixFootingPrice') && <Field label="Redimix Footing Price"><input type="number" min="0" step="0.01" value={form.redimixFootingPrice} disabled={!canField('redimixFootingPrice')} onChange={event => updateField('redimixFootingPrice', event.target.value)} /></Field>}
                {showField('rebarPrice') && <Field label="Rebar Price"><input type="number" min="0" step="0.01" value={form.rebarPrice} disabled={!canField('rebarPrice')} onChange={event => updateField('rebarPrice', event.target.value)} /></Field>}
              </div>
            </section>
          )}

          {showSchedule && (
            <section className="bid-edit-section">
              <div className="bid-edit-section-heading">
                <div>
                  <span className="section-kicker">DATES</span>
                  <h3>Schedule & Follow-up</h3>
                </div>
              </div>

              <div className="bid-edit-grid three-column">
                {showField('anticipatedStartDate') && <Field label="Anticipated Start"><input type="date" value={form.anticipatedStartDate} disabled={!canField('anticipatedStartDate')} onChange={event => updateField('anticipatedStartDate', event.target.value)} /></Field>}
                {showField('lastContactDate') && <Field label="Last Contact"><input type="date" value={form.lastContactDate} disabled={!canField('lastContactDate')} onChange={event => updateField('lastContactDate', event.target.value)} /></Field>}
              </div>
            </section>
          )}

          {(showField('notes') || showField('reason')) && (
            <section className="bid-edit-section">
              <div className="bid-edit-section-heading">
                <div>
                  <span className="section-kicker">NOTES</span>
                  <h3>Bid Notes</h3>
                </div>
              </div>

              {showField('reason') && (
                <Field label="Reason" wide>
                  <textarea
                    className="bid-edit-notes-textarea"
                    rows="4"
                    value={form.reason}
                    disabled={!canField('reason')}
                    onChange={event => updateField('reason', event.target.value)}
                  />
                </Field>
              )}

              {showField('notes') && (
                <Field label="Notes" wide>
                  <textarea
                    className="bid-edit-notes-textarea"
                    rows="10"
                    value={form.notes}
                    disabled={!canField('notes')}
                    onChange={event => updateField('notes', event.target.value)}
                  />
                </Field>
              )}
            </section>
          )}
        </>
      )}
    </FloatingEditorShell>
  );
}
