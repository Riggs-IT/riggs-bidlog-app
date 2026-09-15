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
import BidLogConfirmDialog from './BidLogConfirmDialog.jsx';
import './BidLogLifecyclePolish.css';
import {
  generalContractorNames,
} from './GeneralContractors.jsx';


const ORDINARY_STATUSES = [
  'Potential',
  'Assigned',
];

const LIFECYCLE_STATUSES = [
  'Awarded',
  'Lost',
  'Dead',
];


function isLifecycleStatus(value) {
  const normalized = String(value || '').trim().toUpperCase();

  return LIFECYCLE_STATUSES.some(
    status => status.toUpperCase() === normalized,
  );
}


function hasAssignedPm(value) {
  const normalized = String(value || '').trim();

  return Boolean(
    normalized
    && normalized.toUpperCase() !== 'NO PM ASSIGNED'
  );
}


function resolvedAssignmentStatus(pm, status) {
  const normalized = String(status || '').trim();
  const upper = normalized.toUpperCase();

  if (!ORDINARY_STATUSES.some(
    value => value.toUpperCase() === upper,
  )) {
    return normalized;
  }

  return hasAssignedPm(pm)
    ? 'Assigned'
    : 'Potential';
}

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
    state: normalizeBidLogState(detail?.state),
    estimatedPrice: numberValue(detail?.estimatedPrice),
    margin: numberValue(detail?.margin),
    probabilityPercent: percentValue(detail?.probability),
    retentionPercent: percentValue(detail?.retention),
    anticipatedStartDate: dateValue(detail?.anticipatedStartDate),
    estimatedDurationMonths: '',
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


function structuredLifecycleError(error) {
  const detail = String(error?.message || '').trim();

  if (!detail.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(detail);
    return parsed && typeof parsed === 'object'
      ? parsed
      : null;
  } catch {
    return null;
  }
}


