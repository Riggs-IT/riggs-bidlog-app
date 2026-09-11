import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import BidLogGeneralContractorSelect from './BidLogGeneralContractorSelect.jsx';
import BidLogStateSelect, {
  normalizeBidLogState,
} from './BidLogStateSelect.jsx';
import FloatingEditorShell from './FloatingEditorShell.jsx';
import ActionToast from './ActionToast.jsx';


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


const DEFAULT_PM = 'No PM Assigned';


const EMPTY_FORM = {
  bidName: '',
  pm: DEFAULT_PM,
  dueDate: '',
  projectType: '',
  purpose: '',
  developer: '',
  generalContractors: [],
  streetAddress: '',
  city: '',
  state: '',
  notes: '',
};


function optionalText(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}


function errorMessage(error, fallback) {
  const detail = String(error?.message || '').trim();

  if (detail === 'invalid_active_bid_create') {
    return 'One or more new-bid values were rejected.';
  }

  if (detail === 'active_bid_create_rejected') {
    return 'Your account is not allowed to create Bid Log items.';
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


function Field({
  label,
  children,
  wide = false,
  hint = null,
}) {
  return (
    <label className={`bid-edit-field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}


export default function BidLogCreateDrawer({
  open,
  pmOptions = [],
  onClose,
  onCreated,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [gcOptions, setGcOptions] = useState([]);
  const [gcOptionsLoading, setGcOptionsLoading] = useState(false);
  const [gcOptionsError, setGcOptionsError] = useState(null);

  const editorPmOptions = useMemo(
    () => Array.from(
      new Set(
        pmOptions
          .filter(Boolean)
          .map(value => String(value).trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b)),
    [pmOptions],
  );

  const hasInput = useMemo(
    () => {
      if (form.generalContractors.length) {
        return true;
      }

      return Object.entries(form)
        .filter(([name]) => name !== 'generalContractors')
        .some(([name, value]) => {
          const normalized = String(value ?? '').trim();

          if (name === 'pm') {
            return normalized !== DEFAULT_PM;
          }

          return Boolean(normalized);
        });
    },
    [form],
  );

  function updateField(name, value) {
    setForm(current => ({
      ...current,
      [name]: value,
    }));
    setSaveError(null);
  }

  function requestClose() {
    if (saving) {
      return;
    }

    if (
      hasInput
      && !window.confirm('Discard this new bid?')
    ) {
      return;
    }

    onClose();
  }

  async function loadGcOptions() {
    setGcOptionsLoading(true);
    setGcOptionsError(null);

    try {
      const payload = await requestJson(
        '/api/bid-log/reference/general-contractors',
      );

      if (!Array.isArray(payload?.items)) {
        throw new Error(
          'General contractor reference returned an invalid response.',
        );
      }

      setGcOptions(payload.items);
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

  useEffect(
    () => {
      if (!open) {
        return;
      }

      setForm({
        ...EMPTY_FORM,
        generalContractors: [],
      });
      setSaveError(null);
      setSaving(false);
      loadGcOptions();
    },
    [open],
  );

  async function createBid() {
    if (saving) {
      return;
    }

    const bidName = optionalText(form.bidName);

    if (!bidName) {
      setSaveError('Bid Name is required.');
      return;
    }

    const payload = {
      bidName,
      pm: optionalText(form.pm),
      dueDate: optionalText(form.dueDate),
      projectType: optionalText(form.projectType),
      purpose: optionalText(form.purpose),
      developer: optionalText(form.developer),
      generalContractors: form.generalContractors.length
        ? form.generalContractors
        : null,
      streetAddress: optionalText(form.streetAddress),
      city: optionalText(form.city),
      state: optionalText(normalizeBidLogState(form.state)),
      notes: optionalText(form.notes),
    };

    setSaving(true);
    setSaveError(null);

    try {
      const created = await requestJson(
        '/api/bid-log/active',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );

      onCreated?.(created);
    } catch (error) {
      setSaveError(
        errorMessage(error, 'Unable to create this bid.'),
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <FloatingEditorShell
      eyebrow="BID LOG · NEW BID"
      title="Create New Bid"
      subtitle="Add the information needed to start a Potential bid."
      backLabel="Back to Bid Log"
      onClose={requestClose}
      saving={saving}
      className="bid-log-edit-drawer bid-log-create-drawer"
      bodyClassName="bid-log-edit-body"
      footer={
        <footer className="bid-log-edit-footer floating-editor-footer">
          <div className="floating-editor-footer-status">
            <small>
              Create Bid adds the live SharePoint Bid Log item. Existing automation handles the calendar event.
            </small>
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

            <button
              type="button"
              className="primary-button bid-log-save-button"
              onClick={createBid}
              disabled={saving || !optionalText(form.bidName)}
            >
              {saving ? 'Creating…' : 'Create Bid'}
            </button>
          </div>
        </footer>
      }
    >
      <ActionToast
        message={saveError}
        type="error"
        onDismiss={() => setSaveError(null)}
      />

      <section className="bid-edit-section">
        <div className="bid-edit-section-heading">
          <div>
            <span className="section-kicker">NEW BID</span>
            <h3>Bid Information</h3>
          </div>
          <p>
            Enter the core information used to start the Bid Log record.
          </p>
        </div>

        <div className="bid-edit-grid three-column">
          <Field label="Bid Name" wide>
            <input
              type="text"
              value={form.bidName}
              autoFocus
              onChange={event => updateField('bidName', event.target.value)}
            />
          </Field>

          <Field label="PM">
            <select
              value={form.pm}
              onChange={event => updateField('pm', event.target.value)}
            >
              <option value={DEFAULT_PM}>No PM Assigned</option>
              {editorPmOptions.map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </Field>

          <Field label="Due Date">
            <input
              type="date"
              value={form.dueDate}
              onChange={event => updateField('dueDate', event.target.value)}
            />
          </Field>

          <Field label="Project Type">
            <select
              value={form.projectType}
              onChange={event => updateField('projectType', event.target.value)}
            >
              <option value="">Select type…</option>
              {PROJECT_TYPES.map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </Field>

          <Field label="Purpose">
            <select
              value={form.purpose}
              onChange={event => updateField('purpose', event.target.value)}
            >
              <option value="">Select purpose…</option>
              {PURPOSES.map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </Field>

          <Field label="Developer">
            <input
              type="text"
              value={form.developer}
              onChange={event => updateField('developer', event.target.value)}
            />
          </Field>

          <Field label="General Contractor(s)" wide>
            <BidLogGeneralContractorSelect
              value={form.generalContractors}
              options={gcOptions}
              loading={gcOptionsLoading}
              error={gcOptionsError}
              multiple
              disabled={saving}
              onChange={value => updateField('generalContractors', value)}
              onRetry={loadGcOptions}
            />
          </Field>
        </div>
      </section>

      <section className="bid-edit-section">
        <div className="bid-edit-section-heading">
          <div>
            <span className="section-kicker">LOCATION</span>
            <h3>Location & Notes</h3>
          </div>
        </div>

        <div className="bid-edit-grid three-column">
          <Field label="Street Address" wide>
            <input
              type="text"
              value={form.streetAddress}
              onChange={event => updateField('streetAddress', event.target.value)}
            />
          </Field>

          <Field label="City">
            <input
              type="text"
              value={form.city}
              autoComplete="address-level2"
              onChange={event => updateField('city', event.target.value)}
            />
          </Field>

          <Field label="State">
            <BidLogStateSelect
              value={form.state}
              onChange={value => updateField('state', value)}
            />
          </Field>

          <Field label="Notes" wide>
            <textarea
              rows="5"
              value={form.notes}
              onChange={event => updateField('notes', event.target.value)}
            />
          </Field>
        </div>
      </section>
    </FloatingEditorShell>
  );
}
