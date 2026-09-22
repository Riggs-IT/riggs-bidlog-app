import { useEffect, useMemo, useState } from 'react';


function displayDate(value) {
  if (!value) return 'Open';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}


function displayAssignmentDate(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}


function assignmentValue(row) {
  if (row?.employeeItUserId != null) {
    return String(row.employeeItUserId);
  }

  if (row?.employeeEid != null) {
    return `eid:${row.employeeEid}`;
  }

  return '';
}


function scheduleValue(row) {
  if (row?.employeeItUserId != null) {
    return String(row.employeeItUserId);
  }

  if (row?.employeeEid != null) {
    return `eid:${row.employeeEid}`;
  }

  return '';
}


function personLabel(row) {
  return row?.employeeName || (row?.employeeEid ? `EID ${row.employeeEid}` : 'Unassigned');
}


function PersonOptions({
  people,
  role,
  currentValue,
  fallbackRows = [],
}) {
  const normalizedCurrent = String(currentValue || '');
  const seen = new Set();
  const options = [];

  for (const person of people) {
    if (String(person?.staffingRole || '').toUpperCase() !== role) continue;

    const value = String(person.sharePointId || '');
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: person.displayName || value, disabled: false });
  }

  if (normalizedCurrent && !seen.has(normalizedCurrent)) {
    const fallback = fallbackRows.find(
      row => assignmentValue(row) === normalizedCurrent,
    );

    if (fallback) {
      options.unshift({
        value: normalizedCurrent,
        label: `${personLabel(fallback)} (current)`,
        disabled: true,
      });
    }
  }

  return options.map(option => (
    <option
      key={option.value}
      value={option.value}
      disabled={option.disabled}
    >
      {option.label}
    </option>
  ));
}


function CurrentAssignmentRow({ row, role, people, disabled, fallbackRows = [] }) {
  const [value, setValue] = useState(() => assignmentValue(row));

  useEffect(() => {
    setValue(assignmentValue(row));
  }, [row?.assignmentId, row?.employeeItUserId, row?.employeeEid]);

  return (
    <div className="project-team-organizer-row staffing-current-assignment-row">
      <div className="project-team-organizer-grid">
        <label className="project-team-staffing-field">
          <span>{role === 'SUPER' ? 'Superintendent' : 'Foreman'}</span>
          <select className="project-team-person-select" value={value} disabled={disabled} onChange={event => setValue(event.target.value)}>
            <option value="">Unassigned</option>
            <PersonOptions people={people} role={role} currentValue={value} fallbackRows={fallbackRows} />
          </select>
        </label>

        <div className="staffing-current-readout">
          <span>Current Start</span>
          <strong>{displayAssignmentDate(row.assignedAt)}</strong>
          <small>Operations assignment history</small>
        </div>

        <div className="staffing-current-readout">
          <span>End</span>
          <strong>Indefinite</strong>
          <small>Until current staffing changes</small>
        </div>

        <div className="staffing-current-readout">
          <span>Status</span>
          <strong className="staffing-current-status">Current</strong>
          <small>Active assignment</small>
        </div>
      </div>

      <div className="project-team-organizer-footer">
        <div className="project-team-organizer-effective">
          <span>Current assignment</span>
          {row.isCognitoProjected && <span className="staffing-projection-badge">Projected to Cognito</span>}
        </div>
        <button type="button" className="staffing-inline-action danger" disabled={disabled}>
          End current
        </button>
      </div>
    </div>
  );
}


function scheduleDraft(row, index, role) {
  return {
    key: row?.scheduleId ? `schedule-${row.scheduleId}` : `preview-${role}-${index}`,
    scheduleId: row?.scheduleId || null,
    employeeValue: scheduleValue(row),
    employeeName: row?.employeeName || '',
    startDateOverride: row?.startDateOverride || '',
    endDateOverride: row?.endDateOverride || '',
    effectiveStartDate: row?.effectiveStartDate || null,
    effectiveEndDate: row?.effectiveEndDate || null,
    status: row?.status || 'PLANNED',
    notes: row?.notes || '',
    isActiveAssignment: Boolean(row?.isActiveAssignment),
    isCognitoProjectedPerson: Boolean(row?.isCognitoProjectedPerson),
  };
}


