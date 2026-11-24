// The team owns this ordinary boolean: true=Contract, false=LOI.
// Keep an unknown historical value distinct from false. No workflow action.
export default function ProjectContractType({value, disabled=true, onChange}) {
  const editable=!disabled&&typeof onChange==='function';
  return <div className="bid-edit-field project-contract-type">
    <span>Contract / LOI</span>
    {editable?<div className="project-contract-toggle" role="group" aria-label="Contract / LOI">
      {[[true,'Contract'],[false,'LOI']].map(([flag,label])=><button key={label} type="button"
        aria-pressed={value===flag} className={value===flag?'selected':''}
        onClick={()=>onChange(flag)}>{label}</button>)}
    </div>:<div className="project-contract-type-readout">{value===true?'Contract':value===false?'LOI':'—'}</div>}
  </div>;
}
