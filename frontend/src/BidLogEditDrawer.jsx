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


const ORDINARY_STATUSES = [
  'Potential',
  'Assigned',
];

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

  return String(
    Math.round(number * 10000) / 100,
  );
}


function initialForm(detail) {
  return {
    bidName: textValue(detail?.bidName),
    pm: textValue(detail?.pm),
    dueDate: dateValue(detail?.dueDate),
    status: textValue(detail?.status),
    projectType: textValue(detail?.projectType),
    purpose: textValue(detail?.purpose),
    generalContractors: generalContractorNames(
      detail?.generalContractors,
    ),
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
    realEstimate: detail?.realEstimate === true,
    snoozed: detail?.snoozed === true,
    snoozedUntil: dateValue(detail?.snoozedUntil),
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

  return Number.isFinite(number)
    ? number
    : Number.NaN;
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
  if (left.length !== right.length) {
    return false;
  }

  return left.every(
    (value, index) => value === right[index],
  );
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

  if (detail === 'active_bid_changed') {
    return 'This bid changed after you opened it. Reload the latest version before saving.';
  }

  if (detail === 'active_bid_lifecycle_action_required') {
    return 'This status requires a dedicated Bid Log lifecycle action. Awarded, Lost, Dead, Not Pursuing, Merged, and GC Not Awarded will be handled separately.';
  }

  if (detail === 'invalid_active_bid_update') {
    return 'One or more values were rejected by the Bid Log write contract.';
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
        ...(options.body
          ? { 'Content-Type': 'application/json' }
          : {}),
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
      payload?.detail
      || `Request failed with HTTP ${response.status}.`,
    );

    error.status = response.status;
    throw error;
  }

  return payload;
}


let cachedGeneralContractorOptions = null;
let generalContractorOptionsRequest = null;


