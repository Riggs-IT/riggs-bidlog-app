// An ordered name list, never a separate count input. The provider owns IDs.
export default function ProjectBuildingRows({rows,editable=false,disabled=false,onChange,onCancel}) {
  if(!Array.isArray(rows))return <div className="bid-edit-message">Building information unavailable.</div>;
  const canChange=editable&&!disabled&&typeof onChange==='function';
  const canCancel=typeof onCancel==='function';
  return <div className="project-building-rows">
    <div className="cognito-general-row-heading project-building-heading">
      <small>{rows.length} {rows.length===1?'building':'buildings'}</small>
      {editable&&<button type="button" className="secondary-button" disabled={!canChange||rows.length>=100}
        onClick={()=>onChange([...rows,{id:null,name:''}])}>+ Add Building</button>}
    </div>
    {!rows.length&&<div className="project-building-empty">No buildings listed.</div>}
    {rows.map((row,index)=><div className="project-building-row" key={row?.id??`new-${index}`}>
      <label className="bid-edit-field project-building-name">
        <span>Building {index+1}</span>
        {editable?<input type="text" aria-label={`Building ${index+1}`} value={row?.name??''} maxLength={1000}
          disabled={!canChange} onChange={e=>onChange(rows.map((r,i)=>i===index?{...r,name:e.target.value}:r))}/>
          :<strong>{row?.name||'—'}</strong>}
      </label>
      {editable&&<button type="button" className="secondary-button" aria-label={`Remove Building ${index+1}`}
        disabled={!canChange||(rows.length<=1&&!canCancel)} onClick={()=>{
          if(rows.length===1){if(canCancel)onCancel();return;}
          onChange(rows.filter((_,i)=>i!==index));
        }}>Remove</button>}
    </div>)}
  </div>;
}
