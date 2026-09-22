import { useEffect, useMemo, useState } from 'react';

import BidLogConfirmDialog from './BidLogConfirmDialog.jsx';


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


function employeeEidForValue(
  value,
  people,
  fallbackRows = [],
) {
  const normalized = String(value || '').trim();

  if (!normalized) return null;

  if (normalized.startsWith('eid:')) {
    const parsed = Number(normalized.slice(4));
    return Number.isInteger(parsed) && parsed > 0
      ? parsed
      : null;
  }

  const person = people.find(
    item => String(item?.sharePointId || '') === normalized,
  );

  if (person?.eid != null) {
    const parsed = Number(person.eid);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const fallback = fallbackRows.find(
    row => assignmentValue(row) === normalized,
  );

  if (fallback?.employeeEid != null) {
    const parsed = Number(fallback.employeeEid);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}


function PersonOptions({
  people,
  role,
  currentValue,
  fallbackRows = [],
  excludedValues = [],
}) {
  const normalizedCurrent = String(currentValue || '');
  const excluded = new Set(
    excludedValues.map(value => String(value || '')),
  );
  const seen = new Set();
  const options = [];

  for (const person of people) {
    if (String(person?.staffingRole || '').toUpperCase() !== role) continue;

    const value = String(person.sharePointId || '');
    if (
      !value
      || seen.has(value)
      || (
        excluded.has(value)
        && value !== normalizedCurrent
      )
    ) {
      continue;
    }
    seen.add(value);
    options.push({
      value,
      label: person.displayName || value,
      disabled: false,
    });
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


function CurrentAssignmentRow({
  row,
  role,
  people,
  disabled,
  fallbackRows = [],
  runWrite,
  busyKey,
  requestConfirm,
}) {
  const originalValue = assignmentValue(row);
  const [value, setValue] = useState(() => originalValue);

  useEffect(() => {
    setValue(assignmentValue(row));
  }, [row?.assignmentId, row?.employeeItUserId, row?.employeeEid]);

  const applyKey = `assignment-apply-${row.assignmentId}`;
  const endKey = `assignment-end-${row.assignmentId}`;
  const targetEid = employeeEidForValue(
    value,
    people,
    fallbackRows,
  );
  const canApplySuper = (
    role === 'SUPER'
    && Boolean(targetEid)
    && value !== originalValue
  );

  async function applySuperintendent() {
    if (!canApplySuper) return;

    await runWrite(
      applyKey,
      {
        method: 'POST',
        path: '/staffing/assign',
        payload: {
          employeeEid: targetEid,
          role,
        },
      },
    );
  }

  function endCurrent() {
    const label = personLabel(row);
    const roleLabel = role === 'SUPER'
      ? 'Superintendent'
      : 'Foreman';

    requestConfirm({
      title: `End current ${roleLabel}?`,
      message:
        `End ${label}'s current ${roleLabel} assignment? `
        + 'This updates Operations staffing and downstream projections.',
      confirmLabel: 'End assignment',
      danger: true,
      action: () => runWrite(
        endKey,
        {
          method: 'POST',
          path: '/staffing/unassign',
          payload: {
            employeeEid: Number(row.employeeEid),
            role,
          },
        },
      ),
    });
  }

  return (
    <div className="project-team-organizer-row staffing-current-assignment-row">
      <div className="project-team-organizer-grid">
        {role === 'SUPER' ? (
          <label className="project-team-staffing-field">
            <span>Superintendent</span>
            <select
              className="project-team-person-select"
              value={value}
              disabled={disabled}
              onChange={event => setValue(event.target.value)}
            >
              <option value="">Select Superintendent</option>
              <PersonOptions
                people={people}
                role={role}
                currentValue={value}
                fallbackRows={fallbackRows}
              />
            </select>
          </label>
        ) : (
          <div className="staffing-current-readout">
            <span>Foreman</span>
            <strong>{personLabel(row)}</strong>
            <small>Current field assignment</small>
          </div>
        )}

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
          {row.isCognitoProjected && (
            <span className="staffing-projection-badge">
              Projected to Cognito
            </span>
          )}
        </div>

        <div className="bid-log-edit-footer-actions">
          {role === 'SUPER' && (
            <button
              type="button"
              className="secondary-button staffing-add-button"
              disabled={disabled || !canApplySuper}
              onClick={applySuperintendent}
            >
              {busyKey === applyKey ? 'Applying…' : 'Apply'}
            </button>
          )}

          <button
            type="button"
            className="staffing-inline-action danger"
            disabled={disabled}
            onClick={endCurrent}
          >
            {busyKey === endKey ? 'Ending…' : 'End current'}
          </button>
        </div>
      </div>
    </div>
  );
}


function CurrentAssignmentStarter({
  role,
  people,
  disabled,
  fallbackRows,
  excludedValues,
  runWrite,
  busyKey,
}) {
  const [value, setValue] = useState('');
  const actionKey = `assignment-add-${role}`;
  const targetEid = employeeEidForValue(
    value,
    people,
    fallbackRows,
  );

  async function assignCurrent() {
    if (!targetEid) return;

    const succeeded = await runWrite(
      actionKey,
      {
        method: 'POST',
        path: '/staffing/assign',
        payload: {
          employeeEid: targetEid,
          role,
        },
      },
    );

    if (succeeded) {
      setValue('');
    }
  }

  return (
    <div className="project-team-organizer-row">
      <div className="project-team-current-editor">
        <label className="project-team-staffing-field">
          <span>
            {role === 'SUPER'
              ? 'Assign Current Superintendent'
              : 'Add Current Foreman'}
          </span>
          <select
            className="project-team-person-select"
            value={value}
            disabled={disabled}
            onChange={event => setValue(event.target.value)}
          >
            <option value="">Select person</option>
            <PersonOptions
              people={people}
              role={role}
              currentValue={value}
              fallbackRows={fallbackRows}
              excludedValues={excludedValues}
            />
          </select>
        </label>

        <button
          type="button"
          className="secondary-button staffing-add-button"
          disabled={disabled || !targetEid}
          onClick={assignCurrent}
        >
          {busyKey === actionKey
            ? 'Assigning…'
            : 'Assign current'}
        </button>
      </div>
    </div>
  );
}


function scheduleDraft(row, index, role) {
  return {
    key: row?.scheduleId
      ? `schedule-${row.scheduleId}`
      : `draft-${role}-${index}`,
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


function OrganizerRows({
  role,
  assignments,
  schedules,
  people,
  disabled,
  runWrite,
  busyKey,
  requestConfirm,
}) {
  const [rows, setRows] = useState(
    () => schedules.map(
      (row, index) => scheduleDraft(row, index, role),
    ),
  );

  useEffect(() => {
    setRows(
      schedules.map(
        (row, index) => scheduleDraft(row, index, role),
      ),
    );
  }, [role, schedules]);

  function addRow() {
    setRows(current => [
      ...current,
      scheduleDraft(null, Date.now(), role),
    ]);
  }

  function updateRow(key, field, value) {
    setRows(current => current.map(row => (
      row.key === key
        ? { ...row, [field]: value }
        : row
    )));
  }

  function removeLocalRow(key) {
    setRows(current => current.filter(
      row => row.key !== key,
    ));
  }

  async function saveRow(row) {
    const employeeEid = employeeEidForValue(
      row.employeeValue,
      people,
      fallbackRows,
    );

    if (!employeeEid) {
      return;
    }

    if (
      row.startDateOverride
      && row.endDateOverride
      && row.endDateOverride < row.startDateOverride
    ) {
      await runWrite(
        `schedule-validation-${row.key}`,
        {
          validationError:
            'Organizer end date cannot be before the start date.',
        },
      );
      return;
    }

    const payload = {
      employeeEid,
      startDateOverride: row.startDateOverride || null,
      endDateOverride: row.endDateOverride || null,
      status: row.status,
      notes: row.notes.trim() || null,
    };

    if (row.scheduleId) {
      await runWrite(
        `schedule-save-${row.key}`,
        {
          method: 'PUT',
          path: `/resource-schedule/${row.scheduleId}`,
          payload,
        },
      );
      return;
    }

    await runWrite(
      `schedule-save-${row.key}`,
      {
        method: 'POST',
        path: '/resource-schedule',
        payload: {
          ...payload,
          resourceRole: role,
        },
      },
    );
  }

  function removeRow(row) {
    if (!row.scheduleId) {
      removeLocalRow(row.key);
      return;
    }

    requestConfirm({
      title: 'Remove Organizer plan?',
      message:
        'Remove this Organizer plan? The cancelled row stays in SQL history.',
      confirmLabel: 'Remove plan',
      danger: true,
      action: () => runWrite(
        `schedule-remove-${row.key}`,
        {
          method: 'DELETE',
          path: `/resource-schedule/${row.scheduleId}`,
        },
      ),
    });
  }

  const hasCurrent = assignments.length > 0;
  const hasPlanned = rows.length > 0;
  const addLabel = !hasCurrent && !hasPlanned
    ? '+ Start Plan'
    : '+ Add Plan';
  const fallbackRows = [...assignments, ...schedules];

  return (
    <div className="project-team-organizer-editor">
      <div className="project-team-organizer-heading">
        <div>
          <strong>Organizer Planning</strong>
          <small>
            Current staffing appears first. Future Organizer rows follow underneath.
          </small>
        </div>
        <button
          type="button"
          className="secondary-button staffing-add-button"
          disabled={disabled}
          onClick={addRow}
        >
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
            runWrite={runWrite}
            busyKey={busyKey}
            requestConfirm={requestConfirm}
          />
        ))}

        {(role === 'FOREMAN' || !hasCurrent) && (
          <CurrentAssignmentStarter
            role={role}
            people={people}
            disabled={disabled}
            fallbackRows={fallbackRows}
            excludedValues={assignments.map(assignmentValue)}
            runWrite={runWrite}
            busyKey={busyKey}
          />
        )}

        {rows.map(row => {
          const saveKey = `schedule-save-${row.key}`;
          const removeKey = `schedule-remove-${row.key}`;
          const employeeEid = employeeEidForValue(
            row.employeeValue,
            people,
            fallbackRows,
          );

          return (
            <div
              className="project-team-organizer-row"
              key={row.key}
            >
              <div className="project-team-organizer-grid">
                <label className="project-team-staffing-field">
                  <span>
                    {role === 'SUPER'
                      ? 'Superintendent'
                      : 'Foreman'}
                  </span>
                  <select
                    className="project-team-person-select"
                    value={row.employeeValue}
                    disabled={disabled}
                    onChange={event => updateRow(
                      row.key,
                      'employeeValue',
                      event.target.value,
                    )}
                  >
                    <option value="">Select person</option>
                    <PersonOptions
                      people={people}
                      role={role}
                      currentValue={row.employeeValue}
                      fallbackRows={fallbackRows}
                    />
                  </select>
                </label>

                <label className="project-team-staffing-field">
                  <span>Start</span>
                  <input
                    className="project-team-person-select"
                    type="date"
                    value={row.startDateOverride}
                    disabled={disabled}
                    onChange={event => updateRow(
                      row.key,
                      'startDateOverride',
                      event.target.value,
                    )}
                  />
                </label>

                <label className="project-team-staffing-field">
                  <span>End</span>
                  <input
                    className="project-team-person-select"
                    type="date"
                    value={row.endDateOverride}
                    disabled={disabled}
                    onChange={event => updateRow(
                      row.key,
                      'endDateOverride',
                      event.target.value,
                    )}
                  />
                </label>

                <label className="project-team-staffing-field">
                  <span>Status</span>
                  <select
                    className="project-team-person-select"
                    value={row.status}
                    disabled={disabled}
                    onChange={event => updateRow(
                      row.key,
                      'status',
                      event.target.value,
                    )}
                  >
                    <option value="PLANNED">Planned</option>
                    <option value="CONFIRMED">Confirmed</option>
                    {row.scheduleId && (
                      <option value="COMPLETED">Completed</option>
                    )}
                  </select>
                </label>
              </div>

              <label className="project-team-staffing-field organizer-notes-field">
                <span>Planner Notes</span>
                <textarea
                  rows="2"
                  value={row.notes}
                  disabled={disabled}
                  onChange={event => updateRow(
                    row.key,
                    'notes',
                    event.target.value,
                  )}
                />
              </label>

              <div className="project-team-organizer-footer">
                <div className="project-team-organizer-effective">
                  <small>
                    Effective: {displayDate(
                      row.startDateOverride
                      || row.effectiveStartDate,
                    )} → {displayDate(
                      row.endDateOverride
                      || row.effectiveEndDate,
                    )}
                  </small>
                  {row.isActiveAssignment && <span>Current</span>}
                  {row.isCognitoProjectedPerson && (
                    <span className="staffing-projection-badge">
                      Projected to Cognito
                    </span>
                  )}
                </div>

                <div className="bid-log-edit-footer-actions">
                  <button
                    type="button"
                    className="secondary-button staffing-add-button"
                    disabled={disabled || !employeeEid}
                    onClick={() => saveRow(row)}
                  >
                    {busyKey === saveKey
                      ? 'Saving…'
                      : row.scheduleId
                        ? 'Update plan'
                        : 'Save plan'}
                  </button>

                  <button
                    type="button"
                    className="staffing-inline-action danger"
                    disabled={disabled}
                    onClick={() => removeRow(row)}
                  >
                    {busyKey === removeKey
                      ? 'Removing…'
                      : 'Remove plan'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {!hasCurrent && !hasPlanned && (
          <div className="staffing-plan-empty-state">
            <strong>
              No current {role === 'SUPER'
                ? 'Superintendent'
                : 'Foreman'}.
            </strong>
            <span>
              Assign current staffing above or start an Organizer plan.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}


function RoleEditor({
  role,
  title,
  assignments,
  schedules,
  people,
  disabled,
  runWrite,
  busyKey,
  requestConfirm,
}) {
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
        runWrite={runWrite}
        busyKey={busyKey}
        requestConfirm={requestConfirm}
      />
    </div>
  );
}


export default function ActiveProjectStaffingOrganizer({
  payload,
  loading,
  error,
  onRetry,
  onWrite,
  people = [],
  canEdit = false,
  blocked = false,
  writeEnabled = false,
}) {
  const [busyKey, setBusyKey] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const assignments = useMemo(
    () => (
      Array.isArray(payload?.activeAssignments)
        ? payload.activeAssignments
        : []
    ),
    [payload],
  );

  const schedules = useMemo(
    () => (
      Array.isArray(payload?.schedules)
        ? payload.schedules
        : []
    ),
    [payload],
  );

  const supers = useMemo(
    () => assignments.filter(
      row => row.resourceRole === 'SUPER',
    ),
    [assignments],
  );

  const foremen = useMemo(
    () => assignments.filter(
      row => row.resourceRole === 'FOREMAN',
    ),
    [assignments],
  );

  const superSchedules = useMemo(
    () => schedules.filter(
      row => row.resourceRole === 'SUPER',
    ),
    [schedules],
  );

  const foremanSchedules = useMemo(
    () => schedules.filter(
      row => row.resourceRole === 'FOREMAN',
    ),
    [schedules],
  );

  function requestConfirm(dialog) {
    setConfirmDialog(dialog);
  }

  async function runWrite(key, request) {
    if (request?.validationError) {
      setMutationError(request.validationError);
      return false;
    }

    if (!onWrite) {
      setMutationError(
        'Staffing write service is not available.',
      );
      return false;
    }

    setBusyKey(key);
    setMutationError(null);

    try {
      await onWrite(request);
      return true;
    } catch (writeError) {
      setMutationError(
        writeError?.message
        || 'Unable to save field staffing.',
      );
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return (
      <div className="project-team-staffing-shell">
        <div className="project-team-staffing-heading">
          <div>
            <span className="section-kicker">FIELD STAFFING</span>
            <h4>Superintendent & Foremen</h4>
          </div>
          <small>Loading Operations staffing…</small>
        </div>
        <div className="bid-edit-message">
          Loading current assignments and Organizer rows…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="project-team-staffing-shell">
        <div className="project-team-staffing-heading">
          <div>
            <span className="section-kicker">FIELD STAFFING</span>
            <h4>Superintendent & Foremen</h4>
          </div>
        </div>
        <div className="bid-edit-message error">
          <span>{error}</span>
          <button
            type="button"
            className="secondary-button"
            onClick={onRetry}
          >
            Retry staffing
          </button>
        </div>
      </div>
    );
  }

  if (!payload) return null;

  const disabled = (
    !canEdit
    || !writeEnabled
    || blocked
    || Boolean(busyKey)
  );

  return (
    <div className="project-team-staffing-shell">
      <div className="project-team-staffing-heading">
        <div>
          <span className="section-kicker">FIELD STAFFING</span>
          <h4>Superintendent & Foremen</h4>
        </div>
        <div className="project-team-staffing-heading-meta">
          <small>Operations staffing authority</small>
        </div>
      </div>

      <p className="cognito-general-note staffing-organizer-note">
        Current assignments are shown in the Organizer timeline using their Operations assignment start date. The first active Foreman and current Superintendent remain the people projected to Cognito.
      </p>

      {canEdit && !writeEnabled && (
        <div className="bid-edit-message">
          Staffing writes are currently restricted to the controlled test project.
        </div>
      )}

      {mutationError && (
        <div className="bid-edit-message error">
          {mutationError}
        </div>
      )}

      <RoleEditor
        role="SUPER"
        title="Superintendent"
        assignments={supers}
        schedules={superSchedules}
        people={people}
        disabled={disabled}
        runWrite={runWrite}
        busyKey={busyKey}
        requestConfirm={requestConfirm}
      />

      <RoleEditor
        role="FOREMAN"
        title="Foremen"
        assignments={foremen}
        schedules={foremanSchedules}
        people={people}
        disabled={disabled}
        runWrite={runWrite}
        busyKey={busyKey}
        requestConfirm={requestConfirm}
      />

      <BidLogConfirmDialog
        open={Boolean(confirmDialog)}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        confirmLabel={confirmDialog?.confirmLabel}
        danger={confirmDialog?.danger === true}
        onCancel={() => setConfirmDialog(null)}
        onConfirm={() => {
          const action = confirmDialog?.action;
          setConfirmDialog(null);
          Promise.resolve()
            .then(() => action?.())
            .catch(() => {});
        }}
      />
    </div>
  );
}
