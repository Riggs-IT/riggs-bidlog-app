import {useMemo, useState} from 'react';
import ProjectSetupIdentityPicker from './ProjectSetupIdentityPicker.jsx';
import DesignTeamContactDetails from './DesignTeamContactDetails.jsx';

const VALID_206 = /^206-[1-9][0-9]*$/;

function ContactPanel({label, record, options, directoryAvailable, disabled, pending}) {
  // Active Project Form 19 write mapping has not been certified. This is an
  // explicitly local candidate preview, never a mutation of the project draft.
  const [previewId, setPreviewId] = useState(null);
  const currentId = VALID_206.test(record?.id || '') ? record.id : null;
  const selectedId = previewId ?? currentId;
  const current = useMemo(() => options.find(item => item.id === currentId) || null, [options, currentId]);
  const preview = previewId === null ? null : options.find(item => item.id === previewId) || null;
  const showingPreview = preview !== null && preview.id !== currentId;
  const selected = showingPreview ? preview : current;
  const readOnlySelection = record?.label || current?.label || 'Not selected on JIS';

  return (
    <div className="design-team-person-card">
      {directoryAvailable && !disabled ? (
        <ProjectSetupIdentityPicker
          label={label}
          value={selectedId}
          options={options}
          onChange={id => setPreviewId(id && id !== currentId ? id : null)}
        />
      ) : (
        <div className="bid-edit-field">
          <label>{label}</label>
          <div className="design-team-readonly-choice" aria-label={`${label} read-only`}>{readOnlySelection}</div>
        </div>
      )}
      <DesignTeamContactDetails
        contact={selected}
        fallbackEmail={showingPreview ? null : record?.email}
        fallbackAddress={showingPreview ? null : record?.address}
        pending={pending}
        showSource={false}
      />
      {showingPreview && (
        <div className="design-team-preview-warning" role="status">
          <strong>Not saved · Preview only</strong>
          <button type="button" className="secondary-button" onClick={() => setPreviewId(null)}>Revert</button>
        </div>
      )}
    </div>
  );
}

export default function ActiveProjectDesignTeam({
  architect = null,
  engineer = null,
  directory = null,
  directoryLoading = false,
  directoryError = null,
  onRetry = null,
  editable = false,
}) {
  return (
    <div className="design-team-section">
      <div className="project-setup-design-grid">
        <ContactPanel key={`architect-${architect?.id ?? ''}`} label="Architect of record" record={architect}
          options={directory?.architects || []} directoryAvailable={Boolean(directory)}
          disabled={!editable} pending={directoryLoading}/>
        <ContactPanel key={`engineer-${engineer?.id ?? ''}`} label="Structural engineer of record" record={engineer}
          options={directory?.engineers || []} directoryAvailable={Boolean(directory)}
          disabled={!editable} pending={directoryLoading}/>
      </div>
      {directoryError && <div role="status" className="design-team-directory-warning">
        <span>Form 206 directory unavailable. Current JIS contact details remain visible.</span>
        {onRetry && <button type="button" className="secondary-button" disabled={directoryLoading}
          onClick={onRetry}>Retry contacts</button>}
      </div>}
    </div>
  );
}
