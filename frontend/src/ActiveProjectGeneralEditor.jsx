import './ActiveProjectGeneralEditor.css';

// Controlled by the project editor: no local save, refresh, or independent draft.
export default function ActiveProjectGeneralEditor({ section, canEdit, blocked, onEdit, onRetry }) {
  const { snapshot, draft, loading, error } = section;
  const editable = Boolean(canEdit && snapshot?.writeEnabled && !blocked && !loading);
  const edit = onEdit;
  function removeBuilding(index) {
    if (!window.confirm('Remove this building row? The row will be removed from Cognito when you click Save Changes.')) return;
    edit('buildingNames', draft.buildingNames.filter((_, i) => i !== index));
  }

  return (
    <section className="bid-edit-section information-sheet-section cognito-general-editor">
      <div className="bid-edit-section-heading information-sheet-heading">
        <div><span className="section-kicker">GENERAL INFORMATION</span><h3>Scope & Project Requirements</h3></div>
      </div>
      {loading && <div className="bid-edit-message">Loading current General Information…</div>}
      {!loading && !snapshot && <div className="bid-edit-message">This section is not ready. The existing project save is unaffected.</div>}
      {error && !snapshot && <div className="bid-edit-message error" role="alert"><span>{error}</span>
        <button type="button" className="secondary-button" disabled={blocked || loading} onClick={onRetry}>Try again</button>
      </div>}
      {!loading && snapshot && draft && <>
        <p className="cognito-general-note">
          {snapshot.writeEnabled && canEdit
            ? 'Edits are currently enabled for test Job 11111. Use Save Changes at the bottom to save your project edits together.'
            : 'Read-only. General Information editing is currently limited to administrators on the enabled test project.'}
        </p>
        <fieldset disabled={!editable} className="cognito-general-fields">
          <div className="bid-edit-grid three-column">
            <label className="bid-edit-field"><span>Number of Buildings</span>
              <input type="number" min="1" max="100" step="1" value={draft.numberOfBuildings}
                onChange={event => edit('numberOfBuildings', event.target.value)} />
            </label>
            {[['leed', 'LEED'], ['ndaRequired', 'NDA Required']].map(([field, label]) => (
              <label className="bid-edit-field" key={field}><span>{label}</span>
                <select value={draft[field]} onChange={event => edit(field, event.target.value)}>
                  <option value="" disabled>Not set</option><option value="true">Yes</option><option value="false">No</option>
                </select>
              </label>
            ))}
            <label className="bid-edit-field wide"><span>Scope</span>
              <textarea rows="4" maxLength="20000" value={draft.scope} onChange={event => edit('scope', event.target.value)} />
            </label>
          </div>
          <div className="cognito-general-buildings">
            <div className="cognito-general-row-heading"><strong>Building Names</strong>
              <button type="button" className="secondary-button" disabled={!editable || draft.buildingNames.length >= 100}
                onClick={() => edit('buildingNames', [...draft.buildingNames, { id: null, name: '' }])}>Add building</button>
            </div>
            {!draft.buildingNames.length && <p className="cognito-general-note">No building rows recorded.</p>}
            {draft.buildingNames.map((row, index) => (
              <div className="cognito-general-building" key={row.id || `new-${index}`}>
                <label className="bid-edit-field"><span>Building {index + 1}</span>
                  <input type="text" maxLength="1000" value={row.name}
                    onChange={event => edit('buildingNames', draft.buildingNames.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} />
                </label>
                <button type="button" className="secondary-button" aria-label={`Remove building ${index + 1}`} onClick={() => removeBuilding(index)}>Remove</button>
              </div>
            ))}
          </div>
        </fieldset>
        <p className="cognito-general-note">Contract / LOI remains read-only while its label mapping is verified. </p>

      </>}
    </section>
  );
}
