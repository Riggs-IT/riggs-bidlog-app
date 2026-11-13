import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {canonicalDirectory,nameKey} from './gcReference.js';
import ProjectSetupIdentityPicker from './ProjectSetupIdentityPicker.jsx';
import {TeamChip, TeamDialog} from './ProjectSetupTeamSections.jsx';

const OFFICE_ROLES = [
  {field:'pmITUserId', role:'PM', label:'Project Manager'},
  {field:'apmITUserId', role:'APM', label:'Assistant PM'},
  {field:'peITUserId', role:'PE', label:'Project Engineer'},
];

// This edits only the existing Active Project office-role fields. Field
// staffing and SQL Additional Members keep their independent authorized writes.
export function ActiveProjectOfficeTeam({values,people=[],onChange,disabled=false}) {
  const [editor,setEditor] = useState(null);
  const [remove,setRemove] = useState(null);
  const [replace,setReplace] = useState(null);
  const directory = useMemo(() => OFFICE_ROLES.reduce((map,role) => {
    map[role.role] = people.filter(person => String(person?.projectRole||'').toUpperCase() === role.role)
      .map(person => ({id:String(person.sharePointId),label:person.displayName}))
      .filter(person => person.id && person.label);
    return map;
  }, {}),[people]);
  const rows = OFFICE_ROLES.flatMap(role => {
    const value=values?.[role.field];
    if(value===undefined || value===null || value==='') return [];
    const choice=directory[role.role].find(person => person.id===String(value));
    return [{...role,id:String(value),name:choice?.label||`Unverified ID ${value}`}];
  });
  function commit(role,id) {
    if(!role || id===null || id===undefined || id==='') return;
    const current=values?.[role.field];
    if(current!==undefined && current!==null && current!=='' && String(current)!==String(id)) {
      setReplace({role,id,prior:current});
      setEditor(null);
      return;
    }
    onChange(role.field,String(id));setEditor(null);
  }
  return <div className="setup-team-section" aria-label="Riggs Team">
    <div className="setup-team-toolbar">
      <button type="button" className="secondary-button" disabled={disabled||!people.length}
        onClick={()=>setEditor({role:OFFICE_ROLES[0],id:null})}>+ Add Riggs person</button>
    </div>
    <div className="setup-team-chips">
      {!rows.length && <p className="setup-team-empty">No office team assigned.</p>}
      {rows.map(row=><TeamChip key={row.field} label={row.name} role={row.label} disabled={disabled}
        onEdit={()=>setEditor({role:OFFICE_ROLES.find(role=>role.field===row.field),id:row.id})}
        onRemove={()=>setRemove(row)}/>)}
    </div>
    {editor && <TeamDialog eyebrow="ACTIVE PROJECT" picker
      title={editor.id===null?'Add Riggs person':'Edit Riggs person'} onClose={()=>setEditor(null)}
      actions={<><button type="button" className="secondary-button" onClick={()=>setEditor(null)}>Cancel</button>
        <button type="button" className="primary-button" disabled={editor.id===null || !directory[editor.role.role].some(person=>person.id===String(editor.id))}
          onClick={()=>commit(editor.role,editor.id)}>Add to changes</button></>}>
      <div className="setup-team-grid setup-team-riggs-grid">
        <label>Role<select value={editor.role.field} onChange={event=>setEditor({role:OFFICE_ROLES.find(role=>role.field===event.target.value),id:null})}>
          {OFFICE_ROLES.map(role=><option key={role.field} value={role.field}>{role.label}</option>)}</select></label>
        <ProjectSetupIdentityPicker label="Riggs person" value={editor.id} options={directory[editor.role.role]}
          disabled={disabled} onChange={id=>setEditor(current=>({...current,id}))}/>
      </div>
    </TeamDialog>}
    {remove && <TeamDialog eyebrow="ACTIVE PROJECT" title="Remove Riggs team assignment?"
      description={`Remove ${remove.name} from ${remove.label}?`}
      onClose={()=>setRemove(null)} actions={<>
        <button type="button" className="secondary-button" onClick={()=>setRemove(null)}>Cancel</button>
        <button type="button" className="setup-team-danger-button" onClick={()=>{onChange(remove.field,'');setRemove(null);}}>Confirm removal</button>
      </>}><p className="setup-team-removal-note">This changes the project draft only. Use Save Changes to persist it.</p></TeamDialog>}
    {replace && <TeamDialog eyebrow="ACTIVE PROJECT" title="Replace Riggs team assignment?"
      description={`Replace the current ${replace.role.label}?`}
      onClose={()=>setReplace(null)} actions={<>
        <button type="button" className="secondary-button" onClick={()=>setReplace(null)}>Cancel</button>
        <button type="button" className="primary-button" onClick={()=>{
          onChange(replace.role.field,String(replace.id));setReplace(null);
        }}>Confirm replacement</button>
      </>}><p className="setup-team-removal-note">This uses the existing typed project editor, not the field staffing or Additional Members API.</p></TeamDialog>}
  </div>;
}

