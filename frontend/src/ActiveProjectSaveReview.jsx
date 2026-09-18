import { useEffect, useRef } from 'react';
import './ActiveProjectSaveReview.css';

function display(value, field, people) {
  if (Array.isArray(value)) return value.length ? value.map(row => row.name || '(unnamed building)').join('\n') : 'No building rows';
  if (field === 'leed' || field === 'ndaRequired') return value === 'true' ? 'Yes' : value === 'false' ? 'No' : 'Not set';
  if (field.endsWith('ITUserId')) return people.find(person => String(person.sharePointId) === String(value))?.displayName || (value ? `Selected user ${value}` : 'Unassigned');
  return value === '' || value === null ? 'Not set' : String(value);
}

export default function ActiveProjectSaveReview({ state, editor }) {
  const reviewRef = useRef(null);
  const issueCount = state.conflicts.length + Number(Boolean(state.project.unresolved)) + Number(Boolean(state.general.unresolved));
  useEffect(() => {
    if (issueCount && !state.saving) reviewRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [issueCount, state.saving]);
  const problems = ['project', 'general'].filter(section => state[section].unresolved || (state[section].error && state[section].snapshot));
  const people = state.project.snapshot?.lookups?.people || [];
  if (!state.conflicts.length && !problems.length) return null;
  return <section ref={reviewRef} className="bid-edit-section project-save-review" aria-label="Review project changes" role="region">
    <div className="bid-edit-section-heading"><div><span className="section-kicker">REVIEW CHANGES</span><h3>Your edits are preserved</h3></div></div>
    {state.conflicts.length > 0 && <p>These fields changed elsewhere or had an uncertain save. Choose which value to keep. Nothing is sent until you click Save Changes.</p>}
    {state.conflicts.map(conflict => {
      const { section, field } = conflict;
      const mine = state[section].draft[field];
      return <div className="project-save-conflict" key={`${section}:${field}`}>
        <strong>{conflict.label}</strong>
        <div className="project-save-comparison">
          <div><span>Your edit</span><pre>{display(mine, field, people)}</pre></div>
          <div><span>Current saved value</span><pre>{display(conflict.latest, field, people)}</pre></div>
        </div>
        <div className="project-save-conflict-actions">
          <button type="button" className="secondary-button" disabled={state.saving} onClick={() => editor.resolve(section, field, 'mine')}>Keep my edit</button>
          <button type="button" className="secondary-button" disabled={state.saving} onClick={() => editor.resolve(section, field, 'latest')}>Use current value</button>
        </div>
      </div>;
    })}
    {problems.map(section => <div className="bid-edit-message error" key={section} role="alert">
      <span>{state[section].unresolved?.message || state[section].error}</span>
      {!state[section].unresolved?.critical && <button type="button" className="secondary-button"
        disabled={state.saving || state[section].loading} onClick={() => editor.load(section)}>
        {state[section].loading ? 'Checking…' : 'Check current values'}
      </button>}
    </div>)}
  </section>;
}
