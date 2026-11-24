import {toggleSubmittal} from './projectSubmittals.mjs';

export default function ProjectSubmittals({value, choices=[], disabled=true, onChange}) {
  const selected=Array.isArray(value)?value:[];
  const editable=!disabled&&typeof onChange==='function';
  const options=editable?[...new Set([...choices,...selected])]:selected;
  return <div className="bid-edit-field wide project-submittals-field">
    <span>Required Submittals</span>
    <div className="project-submittal-chips" role="group" aria-label="Required Submittals">
      {options.map(choice=>editable?<button key={choice} type="button" aria-pressed={selected.includes(choice)}
        className={`project-submittal-chip${selected.includes(choice)?' selected':''}`}
        onClick={()=>onChange(toggleSubmittal(choices,selected,choice))}>
        <span aria-hidden="true">{selected.includes(choice)?'✓':'+'}</span>{choice}</button>
        :<span key={choice} className="project-submittal-chip selected"><span aria-hidden="true">✓</span>{choice}</span>)}
      {!options.length&&<span className="project-submittal-empty">None selected</span>}
    </div>
  </div>;
}