function errorMessage(error, fallback) {
  const structured = structuredLifecycleError(error);

  if (structured?.code === 'invalid_active_bid_lifecycle') {
    return String(
      structured.message
      || 'The lifecycle action was rejected.',
    );
  }

  if (structured?.code === 'bid_log_lifecycle_partial_failure') {
    const expected = Number(structured.expectedCloneCount) || 0;
    const created = Number(structured.createdCloneCount) || 0;
    const failed = Array.isArray(structured.failedGeneralContractors)
      ? structured.failedGeneralContractors.filter(Boolean)
      : [];

    return [
      'The Award was applied, but not every GC Not Awarded copy was created.',
      `${created} of ${expected} losing-GC copies were created.`,
      failed.length
        ? `Missing: ${failed.join(', ')}.`
        : null,
      'Do not Award the bid again.',
    ]
      .filter(Boolean)
      .join(' ');
  }

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


const ARIZONA_CITY_SUGGESTIONS = [
  'Apache Junction',
  'Avondale',
  'Buckeye',
  'Casa Grande',
  'Chandler',
  'Coolidge',
  'Cottonwood',
  'El Mirage',
  'Eloy',
  'Flagstaff',
  'Florence',
  'Fountain Hills',
  'Gilbert',
  'Glendale',
  'Goodyear',
  'Kingman',
  'Lake Havasu City',
  'Litchfield Park',
  'Marana',
  'Maricopa',
  'Mesa',
  'Nogales',
  'Paradise Valley',
  'Payson',
  'Peoria',
  'Phoenix',
  'Prescott',
  'Prescott Valley',
  'Queen Creek',
  'Sahuarita',
  'Scottsdale',
  'Sedona',
  'Sierra Vista',
  'Surprise',
  'Tempe',
  'Tolleson',
  'Tucson',
  'Yuma',
];


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
  fieldKey = null,
  invalid = false,
}) {
  return (
    <label
      className={
        `bid-edit-field${wide ? ' wide' : ''}${invalid ? ' required-attention' : ''}`
      }
      data-bid-field={fieldKey || undefined}
    >
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
  const [forecastProject, setForecastProject] = useState(null);
  const [forecastError, setForecastError] = useState(null);
  const [dateAwarded, setDateAwarded] = useState('');
  const [winningGeneralContractor, setWinningGeneralContractor] = useState('');
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [lifecycleComplete, setLifecycleComplete] = useState(false);
  const [requiredFields, setRequiredFields] = useState([]);
  const [requiredAction, setRequiredAction] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

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

  const pmAssigned = hasAssignedPm(form?.pm);
  const selectedLifecycleAction = isLifecycleStatus(form?.status)
    ? String(form.status).trim()
    : null;

  const assignmentStatus = pmAssigned
    ? 'Assigned'
    : 'Potential';

  const statusOptions = useMemo(
    () => {
      const allowed = pmAssigned
        ? ['Assigned', 'Awarded', 'Lost', 'Dead']
        : ['Potential', 'Lost', 'Dead'];

      if (
        currentStatus
        && !allowed.some(
          value => value.toUpperCase() === currentStatus.toUpperCase(),
        )
        && !ORDINARY_STATUSES.some(
          value => value.toUpperCase() === currentStatus.toUpperCase(),
        )
      ) {
        return [currentStatus, ...allowed];
      }

      return allowed;
    },
    [currentStatus, pmAssigned],
  );

  const editorPmOptions = useMemo(
    () => Array.from(
      new Set(
        pmOptions
          .filter(Boolean)
          .map(value => String(value).trim())
          .filter(
            value =>
              value
              && value.toUpperCase() !== 'NO PM ASSIGNED',
          ),
      ),
    ).sort((a, b) => a.localeCompare(b)),
    [pmOptions],
  );

  const currentPmIsApproved = !hasAssignedPm(form?.pm)
    || editorPmOptions.some(
      pm => pm.toUpperCase() === String(form?.pm || '').trim().toUpperCase(),
    );

  function clearRequiredField(fieldKey) {
    if (!fieldKey) {
      return;
    }

    setRequiredFields(
      current => current.filter(key => key !== fieldKey),
    );
  }


  function focusRequiredField(fieldKey) {
    if (!fieldKey) {
      return;
    }

    window.setTimeout(
      () => {
        const target = document.querySelector(
          `[data-bid-field="${fieldKey}"]`,
        );

        if (!target) {
          return;
        }

        target.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

        const control = target.querySelector(
          'input:not([type="hidden"]), select, textarea, button',
        );

        window.setTimeout(
          () => control?.focus({ preventScroll: true }),
          260,
        );
      },
      0,
    );
  }


  function showRequiredFields(action, missing) {
    const keys = missing.map(item => item.key);
    const labels = missing.map(item => item.label);

    setRequiredAction(action);
    setRequiredFields(keys);
    setSaveError(
      `${action} cannot be completed yet. ${labels.length} required ${labels.length === 1 ? 'field needs' : 'fields need'} attention. First: ${labels[0]}.`,
    );

    focusRequiredField(keys[0]);
  }


  function awardMissingFields() {
    const contractors = generalContractorNames(form?.generalContractors);
    const estimatedPrice = optionalNumber(form?.estimatedPrice);
    const margin = optionalNumber(form?.margin);
    const retention = optionalPercentFraction(form?.retentionPercent);
    const duration = optionalInteger(form?.estimatedDurationMonths);

    return [
      { key: 'bidName', label: 'Bid Name', missing: !optionalText(form?.bidName) },
      { key: 'pm', label: 'PM', missing: !hasAssignedPm(form?.pm) },
      { key: 'dueDate', label: 'Due Date', missing: !optionalText(form?.dueDate) },
      { key: 'projectType', label: 'Project Type', missing: !optionalText(form?.projectType) },
      { key: 'purpose', label: 'Purpose', missing: !optionalText(form?.purpose) },
      { key: 'generalContractors', label: 'General Contractor', missing: !contractors.length },
      {
        key: 'estimatedPrice',
        label: 'Estimated Price',
        missing: !Number.isFinite(estimatedPrice) || estimatedPrice <= 0,
      },
      { key: 'margin', label: 'Margin', missing: margin === null || Number.isNaN(margin) },
      {
        key: 'retentionPercent',
        label: 'Retention',
        missing: retention === null || Number.isNaN(retention),
      },
      {
        key: 'anticipatedStartDate',
        label: 'Anticipated Start',
        missing: !optionalText(form?.anticipatedStartDate),
      },
      {
        key: 'estimatedDurationMonths',
        label: 'Estimated Project Duration',
        missing: !Number.isFinite(duration) || duration < 1 || duration > 120,
      },
      { key: 'streetAddress', label: 'Street Address', missing: !optionalText(form?.streetAddress) },
      { key: 'city', label: 'City', missing: !optionalText(form?.city) },
      { key: 'state', label: 'State', missing: !optionalText(form?.state) },
      { key: 'dateAwarded', label: 'Date Awarded', missing: !optionalText(dateAwarded) },
      {
        key: 'winningGeneralContractor',
        label: 'Winning General Contractor',
        missing:
          contractors.length > 1
          && !optionalText(winningGeneralContractor),
      },
    ].filter(item => item.missing);
  }


  function sectionNeedsAttention(fieldKeys) {
    return fieldKeys.some(key => requiredFields.includes(key));
  }


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

  async function loadDetail({ preserveDraft = false } = {}) {
    if (!sharePointItemId) {
      return;
    }

    const draft = preserveDraft && form && detail
      ? {
          form: {
            ...form,
            generalContractors: [...generalContractorNames(form.generalContractors)],
          },
          baseline: {
            ...initialForm(detail),
            estimatedDurationMonths: numberValue(
              forecastProject?.estimatedDurationMonths,
            ),
          },
          dateAwarded,
          winningGeneralContractor,
          lifecycleReason,
        }
      : null;

    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSaveMessage(null);
    setRequiredFields([]);
    setRequiredAction(null);

    try {
      const [detailResult, forecastResult] = await Promise.allSettled([
        requestJson(
          `/api/bid-log/active/${sharePointItemId}`,
        ),
        requestJson(
          `/api/projected-billings/active-bids/${sharePointItemId}/monthly`,
        ),
      ]);

      if (detailResult.status === 'rejected') {
        throw detailResult.reason;
      }

      const next = detailResult.value;

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

      const nextForecast = forecastResult.status === 'fulfilled'
        ? forecastResult.value?.project || null
        : null;

      setDetail(normalized);
      setForecastProject(nextForecast);
      setForecastError(
        forecastResult.status === 'rejected'
          ? errorMessage(
              forecastResult.reason,
              'Unable to load Estimated Project Duration.',
            )
          : null,
      );
      const nextForm = {
        ...initialForm(normalized),
        estimatedDurationMonths: numberValue(
          nextForecast?.estimatedDurationMonths,
        ),
      };

      if (draft) {
        for (const [name, value] of Object.entries(draft.form)) {
          const baselineValue = draft.baseline[name];
          const changed = name === 'generalContractors'
            ? !arraysEqual(
                generalContractorNames(value),
                generalContractorNames(baselineValue),
              )
            : !valuesEqual(value, baselineValue);

          if (changed) {
            nextForm[name] = value;
          }
        }
      }

      setForm(nextForm);
      setDateAwarded(draft?.dateAwarded || '');
      setWinningGeneralContractor(draft?.winningGeneralContractor || '');
      setLifecycleReason(draft?.lifecycleReason || '');
      setLifecycleComplete(false);
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

  useEffect(
    () => {
      if (!selectedLifecycleAction) {
        return undefined;
      }

      const timer = window.setTimeout(
        () => {
          const section = document.querySelector(
            '[data-bid-lifecycle-section="true"]',
          );

          if (!section) {
            return;
          }

          section.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });

          const fieldKey = selectedLifecycleAction === 'Awarded'
            ? 'dateAwarded'
            : 'lifecycleReason';

          const control = section.querySelector(
            `[data-bid-field="${fieldKey}"] input, `
            + `[data-bid-field="${fieldKey}"] textarea, `
            + `[data-bid-field="${fieldKey}"] select`,
          );

          window.setTimeout(
            () => control?.focus({ preventScroll: true }),
            260,
          );
        },
        0,
      );

      return () => window.clearTimeout(timer);
    },
    [selectedLifecycleAction],
  );

  function updateField(name, value) {
    setForm(
      current => {
        const next = {
          ...current,
          [name]: value,
        };

        if (name === 'pm') {
          const status = String(current.status || '').trim();

          if (!isLifecycleStatus(status)) {
            next.status = hasAssignedPm(value)
              ? 'Assigned'
              : 'Potential';
          }
        }

        if (
          (name === 'anticipatedStartDate' || name === 'probabilityPercent')
          && optionalText(value)
        ) {
          next.realEstimate = true;
        }

        return next;
      },
    );

    clearRequiredField(name);

    if (name === 'status') {
      setRequiredFields([]);
      setRequiredAction(null);
    }

    setSaveError(null);
    setSaveMessage(null);
  }

  function buildChanges() {
    const changes = {};
    const invalid = [];

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
    ];

    for (const name of textFields) {
      const next = name === 'state'
        ? optionalText(normalizeBidLogState(form[name]))
        : optionalText(form[name]);
      const original = name === 'state'
        ? optionalText(normalizeBidLogState(detail?.[name]))
        : optionalText(detail?.[name]);

      if (!valuesEqual(next, original)) {
        changes[name] = next;
      }
    }

    const nextStatus = optionalText(form.status);
    const originalStatus = optionalText(detail?.status);

    const ordinaryTargetStatus = isLifecycleStatus(nextStatus)
      ? hasAssignedPm(form.pm)
        ? 'Assigned'
        : 'Potential'
      : nextStatus;

    if (!valuesEqual(ordinaryTargetStatus, originalStatus)) {
      changes.status = ordinaryTargetStatus;
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

  function buildDurationChange() {
    const next = optionalInteger(form?.estimatedDurationMonths);
    const original = forecastProject?.estimatedDurationMonths === null
      || forecastProject?.estimatedDurationMonths === undefined
        ? null
        : Number(forecastProject.estimatedDurationMonths);

    if (
      Number.isNaN(next)
      || (next !== null && (next < 1 || next > 120))
    ) {
      return {
        changed: false,
        invalid: 'Estimated Project Duration must be between 1 and 120 months.',
        value: next,
      };
    }

    return {
      changed: !valuesEqual(next, original),
      invalid: null,
      value: next,
    };
  }


  async function saveDurationIfNeeded(durationChange) {
    if (!durationChange.changed) {
      return forecastProject;
    }

    if (!forecastProject) {
      throw new Error(
        forecastError
        || 'Forecast settings are unavailable. Reload the bid before saving Duration.',
      );
    }

    const saved = await requestJson(
      `/api/projected-billings/active-bids/${sharePointItemId}/settings`,
      {
        method: 'PUT',
        body: JSON.stringify({
          includeInForecast:
            forecastProject.includeInForecast
            ?? true,
          startDateOverride:
            forecastProject.startDateOverride
            || null,
          amountOverride:
            forecastProject.amountOverride
            ?? null,
          estimatedDurationMonths:
            durationChange.value,
          projectionNotes:
            forecastProject.projectionNotes
            || null,
          expectedRowVersion:
            forecastProject.rowVersion
            || null,
        }),
      },
    );

    const nextProject = saved?.project || forecastProject;
    setForecastProject(nextProject);
    return nextProject;
  }


  function requestClose() {
    if (saving) {
      return;
    }

    if (lifecycleComplete) {
      onClose();
      return;
    }

    const pending = form && detail
      ? buildChanges().changes
      : {};
    const durationChange = form
      ? buildDurationChange()
      : { changed: false };
    const hasUnsavedChanges = Boolean(
      Object.keys(pending).length
      || durationChange.changed
      || selectedLifecycleAction
    );

    if (hasUnsavedChanges) {
      setConfirmDialog({
        kind: 'discard',
        title: 'Discard unsaved changes?',
        message: 'Your unsaved Bid Log changes will be lost.',
        confirmLabel: 'Discard Changes',
        danger: true,
      });
      return;
    }

    onClose();
  }

  async function save(skipLifecycleConfirm = false) {
    if (!canEdit || !detail?.etag || !form || saving || lifecycleComplete) {
      return;
    }

    const { changes, invalid } = buildChanges();
    const durationChange = buildDurationChange();

    if (invalid.length) {
      setSaveError(invalid[0]);
      return;
    }

    if (durationChange.invalid) {
      setSaveError(durationChange.invalid);
      return;
    }

    const lifecycleAction = selectedLifecycleAction;
    const contractors = generalContractorNames(form.generalContractors);

    if (lifecycleAction === 'Awarded') {
      const missing = awardMissingFields();

      if (missing.length) {
        showRequiredFields('Award', missing);
        return;
      }

      if (
        contractors.length > 1
        && !contractors.some(
          contractor => contractor.toUpperCase()
            === String(winningGeneralContractor).trim().toUpperCase(),
        )
      ) {
        showRequiredFields(
          'Award',
          [{
            key: 'winningGeneralContractor',
            label: 'Winning General Contractor',
          }],
        );
        return;
      }
    }

    if (
      (lifecycleAction === 'Lost' || lifecycleAction === 'Dead')
      && !optionalText(lifecycleReason)
    ) {
      showRequiredFields(
        lifecycleAction,
        [{
          key: 'lifecycleReason',
          label: 'Reason',
        }],
      );
      return;
    }

    setRequiredFields([]);
    setRequiredAction(null);

    if (
      !Object.keys(changes).length
      && !durationChange.changed
      && !lifecycleAction
    ) {
      setSaveMessage('No changes to save.');
      return;
    }

    if (lifecycleAction && !skipLifecycleConfirm) {
      setConfirmDialog({
        kind: 'lifecycle',
        title: lifecycleAction === 'Awarded'
          ? 'Award this bid?'
          : `Mark this bid ${lifecycleAction}?`,
        message: lifecycleAction === 'Awarded'
          ? 'The winning GC will remain on the Awarded record. Any losing GCs will be created as GC Not Awarded records.'
          : `This will move the bid out of Active Bids and into the ${lifecycleAction === 'Dead' ? 'Unpursued' : lifecycleAction} view.`,
        confirmLabel: lifecycleAction === 'Awarded'
          ? 'Award Bid'
          : `Mark ${lifecycleAction}`,
      });
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    let workingDetail = detail;
    let workingForecast = forecastProject;

    try {
      if (Object.keys(changes).length) {
        workingDetail = await requestJson(
          `/api/bid-log/active/${sharePointItemId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              expectedEtag: workingDetail.etag,
              ...changes,
            }),
          },
        );

        setDetail(workingDetail);
      }

      if (durationChange.changed) {
        workingForecast = await saveDurationIfNeeded(durationChange);
      }

      if (lifecycleAction) {
        const lifecycleResult = await requestJson(
          `/api/bid-log/active/${sharePointItemId}/lifecycle`,
          {
            method: 'POST',
            body: JSON.stringify({
              expectedEtag: workingDetail.etag,
              action: lifecycleAction,
              dateAwarded:
                lifecycleAction === 'Awarded'
                  ? dateAwarded
                  : null,
              winningGeneralContractor:
                lifecycleAction === 'Awarded'
                && contractors.length > 1
                  ? optionalText(winningGeneralContractor)
                  : null,
              reason:
                lifecycleAction === 'Lost'
                || lifecycleAction === 'Dead'
                  ? optionalText(lifecycleReason)
                  : null,
            }),
          },
        );

        const finalStatus = lifecycleResult?.finalStatus || lifecycleAction;
        const completedDetail = {
          ...workingDetail,
          status: finalStatus,
        };

        setDetail(completedDetail);
        setForm({
          ...initialForm(completedDetail),
          estimatedDurationMonths: numberValue(
            workingForecast?.estimatedDurationMonths,
          ),
        });
        setLifecycleComplete(true);

        if (
          finalStatus === 'Awarded'
          && Number(lifecycleResult?.expectedCloneCount) > 0
        ) {
          setSaveMessage(
            `Bid awarded. ${lifecycleResult.createdCloneCount} GC Not Awarded ${Number(lifecycleResult.createdCloneCount) === 1 ? 'record was' : 'records were'} created.`,
          );
        } else {
          setSaveMessage(`Bid marked ${finalStatus}.`);
        }

        onSaved?.(completedDetail);
        return;
      }

      setDetail(workingDetail);
      setForm({
        ...initialForm(workingDetail),
        estimatedDurationMonths: numberValue(
          workingForecast?.estimatedDurationMonths,
        ),
      });
      setSaveMessage('Bid saved.');
      onSaved?.(workingDetail);
    } catch (error) {
      const structured = structuredLifecycleError(error);

      if (
        structured?.code === 'bid_log_lifecycle_partial_failure'
        && structured.transitionApplied === true
      ) {
        const completedDetail = {
          ...workingDetail,
          status: structured.finalStatus || 'Awarded',
        };

        setDetail(completedDetail);
        setForm({
          ...initialForm(completedDetail),
          estimatedDurationMonths: numberValue(
            workingForecast?.estimatedDurationMonths,
          ),
        });
        setLifecycleComplete(true);
        onSaved?.(completedDetail);
      }

      setSaveError(
        errorMessage(error, 'Unable to save this bid.'),
      );
    } finally {
      setSaving(false);
    }
  }


  const durationChange = form && forecastProject
    ? buildDurationChange()
    : { changed: false };

  const hasUnsavedChanges = Boolean(
    !lifecycleComplete
    && form
    && detail
    && (
      Object.keys(buildChanges().changes).length
      || durationChange.changed
      || selectedLifecycleAction
    )
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
                {lifecycleComplete
                  ? 'Lifecycle action complete. Use Back to Bid Log when finished reviewing.'
                  : selectedLifecycleAction
                    ? 'Save will apply field updates first, then complete the selected lifecycle action.'
                    : 'Save updates the live SharePoint Bid Log item.'}
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
                  disabled={saving || lifecycleComplete || !detail.etag || !hasUnsavedChanges}
                >
                  {saving
                    ? 'Saving…'
                    : selectedLifecycleAction === 'Awarded'
                      ? 'Save & Award Bid'
                      : selectedLifecycleAction === 'Lost'
                        ? 'Save & Mark Lost'
                        : selectedLifecycleAction === 'Dead'
                          ? 'Save & Mark Dead'
                          : 'Save Bid'}
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

              <ActionToast
                message={saveError || saveMessage}
                type={saveError ? 'error' : 'success'}
                actionLabel={
                  saveError?.startsWith(
                    'This bid changed after',
                  )
                    ? 'Reload Latest'
                    : null
                }
                onAction={
                  saveError?.startsWith(
                    'This bid changed after',
                  )
                    ? () => loadDetail({ preserveDraft: true })
                    : null
                }
                onDismiss={() => {
                  setSaveError(null);
                  setSaveMessage(null);
                }}
              />

              <BidLogConfirmDialog
                open={Boolean(confirmDialog)}
                title={confirmDialog?.title}
                message={confirmDialog?.message}
                confirmLabel={confirmDialog?.confirmLabel}
                showCancel={confirmDialog?.showCancel !== false}
                danger={confirmDialog?.danger === true}
                onCancel={() => setConfirmDialog(null)}
                onConfirm={() => {
                  const kind = confirmDialog?.kind;
                  setConfirmDialog(null);

                  if (kind === 'discard') {
                    onClose();
                    return;
                  }

                  if (kind === 'lifecycle') {
                    void save(true);
                  }
                }}
              />

              {requiredFields.length > 0 && (
                <div className="bid-lifecycle-required-banner" role="alert">
                  <div>
                    <strong>
                      {requiredAction || selectedLifecycleAction || 'This action'} cannot be completed yet
                    </strong>
                    <span>
                      {requiredFields.length} required {requiredFields.length === 1 ? 'field needs' : 'fields need'} attention.
                    </span>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => focusRequiredField(requiredFields[0])}
                  >
                    Go to first missing field
                  </button>
                </div>
              )}

              <section
                className={`bid-edit-section${sectionNeedsAttention([
                  'bidName',
                  'pm',
                  'dueDate',
                  'projectType',
                  'purpose',
                ]) ? ' required-attention' : ''}`}
              >
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
                    fieldKey="bidName"
                    invalid={requiredFields.includes('bidName')}
                  >
                    <input
                      type="text"
                      value={form.bidName}
                      disabled={!canEdit}
                      onChange={event => updateField('bidName', event.target.value)}
                    />
                  </Field>

                  <Field
                    label="PM"
                    fieldKey="pm"
                    invalid={requiredFields.includes('pm')}
                    hint="Only approved Riggs PMs can be assigned. Selecting a PM automatically makes the bid Assigned."
                  >
                    <button
                      type="button"
                      className="bid-pm-readonly-control"
                      disabled={!canEdit}
                      onClick={() => setConfirmDialog({
                        kind: 'pm-info',
                        title: 'PM is controlled by the calendar',
                        message: 'Update the Bid Log calendar invite to change the PM. The app will pick up the updated assignment from there.',
                        confirmLabel: 'Got it',
                        showCancel: false,
                      })}
                    >
                      <span>{form.pm || 'No PM Assigned'}</span>
                      <small>Calendar controlled</small>
                    </button>
                  </Field>

                  <Field
                    label="Due Date"
                    fieldKey="dueDate"
                    invalid={requiredFields.includes('dueDate')}
                    hint="Change the Due Date on the Bid Log calendar invite; it will update here."
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
                    hint={
                      pmAssigned
                        ? 'Assigned is the active status for a bid with a PM. Awarded, Lost, and Dead run the dedicated lifecycle workflow.'
                        : 'Potential is used while no PM is assigned. Lost and Dead remain available; Awarded requires a PM.'
                    }
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
                          disabled={
                            (status === assignmentStatus && !selectedLifecycleAction)
                            || (
                              status === currentStatus
                              && !ORDINARY_STATUSES.includes(status)
                              && !LIFECYCLE_STATUSES.includes(status)
                            )
                          }
                        >
                          {status}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field
                    label="Project Type"
                    fieldKey="projectType"
                    invalid={requiredFields.includes('projectType')}
                  >
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

                  <Field
                    label="Purpose"
                    fieldKey="purpose"
                    invalid={requiredFields.includes('purpose')}
                  >
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

              <section
                className={`bid-edit-section${sectionNeedsAttention([
                  'generalContractors',
                  'streetAddress',
                  'city',
                  'state',
                ]) ? ' required-attention' : ''}`}
              >
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
                    fieldKey="generalContractors"
                    invalid={requiredFields.includes('generalContractors')}
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

                  <Field
                    label="Street Address"
                    fieldKey="streetAddress"
                    invalid={requiredFields.includes('streetAddress')}
                  >
                    <input
                      type="text"
                      value={form.streetAddress}
                      disabled={!canEdit}
                      onChange={event => updateField('streetAddress', event.target.value)}
                    />
                  </Field>

                  <Field
                    label="City"
                    fieldKey="city"
                    invalid={requiredFields.includes('city')}
                  >
                    <input
                      type="text"
                      value={form.city}
                      disabled={!canEdit}
                      autoComplete="address-level2"
                      list={form.state === 'AZ' ? 'bid-log-active-city-suggestions' : undefined}
                      placeholder={form.state === 'AZ' ? 'Start typing an Arizona city…' : undefined}
                      onChange={event => updateField('city', event.target.value)}
                    />
                    {form.state === 'AZ' && (
                      <datalist id="bid-log-active-city-suggestions">
                        {ARIZONA_CITY_SUGGESTIONS.map(city => (
                          <option key={city} value={city} />
                        ))}
                      </datalist>
                    )}
                  </Field>

                  <Field
                    label="State"
                    fieldKey="state"
                    invalid={requiredFields.includes('state')}
                  >
                    <BidLogStateSelect
                      value={form.state}
                      disabled={!canEdit}
                      onChange={value => updateField('state', value)}
                    />
                  </Field>
                </div>
              </section>

              <section
                className={`bid-edit-section${sectionNeedsAttention([
                  'estimatedPrice',
                  'margin',
                  'retentionPercent',
                ]) ? ' required-attention' : ''}`}
              >
                <div className="bid-edit-section-heading">
                  <div>
                    <span className="section-kicker">ESTIMATE</span>
                    <h3>Estimate & Quantities</h3>
                  </div>
                </div>

                <div className="bid-edit-grid four-column">
                  <Field
                    label="Estimated Price"
                    fieldKey="estimatedPrice"
                    invalid={requiredFields.includes('estimatedPrice')}
                  >
                    <input type="number" min="0" step="0.01" value={form.estimatedPrice} disabled={!canEdit} onChange={event => updateField('estimatedPrice', event.target.value)} />
                  </Field>

                  <Field
                    label="Margin"
                    fieldKey="margin"
                    invalid={requiredFields.includes('margin')}
                  >
                    <input type="number" step="0.0001" value={form.margin} disabled={!canEdit} onChange={event => updateField('margin', event.target.value)} />
                  </Field>

                  <Field label="Probability %">
                    <input type="number" min="0" max="100" step="0.1" value={form.probabilityPercent} disabled={!canEdit} onChange={event => updateField('probabilityPercent', event.target.value)} />
                  </Field>

                  <Field
                    label="Retention %"
                    fieldKey="retentionPercent"
                    invalid={requiredFields.includes('retentionPercent')}
                  >
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

              <section
                className={`bid-edit-section${sectionNeedsAttention([
                  'anticipatedStartDate',
                  'estimatedDurationMonths',
                ]) ? ' required-attention' : ''}`}
              >
                <div className="bid-edit-section-heading">
                  <div>
                    <span className="section-kicker">DATES</span>
                    <h3>Schedule & Follow-up</h3>
                  </div>
                </div>

                <div className="bid-edit-grid four-column">
                  <Field
                    label="Anticipated Start"
                    fieldKey="anticipatedStartDate"
                    invalid={requiredFields.includes('anticipatedStartDate')}
                  >
                    <input type="date" value={form.anticipatedStartDate} disabled={!canEdit} onChange={event => updateField('anticipatedStartDate', event.target.value)} />
                  </Field>

                  <Field
                    label="Estimated Project Duration"
                    fieldKey="estimatedDurationMonths"
                    invalid={requiredFields.includes('estimatedDurationMonths')}
                    hint={
                      forecastError
                        ? forecastError
                        : 'Months. This is the same duration used by Projected Billings.'
                    }
                  >
                    <input
                      type="number"
                      min="1"
                      max="120"
                      step="1"
                      value={form.estimatedDurationMonths}
                      disabled={!canEdit || Boolean(forecastError)}
                      onChange={event => updateField('estimatedDurationMonths', event.target.value)}
                    />
                  </Field>

                  <Field label="Last Contact">
                    <input type="date" value={form.lastContactDate} disabled={!canEdit} onChange={event => updateField('lastContactDate', event.target.value)} />
                  </Field>

                  {form.snoozed && (
                    <Field label="Snoozed Until">
                      <input type="date" value={form.snoozedUntil} disabled={!canEdit} onChange={event => updateField('snoozedUntil', event.target.value)} />
                    </Field>
                  )}
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

              {selectedLifecycleAction && (
                <section
                  data-bid-lifecycle-section="true"
                  className={`bid-edit-section lifecycle-action-selected${sectionNeedsAttention([
                    'dateAwarded',
                    'winningGeneralContractor',
                    'lifecycleReason',
                  ]) ? ' required-attention' : ''}`}
                >
                  <div className="bid-edit-section-heading">
                    <div>
                      <span className="section-kicker">LIFECYCLE</span>
                      <h3>Complete Bid</h3>
                    </div>
                    <small>{selectedLifecycleAction}</small>
                  </div>

                  {selectedLifecycleAction === 'Awarded' ? (
                    <>
                      <div className="bid-edit-grid two-column">
                        <Field
                          label="Date Awarded"
                          fieldKey="dateAwarded"
                          invalid={requiredFields.includes('dateAwarded')}
                        >
                          <input
                            type="date"
                            value={dateAwarded}
                            disabled={!canEdit || lifecycleComplete}
                            onChange={event => {
                              setDateAwarded(event.target.value);
                              clearRequiredField('dateAwarded');
                              setSaveError(null);
                            }}
                          />
                        </Field>

                        <Field
                          label="Winning General Contractor"
                          fieldKey="winningGeneralContractor"
                          invalid={requiredFields.includes('winningGeneralContractor')}
                          hint={
                            generalContractorNames(form.generalContractors).length > 1
                              ? 'Required because this bid has multiple GCs.'
                              : 'The only GC will automatically be used as the winner.'
                          }
                        >
                          {generalContractorNames(form.generalContractors).length > 1 ? (
                            <select
                              value={winningGeneralContractor}
                              disabled={!canEdit || lifecycleComplete}
                              onChange={event => {
                                setWinningGeneralContractor(event.target.value);
                                clearRequiredField('winningGeneralContractor');
                                setSaveError(null);
                              }}
                            >
                              <option value="">Select winning GC…</option>
                              {generalContractorNames(form.generalContractors).map(gc => (
                                <option key={gc} value={gc}>{gc}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={generalContractorNames(form.generalContractors)[0] || ''}
                              readOnly
                              className="bid-edit-readonly-input"
                            />
                          )}
                        </Field>
                      </div>

                      <div className="bid-edit-rule-note">
                        Award requires a real PM, Due Date, Project Type, Purpose, GC, Estimated Price, Margin, Retention, Anticipated Start, Estimated Project Duration, Street Address, City, State, and Date Awarded. Losing GCs are automatically created as GC Not Awarded.
                      </div>
                    </>
                  ) : (
                    <Field
                      label={`${selectedLifecycleAction} Reason`}
                      wide
                      fieldKey="lifecycleReason"
                      invalid={requiredFields.includes('lifecycleReason')}
                      hint="Required before this bid can leave Active Bids."
                    >
                      <textarea
                        className="bid-edit-notes-textarea"
                        rows="4"
                        maxLength="2000"
                        value={lifecycleReason}
                        disabled={!canEdit || lifecycleComplete}
                        onChange={event => {
                          setLifecycleReason(event.target.value);
                          clearRequiredField('lifecycleReason');
                          setSaveError(null);
                        }}
                      />
                    </Field>
                  )}

                  <div className="bid-edit-message warning">
                    This is a final Bid Log lifecycle action. The existing Power Automate workflow will move the completed record to its outcome list after SharePoint sees the status change.
                  </div>
                </section>
              )}

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