function OrganizerRows({ role, assignments, schedules, people, disabled }) {
  const [rows, setRows] = useState(() => schedules.map((row, index) => scheduleDraft(row, index, role)));

  useEffect(() => {
    setRows(schedules.map((row, index) => scheduleDraft(row, index, role)));
  }, [role, schedules]);

  function addRow() {
    setRows(current => [
      ...current,
      scheduleDraft(null, Date.now(), role),
    ]);
  }

  function updateRow(key, field, value) {
    setRows(current => current.map(row => (
      row.key === key ? { ...row, [field]: value } : row
    )));
  }

  function removeRow(key) {
    setRows(current => current.filter(row => row.key !== key));
  }

  const hasCurrent = assignments.length > 0;
  const hasPlanned = rows.length > 0;
  const addLabel = !hasCurrent && !hasPlanned ? '+ Start Plan' : '+ Add Plan';
  const fallbackRows = [...assignments, ...schedules];

  return (
    <div className="project-team-organizer-editor">
      <div className="project-team-organizer-heading">
        <div>
          <strong>Organizer Planning</strong>
          <small>Current staffing appears first. Future Organizer rows follow underneath.</small>
        </div>
        <button type="button" className="secondary-button staffing-add-button" disabled={disabled} onClick={addRow}>
          {addLabel}
        </button>
      </div>

      <div className="project-team-organizer-list">
        {assignments.map(row => (
          <CurrentAssignmentRow
            key={`current-${row.assignmentId}`}
            row={row}
            role={role}
            people={people}
            disabled={disabled}
            fallbackRows={fallbackRows}
          />
        ))}

        {rows.map(row => (
          <div className="project-team-organizer-row" key={row.key}>
            <div className="project-team-organizer-grid">
              <label className="project-team-staffing-field">
                <span>{role === 'SUPER' ? 'Superintendent' : 'Foreman'}</span>
                <select className="project-team-person-select" value={row.employeeValue} disabled={disabled} onChange={event => updateRow(row.key, 'employeeValue', event.target.value)}>
                  <option value="">Select person</option>
                  <PersonOptions people={people} role={role} currentValue={row.employeeValue} fallbackRows={fallbackRows} />
                </select>
              </label>

              <label className="project-team-staffing-field">
                <span>Start</span>
                <input className="project-team-person-select" type="date" value={row.startDateOverride} disabled={disabled} onChange={event => updateRow(row.key, 'startDateOverride', event.target.value)} />
              </label>

              <label className="project-team-staffing-field">
                <span>End</span>
                <input className="project-team-person-select" type="date" value={row.endDateOverride} disabled={disabled} onChange={event => updateRow(row.key, 'endDateOverride', event.target.value)} />
              </label>

              <label className="project-team-staffing-field">
                <span>Status</span>
                <select className="project-team-person-select" value={row.status} disabled={disabled} onChange={event => updateRow(row.key, 'status', event.target.value)}>
                  <option value="PLANNED">Planned</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </label>
            </div>

            <label className="project-team-staffing-field organizer-notes-field">
              <span>Planner Notes</span>
              <textarea rows="2" value={row.notes} disabled={disabled} onChange={event => updateRow(row.key, 'notes', event.target.value)} />
            </label>

            <div className="project-team-organizer-footer">
              <div className="project-team-organizer-effective">
                <small>Effective: {displayDate(row.effectiveStartDate)} → {displayDate(row.effectiveEndDate)}</small>
                {row.isActiveAssignment && <span>Current</span>}
                {row.isCognitoProjectedPerson && <span className="staffing-projection-badge">Projected to Cognito</span>}
              </div>
              <button type="button" className="staffing-inline-action danger" disabled={disabled} onClick={() => removeRow(row.key)}>
                Remove plan
              </button>
            </div>
          </div>
        ))}

        {!hasCurrent && !hasPlanned && (
          <div className="staffing-plan-empty-state">
            <strong>No current {role === 'SUPER' ? 'Superintendent' : 'Foreman'}.</strong>
            <span>Start a plan to select a person and staffing start date.</span>
          </div>
        )}
      </div>
    </div>
  );
}


