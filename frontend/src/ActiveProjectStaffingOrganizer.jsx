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

function sourceLabel(value) {
  const labels = {
    CUSTOM_OVERRIDE: 'Custom override',
    PROJECT_PLANNED_START: 'Following planned project start',
    PROJECT_ANTICIPATED_START: 'Following anticipated project start',
    PROJECT_PLANNED_END: 'Following planned project end',
    UNRESOLVED: 'No project date available',
  };
  return labels[value] || value || 'Unknown';
}

function AssignmentRow({ row }) {
  return (
    <div className="staffing-assignment-row">
      <div>
        <strong>{row.employeeName || `EID ${row.employeeEid}`}</strong>
        <small>{row.resourceRole === 'SUPER' ? 'Superintendent' : 'Foreman'}</small>
      </div>
      <div className="staffing-assignment-meta">
        {row.isCognitoProjected && (
          <span className="staffing-projection-badge">Projected to Cognito</span>
        )}
        <small>Current assignment</small>
      </div>
    </div>
  );
}

function ScheduleRow({ row }) {
  const customStart = row.startDateOverride != null;
  const customEnd = row.endDateOverride != null;
  return (
    <div className="staffing-schedule-row">
      <div className="staffing-schedule-main">
        <div>
          <strong>{row.employeeName || `EID ${row.employeeEid}`}</strong>
          <small>{row.status || '—'}</small>
        </div>
        <div className="staffing-date-range">
          <strong>{displayDate(row.effectiveStartDate)} → {displayDate(row.effectiveEndDate)}</strong>
          <small>
            {customStart || customEnd
              ? 'Custom Organizer dates'
              : 'Following project schedule'}
          </small>
        </div>
        <div className="staffing-row-flags">
          {row.isActiveAssignment && <span>Current</span>}
          {row.isCognitoProjectedPerson && (
            <span className="staffing-projection-badge">Projected to Cognito</span>
          )}
        </div>
      </div>
      <div className="staffing-schedule-details">
        <small>Start: {sourceLabel(row.startDateSource)}</small>
        <small>End: {sourceLabel(row.endDateSource)}</small>
        {row.notes && <p>{row.notes}</p>}
      </div>
    </div>
  );
}

function RoleGroup({ title, assignments, schedules, emptyText }) {
  return (
    <div className="staffing-role-group">
      <div className="information-sheet-subheading staffing-role-heading">
        <span>{title}</span>
        <small>{schedules.length} Organizer row{schedules.length === 1 ? '' : 's'}</small>
      </div>

      <div className="staffing-current-block">
        <span className="staffing-current-label">Current staffing projection</span>
        {assignments.length
          ? assignments.map(row => <AssignmentRow key={row.assignmentId} row={row} />)
          : <p className="staffing-empty-note">No current assignment.</p>}
      </div>

      <div className="staffing-organizer-list">
        {schedules.length
          ? schedules.map(row => <ScheduleRow key={row.scheduleId} row={row} />)
          : <p className="staffing-empty-note">{emptyText}</p>}
      </div>
    </div>
  );
}

export default function ActiveProjectStaffingOrganizer({ payload, loading, error, onRetry }) {
  if (loading) {
    return (
      <section className="bid-edit-section information-sheet-section">
        <div className="bid-edit-section-heading information-sheet-heading">
          <div><span className="section-kicker">FIELD STAFFING / ORGANIZER</span><h3>Superintendent & Foremen</h3></div>
          <small>Loading Operations staffing…</small>
        </div>
        <div className="bid-edit-message">Loading current assignments and Organizer rows…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bid-edit-section information-sheet-section">
        <div className="bid-edit-section-heading information-sheet-heading">
          <div><span className="section-kicker">FIELD STAFFING / ORGANIZER</span><h3>Superintendent & Foremen</h3></div>
        </div>
        <div className="bid-edit-message error">
          <span>{error}</span>
          <button type="button" className="secondary-button" onClick={onRetry}>Retry staffing</button>
        </div>
      </section>
    );
  }

  if (!payload) return null;

  const assignments = Array.isArray(payload.activeAssignments) ? payload.activeAssignments : [];
  const schedules = Array.isArray(payload.schedules) ? payload.schedules : [];
  const supers = assignments.filter(row => row.resourceRole === 'SUPER');
  const foremen = assignments.filter(row => row.resourceRole === 'FOREMAN');
  const superSchedules = schedules.filter(row => row.resourceRole === 'SUPER');
  const foremanSchedules = schedules.filter(row => row.resourceRole === 'FOREMAN');

  return (
    <section className="bid-edit-section information-sheet-section staffing-organizer-section">
      <div className="bid-edit-section-heading information-sheet-heading">
        <div>
          <span className="section-kicker">FIELD STAFFING / ORGANIZER</span>
          <h3>Superintendent & Foremen</h3>
        </div>
        <small>Operations is authoritative · read-only in this stage</small>
      </div>

      <p className="cognito-general-note staffing-organizer-note">
        Organizer rows show planned staffing timing. Current assignments determine the Superintendent and first Foreman projected to Cognito.
      </p>

      <RoleGroup
        title="Superintendent"
        assignments={supers}
        schedules={superSchedules}
        emptyText="No Superintendent Organizer rows yet."
      />
      <RoleGroup
        title="Foremen"
        assignments={foremen}
        schedules={foremanSchedules}
        emptyText="No Foreman Organizer rows yet."
      />
    </section>
  );
}