async function loadGeneralContractorOptions({
  force = false,
} = {}) {
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
          throw new Error(
            'General contractor reference returned an invalid response.',
          );
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


export default function BidLogEditDrawer({
  sharePointItemId,
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
  const [gcOptions, setGcOptions] = useState(
    cachedGeneralContractorOptions || [],
  );
  const [gcOptionsLoading, setGcOptionsLoading] = useState(false);
  const [gcOptionsError, setGcOptionsError] = useState(null);

  const role = String(user?.appRole || '').trim().toUpperCase();
  const canEdit = role === 'ADMIN' || role === 'OPERATIONS';
  const projectionInputsRequireRealBid = Boolean(
    optionalText(form?.anticipatedStartDate)
    || optionalText(form?.probabilityPercent),
  );

  const currentStatus = String(detail?.status || '').trim();
  const ordinaryStatus = ORDINARY_STATUSES.some(
    value => value.toUpperCase() === currentStatus.toUpperCase(),
  );

  const statusOptions = useMemo(
    () => {
      if (!currentStatus || ordinaryStatus) {
        return ORDINARY_STATUSES;
      }

      return [currentStatus, ...ORDINARY_STATUSES];
    },
    [currentStatus, ordinaryStatus],
  );

  const editorPmOptions = useMemo(
    () => Array.from(
      new Set(
        [
          detail?.pm,
          ...pmOptions,
        ]
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
      const items = await loadGeneralContractorOptions({ force });
      setGcOptions(items);
    } catch (error) {
      setGcOptionsError(
        errorMessage(
          error,
          'Unable to load the Potential GCs list.',
        ),
      );
    } finally {
      setGcOptionsLoading(false);
    }
  }

  async function loadDetail() {
    if (!sharePointItemId) {
      return;
    }

    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const next = await requestJson(
        `/api/bid-log/active/${sharePointItemId}`,
      );

      /*
        The table already knows the bid name.

        Keep that as UI context if the detail source returns a
        blank/missing Title rather than presenting an empty Bid Name.
      */
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
      setLoadError(
        errorMessage(error, 'Unable to load this bid.'),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(
    () => {
      loadDetail();
    },
    [sharePointItemId],
  );

  useEffect(
    () => {
      loadGcOptions();
    },
    [canEdit],
  );

  function updateField(name, value) {
    setForm(
      current => {
        const next = {
          ...current,
          [name]: value,
        };

        if (
          (name === 'anticipatedStartDate' || name === 'probabilityPercent')
          && optionalText(value)
        ) {
          next.realEstimate = true;
        }

        return next;
      },
    );

    setSaveError(null);
    setSaveMessage(null);
  }

  function buildChanges() {
    const changes = {};
    const invalid = [];

    const textFields = [
      'pm',
      'status',
      'projectType',
      'purpose',
      'developer',
      'streetAddress',
      'city',
      'state',
      'notes',
    ];

    for (const name of textFields) {
      const next = optionalText(form[name]);
      const original = optionalText(detail?.[name]);

      if (!valuesEqual(next, original)) {
        changes[name] = next;
      }
    }


    const nextGcs = generalContractorNames(form.generalContractors);
    const originalGcs = generalContractorNames(detail?.generalContractors);

    if (!arraysEqual(nextGcs, originalGcs)) {
      changes.generalContractors = nextGcs.length ? nextGcs : null;
    }

    const dateFields = [
      'anticipatedStartDate',
      'lastContactDate',
      'snoozedUntil',
    ];

    for (const name of dateFields) {
      const next = optionalText(form[name]);
      const original = dateValue(detail?.[name]) || null;

      if (!valuesEqual(next, original)) {
        changes[name] = next;
      }
    }

    const decimalFields = [
      'estimatedPrice',
      'margin',
      'cubicYards',
      'squareFootage',
      'pavingFootage',
      'redimixFootingPrice',
      'rebarPrice',
    ];

    for (const name of decimalFields) {
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

    const integerFields = [
      'numberOfBuildings',
      'numberOfPanels',
      'manHours',
    ];

    for (const name of integerFields) {
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

    const percentFields = [
      ['probabilityPercent', 'probability'],
      ['retentionPercent', 'retention'],
    ];

    for (const [formName, apiName] of percentFields) {
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

    for (const name of ['realEstimate', 'snoozed']) {
      const next = form[name] === true;
      const original = detail?.[name] === true;

      if (next !== original) {
        changes[name] = next;
      }
    }

    if (!form.snoozed && changes.snoozed === false && form.snoozedUntil) {
      // Keep the explicit Snoozed Until field untouched unless the user clears it.
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
    const hasUnsavedChanges = Object.keys(pending).length > 0;

    if (
      hasUnsavedChanges
      && !window.confirm(
        'Discard unsaved bid changes and return to the Bid Log?',
      )
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
        `/api/bid-log/active/${sharePointItemId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
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
      setSaveError(
        errorMessage(error, 'Unable to save this bid.'),
      );
    } finally {
      setSaving(false);
    }
  }

  const hasUnsavedChanges = Boolean(
    form
    && detail
    && Object.keys(buildChanges().changes).length,
  );

  if (!sharePointItemId) {
    return null;
  }

  return (
    <FloatingEditorShell
      eyebrow="ACTIVE BID · EDIT BID LOG"
      title={detail?.bidName || initialBidName || 'Bid Log Item'}
      subtitle={detail?.status || 'Loading'}
      backLabel="Back to Bid Log"
      onClose={requestClose}
      saving={saving}
      className="bid-log-edit-drawer"
      bodyClassName="bid-log-edit-body"
      footer={
        !loading && !loadError && detail && form ? (
          <footer className="bid-log-edit-footer floating-editor-footer">
            <div className="floating-editor-footer-status">
              <small>
                Save updates the live SharePoint Bid Log item.
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
              Loading latest Bid Log values…
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

              {!ordinaryStatus && (
                <div className="bid-edit-message warning">
                  This bid currently has status <strong>{currentStatus || 'Unknown'}</strong>. You can edit ordinary fields, but changing to or processing a terminal status will use the dedicated lifecycle workflow we build next.
                </div>
              )}

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
                  {detail.etag && (
                    <small>Optimistic concurrency enabled</small>
                  )}
                </div>

                <div className="bid-edit-grid three-column">
                  <Field
                    label="Bid Name"
                    wide
                    hint="Read-only for now because the existing calendar invite is tied to this value."
                  >
                    <input
                      type="text"
                      value={form.bidName}
                      readOnly
                      className="bid-edit-readonly-input"
                    />
                  </Field>

                  <Field label="PM">
                    <input
                      type="text"
                      list="bid-log-pm-options"
                      value={form.pm}
                      disabled={!canEdit}
                      onChange={event => updateField('pm', event.target.value)}
                    />
                    <datalist id="bid-log-pm-options">
                      {editorPmOptions.map(pm => (
                        <option key={pm} value={pm} />
                      ))}
                    </datalist>
                  </Field>

                  <Field
                    label="Due Date"
                    hint="Read-only for now because the existing calendar invite is tied to this value."
                  >
                    <input
                      type="date"
                      value={form.dueDate}
                      readOnly
                      className="bid-edit-readonly-input"
                    />
                  </Field>

                  <Field
                    label="Status"
                    hint="Only user-assigned active statuses are shown here. Outcome statuses use dedicated lifecycle actions."
                  >
                    <select
                      value={form.status}
                      disabled={!canEdit}
                      onChange={event => updateField('status', event.target.value)}
                    >
                      <option value="">—</option>
                      {statusOptions.map(status => (
                        <option
                          key={status}
                          value={status}
                          disabled={!ORDINARY_STATUSES.includes(status)}
                        >
                          {status}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Project Type">
                    <select
                      value={form.projectType}
                      disabled={!canEdit}
                      onChange={event => updateField('projectType', event.target.value)}
                    >
                      <option value="">—</option>
                      {PROJECT_TYPES.map(value => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Purpose">
                    <select
                      value={form.purpose}
                      disabled={!canEdit}
                      onChange={event => updateField('purpose', event.target.value)}
                    >
                      <option value="">—</option>
                      {PURPOSES.map(value => (
                        <option key={value} value={value}>{value}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="bid-edit-toggle-row">
                  <ToggleField
                    checked={form.realEstimate}
                    label="Real Bid"
                    description={
                      projectionInputsRequireRealBid
                        ? 'Required because Probability or Anticipated Start has a value.'
                        : 'Same field used by the Real Bids filter.'
                    }
                    disabled={!canEdit || (projectionInputsRequireRealBid && form.realEstimate)}
                    onChange={value => updateField('realEstimate', value)}
                  />
                </div>

                <div className="bid-edit-rule-note">
                  Entering a Probability or Anticipated Start automatically marks this as a Real Bid.
                </div>
              </section>

              <section className="bid-edit-section">
                <div className="bid-edit-section-heading">
                  <div>
                    <span className="section-kicker">PROJECT</span>
                    <h3>GC & Location</h3>
                  </div>
                </div>

                <div className="bid-edit-grid two-column">
                  <Field
                    label="General Contractors"
                    wide
                    hint={
                      canEdit
                        ? `${gcOptions.length || '—'} Potential GCs available. Search by company, city, or email; multiple GCs may be selected.`
                        : 'General contractors assigned to this bid.'
                    }
                  >
                    <BidLogGeneralContractorSelect
                      value={form.generalContractors}
                      options={gcOptions}
                      loading={gcOptionsLoading}
                      error={gcOptionsError}
                      disabled={!canEdit}
                      onChange={value => updateField('generalContractors', value)}
                      onRetry={() => loadGcOptions({ force: true })}
                    />
                  </Field>

                  <Field label="Developer">
                    <input
                      type="text"
                      value={form.developer}
                      disabled={!canEdit}
                      onChange={event => updateField('developer', event.target.value)}
                    />
                  </Field>

                  <Field label="Street Address">
                    <input
                      type="text"
                      value={form.streetAddress}
                      disabled={!canEdit}
                      onChange={event => updateField('streetAddress', event.target.value)}
                    />
                  </Field>

                  <Field label="City">
                    <input
                      type="text"
                      value={form.city}
                      disabled={!canEdit}
                      onChange={event => updateField('city', event.target.value)}
                    />
                  </Field>

                  <Field label="State">
                    <input
                      type="text"
                      value={form.state}
                      disabled={!canEdit}
                      onChange={event => updateField('state', event.target.value)}
                    />
                  </Field>
                </div>
              </section>

              <section className="bid-edit-section">
                <div className="bid-edit-section-heading">
                  <div>
                    <span className="section-kicker">ESTIMATE</span>
                    <h3>Estimate & Quantities</h3>
                  </div>
                </div>

                <div className="bid-edit-grid four-column">
                  <Field label="Estimated Price">
                    <input type="number" min="0" step="0.01" value={form.estimatedPrice} disabled={!canEdit} onChange={event => updateField('estimatedPrice', event.target.value)} />
                  </Field>

                  <Field label="Margin">
                    <input type="number" step="0.0001" value={form.margin} disabled={!canEdit} onChange={event => updateField('margin', event.target.value)} />
                  </Field>

                  <Field label="Probability %">
                    <input type="number" min="0" max="100" step="0.1" value={form.probabilityPercent} disabled={!canEdit} onChange={event => updateField('probabilityPercent', event.target.value)} />
                  </Field>

                  <Field label="Retention %">
                    <input type="number" min="0" max="100" step="0.1" value={form.retentionPercent} disabled={!canEdit} onChange={event => updateField('retentionPercent', event.target.value)} />
                  </Field>

                  <Field label="# Buildings">
                    <input type="number" min="0" step="1" value={form.numberOfBuildings} disabled={!canEdit} onChange={event => updateField('numberOfBuildings', event.target.value)} />
                  </Field>

                  <Field label="# Panels">
                    <input type="number" min="0" step="1" value={form.numberOfPanels} disabled={!canEdit} onChange={event => updateField('numberOfPanels', event.target.value)} />
                  </Field>

                  <Field label="Man Hours">
                    <input type="number" min="0" step="1" value={form.manHours} disabled={!canEdit} onChange={event => updateField('manHours', event.target.value)} />
                  </Field>

                  <Field label="Cubic Yards">
                    <input type="number" min="0" step="0.01" value={form.cubicYards} disabled={!canEdit} onChange={event => updateField('cubicYards', event.target.value)} />
                  </Field>

                  <Field label="Square Footage">
                    <input type="number" min="0" step="0.01" value={form.squareFootage} disabled={!canEdit} onChange={event => updateField('squareFootage', event.target.value)} />
                  </Field>

                  <Field label="Paving SF">
                    <input type="number" min="0" step="0.01" value={form.pavingFootage} disabled={!canEdit} onChange={event => updateField('pavingFootage', event.target.value)} />
                  </Field>

                  <Field label="Redimix Footing Price">
                    <input type="number" min="0" step="0.01" value={form.redimixFootingPrice} disabled={!canEdit} onChange={event => updateField('redimixFootingPrice', event.target.value)} />
                  </Field>

                  <Field label="Rebar Price">
                    <input type="number" min="0" step="0.01" value={form.rebarPrice} disabled={!canEdit} onChange={event => updateField('rebarPrice', event.target.value)} />
                  </Field>
                </div>
              </section>

              <section className="bid-edit-section">
                <div className="bid-edit-section-heading">
                  <div>
                    <span className="section-kicker">DATES</span>
                    <h3>Schedule & Follow-up</h3>
                  </div>
                </div>

                <div className="bid-edit-grid three-column">
                  <Field label="Anticipated Start">
                    <input type="date" value={form.anticipatedStartDate} disabled={!canEdit} onChange={event => updateField('anticipatedStartDate', event.target.value)} />
                  </Field>

                  <Field label="Last Contact">
                    <input type="date" value={form.lastContactDate} disabled={!canEdit} onChange={event => updateField('lastContactDate', event.target.value)} />
                  </Field>

                  <Field label="Snoozed Until">
                    <input type="date" value={form.snoozedUntil} disabled={!canEdit} onChange={event => updateField('snoozedUntil', event.target.value)} />
                  </Field>
                </div>

                <div className="bid-edit-toggle-row">
                  <ToggleField
                    checked={form.snoozed}
                    label="Snoozed"
                    description="Keep this bid out of immediate follow-up."
                    onChange={value => updateField('snoozed', value)}
                  />
                </div>
              </section>

              <section className="bid-edit-section">
                <div className="bid-edit-section-heading">
                  <div>
                    <span className="section-kicker">NOTES</span>
                    <h3>Bid Notes</h3>
                  </div>
                </div>

                <Field label="Notes" wide>
                  <textarea
                    className="bid-edit-notes-textarea"
                    rows="10"
                    value={form.notes}
                    disabled={!canEdit}
                    onChange={event => updateField('notes', event.target.value)}
                  />
                </Field>
              </section>
            </>
          )}
    </FloatingEditorShell>
  );
}