function RoleEditor({ role, title, assignments, schedules, people, disabled }) {
  return (
    <div className="project-team-role-editor">
      <div className="information-sheet-subheading staffing-role-heading">
        <span>{title}</span>
        <small>
          {assignments.length} current · {schedules.length} planned
        </small>
      </div>

      <OrganizerRows
        role={role}
        assignments={assignments}
        schedules={schedules}
        people={people}
        disabled={disabled}
      />
    </div>
  );
}


export default function ActiveProjectStaffingOrganizer({
  payload,
  loading,
  error,
  onRetry,
  people = [],
  canEdit = false,
  blocked = false,
  previewMode = false,
}) {
  const assignments = useMemo(
    () => (Array.isArray(payload?.activeAssignments) ? payload.activeAssignments : []),
    [payload],
  );
  const schedules = useMemo(
    () => (Array.isArray(payload?.schedules) ? payload.schedules : []),
    [payload],
  );

  if (loading) {
    return (
      <div className="project-team-staffing-shell">
        <div className="project-team-staffing-heading">
          <div><span className="section-kicker">FIELD STAFFING</span><h4>Superintendent & Foremen</h4></div>
          <small>Loading Operations staffing…</small>
        </div>
        <div className="bid-edit-message">Loading current assignments and Organizer rows…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="project-team-staffing-shell">
        <div className="project-team-staffing-heading">
          <div><span className="section-kicker">FIELD STAFFING</span><h4>Superintendent & Foremen</h4></div>
        </div>
        <div className="bid-edit-message error">
          <span>{error}</span>
          <button type="button" className="secondary-button" onClick={onRetry}>Retry staffing</button>
        </div>
      </div>
    );
  }

  if (!payload) return null;

  const supers = assignments.filter(row => row.resourceRole === 'SUPER');
  const foremen = assignments.filter(row => row.resourceRole === 'FOREMAN');
  const superSchedules = schedules.filter(row => row.resourceRole === 'SUPER');
  const foremanSchedules = schedules.filter(row => row.resourceRole === 'FOREMAN');
  const localPreview =
    previewMode &&
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);

  const disabled = !localPreview || !canEdit || blocked;

  return (
    <div className="project-team-staffing-shell">
      <div className="project-team-staffing-heading">
        <div>
          <span className="section-kicker">FIELD STAFFING</span>
          <h4>Superintendent & Foremen</h4>
        </div>
        <div className="project-team-staffing-heading-meta">
          {localPreview && <span className="staffing-preview-badge">Local write preview</span>}
          <small>Operations staffing authority</small>
        </div>
      </div>

      <p className="cognito-general-note staffing-organizer-note">
        Current assignments are shown in the Organizer timeline using their Operations assignment start date. The first active Foreman and current Superintendent remain the people projected to Cognito.
      </p>

      {localPreview && (
        <div className="staffing-preview-note">
          Editing is enabled here so the layout can be reviewed locally. These preview controls do not save staffing changes yet.
        </div>
      )}

      <RoleEditor
        role="SUPER"
        title="Superintendent"
        assignments={supers}
        schedules={superSchedules}
        people={people}
        disabled={disabled}
      />

      <RoleEditor
        role="FOREMAN"
        title="Foremen"
        assignments={foremen}
        schedules={foremanSchedules}
        people={people}
        disabled={disabled}
      />
    </div>
  );
}
