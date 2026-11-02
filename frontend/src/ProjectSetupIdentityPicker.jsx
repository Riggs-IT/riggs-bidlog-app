import {useId,useMemo,useState} from 'react';

// SQL-backed selector. React displays labels, but writes ONLY their directory IDs.
// A selection missing from the latest directory remains visible as unverified;
// it is never silently reassigned to a similarly named person/company.
export default function ProjectSetupIdentityPicker({label,value,options=[],onChange,multiple=false,
  disabled=false,unavailable=false,help=''}) {
  const inputId=useId();
  const [search,setSearch]=useState('');
  const chosen=multiple ? (Array.isArray(value)?value:[]) : (value==null?[]:[value]);
  const keyed=useMemo(()=>new Map(options.map(item=>[String(item.id),item])),[options]);
  const query=search.trim().toLocaleLowerCase();
  const choices=useMemo(()=>options.filter(item=>
    !query || item.label.toLocaleLowerCase().includes(query) || String(item.id).includes(query)
  ).slice(0,100),[options,query]);
  const missing=chosen.filter(id=>!keyed.has(String(id)));
  const canChoose=!disabled && !unavailable;
  return <div className="bid-edit-field project-setup-identity-picker">
    <label htmlFor={inputId}>{label}</label>
    {unavailable ? <p className="project-setup-identity-unavailable">Verified directory not connected. This field remains unchanged.</p>
      : <>
        <input aria-label={`Search ${label}`} type="search" value={search} disabled={!canChoose}
          placeholder={`Search ${label.toLowerCase()}…`} autoComplete="off"
          onChange={event=>setSearch(event.target.value)}/>
        <select id={inputId} value={multiple?'':(value==null?'':String(value))} disabled={!canChoose}
          onChange={event=>{
            const id=event.target.value;
            if (!id) {if (!multiple) onChange(null);return;}
            const match=keyed.get(id);
            if (!match) return;
            if (multiple) {
              if (!chosen.some(current=>String(current)===id) && chosen.length<200) onChange([...chosen,match.id]);
            } else onChange(match.id);
            setSearch('');
          }}>
          <option value="">{multiple?'Add a verified selection': 'Not selected'}</option>
          {missing.length===1 && !multiple && <option value={String(missing[0])} disabled>
            Previously saved ID {String(missing[0])} (not verified in current directory)
          </option>}
          {choices.map(item=><option value={String(item.id)} key={String(item.id)}
            disabled={multiple && chosen.some(current=>String(current)===String(item.id))}>
            {item.label}
          </option>)}
        </select>
        {multiple && chosen.length>0 && <ul className="project-setup-identity-selected">
          {chosen.map(id=><li key={String(id)}>
            <span>{keyed.get(String(id))?.label||`Unverified saved ID ${String(id)}`}</span>
            <button type="button" className="secondary-button" disabled={!canChoose}
              aria-label={`Remove ${label} ${String(id)}`}
              onClick={()=>onChange(chosen.filter(item=>item!==id))}>Remove</button>
          </li>)}
        </ul>}
        {missing.length>0 && <small className="project-setup-identity-warning" role="status">
          {missing.length} saved ID(s) are not present in the current verified directory. Review before changing this field.
        </small>}
        {choices.length===100 && <small>Showing up to 100 matches. Search to narrow the directory.</small>}
      </>}
    {help && <small>{help}</small>}
  </div>;
}
