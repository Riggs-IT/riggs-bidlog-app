import MoneyInput from './MoneyInput.jsx';
import {quantityWholeDisplay} from './projectMetricsEditor.mjs';
import {displayMoneyValue} from './moneyInput.js';

export default function ProjectMetricsFields({state,editor,canEdit,blocked=false,reference={},onReload}) {
  const fields=[['squareFootage','Square Footage (SF)'],['cubicYards','Cubic Yards (CY)']];
  if(state.snapshot?.panelApplicable===true) fields.push(['numberOfPanels','Number of Panels']);
  const editable=canEdit&&state.snapshot?.canEdit===true&&!blocked&&!state.loading&&!state.saving&&!state.unresolved&&!state.conflict&&!state.disabled;
  return <>
    <div className={`bid-edit-grid ${fields.length===3?'three-column':'two-column'}`}>
      {fields.map(([key,label])=><label className="bid-edit-field" key={key}><span>{label}</span>
        {state.disabled?<div className="active-project-readonly-field"><strong>{displayMoneyValue(quantityWholeDisplay(reference[key]),false,0)||'—'}</strong></div>
          :<MoneyInput maxFractionDigits={0} value={state.draft?.[key]??quantityWholeDisplay(reference[key])}
            disabled={!editable} onValueChange={value=>editor.edit(key,value)}/>}
      </label>)}
    </div>
    {state.loading&&<small role="status">Loading project metrics…</small>}
    {state.error&&<p className="bid-edit-message error" role="alert">{state.error}</p>}
    {(state.error||state.unresolved||state.conflict||state.disabled)&&<button className="secondary-button" type="button" disabled={blocked||state.saving||state.loading} onClick={onReload}>Reload quantities</button>}
  </>;
}