// One search control, not the old selected-chip + separate search bar. Active
// Project's typed writer still saves the company NAME. Never infer or replace
// an existing name without an explicit directory selection.
export function ActiveProjectGcPicker({value='',options=[],loading=false,error=null,disabled=false,onChange,onRetry,previewing=false}) {
  const root=useRef(null);
  const listId=useId();
  const [activeIndex,setActiveIndex]=useState(0);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const directory=useMemo(()=>canonicalDirectory(options),[options]);
  const matches=useMemo(()=>directory.items.filter(item=>nameKey([item.name,item.cityStateZip].join(' ')).includes(nameKey(query))).slice(0,65),[directory,query]);
  useEffect(()=>{
    const close=event=>{if(!root.current?.contains(event.target)) setOpen(false);};
    document.addEventListener('pointerdown',close);return ()=>document.removeEventListener('pointerdown',close);
  },[]);
  return <div className="active-project-gc-combobox" ref={root}>
    <label className="bid-edit-field"><span>General Contractor</span>
      <input type="search" role="combobox" aria-label="Search General Contractor" aria-expanded={open}
        value={open?query:(value||'')} disabled={disabled} aria-controls={listId}
        aria-activedescendant={open&&matches[activeIndex]?`${listId}-option-${activeIndex}`:undefined}
        placeholder="Search general contractors…"
        onFocus={()=>{setOpen(true);setQuery('');}}
        onChange={event=>{setOpen(true);setQuery(event.target.value);setActiveIndex(0);}}
        onKeyDown={event=>{
          if(event.key==='Escape'){event.stopPropagation();setOpen(false);}
          if(event.key==='ArrowDown'){event.preventDefault();setActiveIndex(i=>Math.min(matches.length-1,i+1));}
          if(event.key==='ArrowUp'){event.preventDefault();setActiveIndex(i=>Math.max(0,i-1));}
          if(event.key==='Enter' && open && matches[activeIndex] && !loading && !error){event.preventDefault();onChange(matches[activeIndex].name);setOpen(false);}
        }}/>
    </label>
    {open && !disabled && <div role="listbox" id={listId} className="active-project-gc-options" aria-label="Verified contractor choices">
      {loading && <p>Loading contractors…</p>}
      {error && <p role="alert">Directory unavailable. Saved GC unchanged. <button type="button" onClick={onRetry}>Retry</button></p>}
      {!loading && !error && matches.map((row,index)=><button key={row.id} id={`${listId}-option-${index}`} type="button" role="option" aria-selected={index===activeIndex}
        onMouseEnter={()=>setActiveIndex(index)} onClick={()=>{onChange(row.name);setOpen(false);}}><strong>{row.name}</strong><small>{row.cityStateZip||row.streetAddress||'Verified directory company'}</small></button>)}
      {!loading && !error && !matches.length && <p>No matching verified GC.</p>}
    </div>}
    {value && !previewing && <small>Saved company: {value}</small>}
  </div>;
}

// Existing active jobs expose only the old GC PM text writer. The additional
// GC contact roster is not linked to real JobListIDs yet: do not pretend an
// edit here writes the draft roster or the Cognito superintendent field.
export function ActiveProjectGcTeam({pmName='',superName='',pmReference=null,onChange,disabled=false}) {
  const [editor,setEditor] = useState(false);
  const [remove,setRemove] = useState(false);
  const [next,setNext] = useState('');
  return <div className="setup-team-section" aria-label="General Contractor Team">
    <div className="setup-team-toolbar">
      <button type="button" className="secondary-button" disabled={disabled} onClick={()=>{setNext(pmName);setEditor(true);}}>
        {pmName? 'Edit GC PM' : '+ Add GC PM'}
      </button>
    </div>
    <div className="setup-team-chips">
      {pmName && <TeamChip label={pmName} role="GC Project Manager" disabled={disabled}
        onEdit={()=>{setNext(pmName);setEditor(true);}} onRemove={()=>setRemove(true)}/>}
      {superName && <div className="setup-team-readonly-chip" title="Read-only Cognito superintendent — no approved writer yet">
        <span className="setup-team-avatar" aria-hidden="true">GC</span>
        <span className="setup-team-chip-info"><strong>{superName}</strong><small>GC Superintendent · JIS</small></span>
      </div>}
      {!pmName && !superName && <p className="setup-team-empty">No GC contacts on the current project record.</p>}
    </div>
    <small className="setup-team-empty">Additional GC contact history is currently SQL-draft only; existing jobs remain source-controlled.</small>
    {editor && <TeamDialog eyebrow="ACTIVE PROJECT" title="GC Project Manager" onClose={()=>setEditor(false)}
      actions={<><button type="button" className="secondary-button" onClick={()=>setEditor(false)}>Cancel</button>
        <button type="button" className="primary-button" onClick={()=>{onChange('gcpm',next);setEditor(false);}}>Add to changes</button></>}>
      <div className="setup-team-grid active-gc-contact-modal-grid">
        <label>Full name<input value={next} maxLength={100} onChange={event=>setNext(event.target.value)}/></label>
        <label>Office phone<input type="tel" value={pmReference?.gcpmOffice||''} disabled readOnly/></label>
        <label>Mobile phone<input type="tel" value={pmReference?.gcpmMobile||''} disabled readOnly/></label>
        <label>Email<input type="email" value={pmReference?.gcpmEmail||''} disabled readOnly/></label>
        <label>Date added<input type="date" disabled readOnly value="" placeholder="Not yet tracked"/></label>
        <label>Date removed<input type="date" disabled readOnly value="" placeholder="Not yet tracked"/></label>
      </div>
      <small className="setup-team-removal-note">Only the GC PM name can be saved on existing jobs today. Phones, email and effective dates need the approved SQL contact-roster writer; current JIS values are displayed for reference.</small>
    </TeamDialog>}
    {remove && <TeamDialog eyebrow="ACTIVE PROJECT" title="Remove GC PM?"
      description="Clear the current GC Project Manager text on this Active Project?"
      onClose={()=>setRemove(false)} actions={<>
        <button type="button" className="secondary-button" onClick={()=>setRemove(false)}>Cancel</button>
        <button type="button" className="setup-team-danger-button" onClick={()=>{onChange('gcpm','');setRemove(false);}}>Confirm removal</button>
      </>}><p className="setup-team-removal-note">This does not delete the GC's Form 140 record or alter SQL draft contact history.</p></TeamDialog>}
  </div>;
}
