import {useEffect, useId, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import ProjectSetupIdentityPicker from './ProjectSetupIdentityPicker.jsx';
import {createSetupOperationId} from './projectSetupAuthoring.mjs';

const GC_ROLES=[{value:'PM',label:'GC Project Manager'},{value:'SUPERINTENDENT',label:'GC Superintendent'}];
const RIGGS_ROLES=[
  {field:'pmITUserId',label:'Project Manager',directory:'itUsers',multiple:false},
  {field:'apmITUserId',label:'Assistant PM',directory:'itUsers',multiple:false},
  {field:'peITUserId',label:'Project Engineer',directory:'itUsers',multiple:false},
  {field:'superintendentEid',label:'Superintendent',directory:'employees',multiple:false},
  {field:'foremanEids',label:'Foreman',directory:'employees',multiple:true},
  {field:'additionalMemberITUserIds',label:'Additional Member',directory:'itUsers',multiple:true},
  {field:'surveyorITUserId',label:'Surveyor',directory:'itUsers',multiple:false},
];
const blankContact=()=>({memberId:createSetupOperationId(),role:'PM',name:'',office:'',mobile:'',email:'',
  dateAdded:'',dateRemoved:null,isPrimary:false});

function localDate() {
  const now=new Date();const adjusted=new Date(now.getTime()-now.getTimezoneOffset()*60000);
  return adjusted.toISOString().slice(0,10);
}
function labelFor(roles,code) {return roles.find(role=>role.value===code)?.label||code;}

// A true modal is portaled outside the parent disabled fieldset. React Escape
// capture stops the existing FloatingEditorShell's window Escape handler.
export function TeamDialog({title,description,onClose,children,actions,eyebrow="PROJECT SETUP",picker=false}) {
  const titleId=useId();const surface=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement;
    surface.current?.querySelector('input,select,button')?.focus();
    return ()=>previous?.focus?.();
  },[]);
  return createPortal(<div className="setup-team-overlay" role="presentation"
    onMouseDown={event=>{if(event.target===event.currentTarget) onClose();}}
    onKeyDownCapture={event=>{
      if(event.key==='Escape') {event.preventDefault();event.stopPropagation();onClose();}
      else if(event.key==='Tab') {
        const buttons=[...surface.current.querySelectorAll('input:not(:disabled),select:not(:disabled),button:not(:disabled)')];
        if (!buttons.length) return;
        const first=buttons[0],last=buttons.at(-1);
        if(event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
      }
    }}>
    <section className={`setup-team-modal${picker?" setup-team-modal--picker":""}`} ref={surface} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><div><span className="section-kicker">{eyebrow}</span><h3 id={titleId}>{title}</h3>
        {description && <p>{description}</p>}</div>
        <button type="button" aria-label="Close editor" className="setup-team-modal-close" onClick={onClose}>×</button>
      </header>
      <div className="setup-team-modal-body">{children}</div>
      <footer>{actions}</footer>
    </section>
  </div>,document.body);
}

export function TeamChip({label,role,primary=false,added,removed,onEdit,onRemove,disabled=false,archived=false}) {
  return <div className={`setup-team-chip${archived?' archived':''}`} role="group" aria-label={`${label}, ${role}`}>
    <button type="button" title={archived?'View history':'Click to edit'}
      aria-label={`${archived?'View historical':'Edit'} ${label} (${role})`} disabled={disabled}
      onClick={onEdit} onKeyDown={event=>{if(event.key==='Enter' || event.key===' ') {event.preventDefault();onEdit();}}}>
      <span className="setup-team-avatar" aria-hidden="true">{(label.trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('')||'?').toUpperCase()}</span>
      <span className="setup-team-chip-info"><strong>{label}</strong><small>{role}{primary?' · Primary':''}</small></span>
      {added && <span className="setup-team-dates" title={`Added ${added}${removed?`; removed ${removed}`:''}`}>
        {removed?'Removed':'Since'} {removed||added}</span>}
    </button>
    {!archived && onRemove && <button type="button" className="setup-team-remove" disabled={disabled}
      aria-label={`Remove ${label} from ${role}`} title="Remove person" onClick={onRemove}>×</button>}
  </div>;
}

export function GcProjectTeam({value={},savedValue={},onChange,disabled=false}) {
  const members=Array.isArray(value.teamMembers)?value.teamMembers:[];
  const savedIds=new Set((savedValue.teamMembers||[]).map(item=>item.memberId));
  const [editor,setEditor]=useState(null);
  const [remove,setRemove]=useState(null);
  const [removeDate,setRemoveDate]=useState(localDate);
  const [showHistory,setShowHistory]=useState(false);
  const [warning,setWarning]=useState('');
  const active=members.filter(item=>item.dateRemoved==null);
  const archived=members.filter(item=>item.dateRemoved!=null);
  const legacy=GC_ROLES.flatMap(role=>{
    const source=role.value==='PM'?value.pm:value.superintendent;
    const roleAlreadyListed=members.some(item=>item.role===role.value);
    return !roleAlreadyListed && source && ['name','office','mobile','email'].some(key=>source[key]?.trim?.())
      ? [{role:role.value,contact:source}] : [];
  });
  function openNew(role='PM',source=null) {
    if(disabled) return;
    setWarning('');
    const item={...blankContact(),role,...(source||{}),dateAdded:source?'':localDate(),isPrimary:Boolean(source)};
    setEditor({item,legacy:Boolean(source)});
  }
  function saveEntry() {
    if(!editor) return;
    const item=editor.item;
    if(!item.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(item.dateAdded)) {
      setWarning('Enter a name and the actual effective date added.');return;
    }
    if(!editor.legacy && legacy.some(row=>row.role===item.role)) {
      setWarning('Import the existing primary for this role before adding another person.');return;
    }
    let next=members.map(row=>row.memberId===item.memberId?{...item}:row);
    if(!next.some(row=>row.memberId===item.memberId)) next=[...next,item];
    if(item.isPrimary) next=next.map(row=>row.memberId!==item.memberId && row.role===item.role
      ? {...row,isPrimary:false}:row);
    onChange(next);setEditor(null);setWarning('');
  }
  function removeEntry() {
    if(!remove) return;
    if(removeDate < remove.dateAdded) {setWarning('Removal date cannot precede date added.');return;}
    // Unsaved, never-committed contacts do not become fictional history rows.
    const next=savedIds.has(remove.memberId)
      ? members.map(row=>row.memberId===remove.memberId?{...row,dateRemoved:removeDate,isPrimary:false}:row)
      : members.filter(row=>row.memberId!==remove.memberId);
    onChange(next);setRemove(null);setWarning('');
  }
  return <div className="setup-team-section" aria-label="GC Project Team">
    <div className="setup-team-toolbar"><div><h4>GC contacts</h4>
      </div>
      <button type="button" className="secondary-button" disabled={disabled||members.length>=50} onClick={()=>openNew()}>+ Add GC contact</button></div>
    {!!legacy.length && <div className="setup-team-legacy" role="status">
      <strong>Existing primary contacts</strong><span>Import a contact before adding another person in the same role; select its actual start date.</span>
      {legacy.map(row=><button key={row.role} type="button" className="secondary-button" disabled={disabled}
        onClick={()=>openNew(row.role,row.contact)}>Import {labelFor(GC_ROLES,row.role)}: {row.contact.name||'Unnamed'}</button>)}
    </div>}
    <div className="setup-team-chips">
      {!active.length && !legacy.length && <p className="setup-team-empty">No GC project contacts added.</p>}
      {active.map(row=><TeamChip key={row.memberId} label={row.name} role={labelFor(GC_ROLES,row.role)}
        primary={row.isPrimary} added={row.dateAdded} disabled={disabled}
        onEdit={()=>{setWarning('');setEditor({item:{...row},legacy:false});}}
        onRemove={()=>{setRemove(row);setRemoveDate(localDate());setWarning('');}}/>)}
    </div>
    {!!archived.length && <details open={showHistory} onToggle={event=>setShowHistory(event.currentTarget.open)}
      className="setup-team-history"><summary>Former GC contacts ({archived.length})</summary>
      <div className="setup-team-chips">{archived.map(row=><TeamChip key={row.memberId} label={row.name}
        role={labelFor(GC_ROLES,row.role)} added={row.dateAdded} removed={row.dateRemoved}
        archived disabled={disabled} onEdit={()=>setEditor({item:{...row},readOnly:true})}/>)}</div></details>}
    {warning && <div className="bid-edit-message error" role="alert">{warning}</div>}
    {editor && <TeamDialog title={editor.readOnly?'Previous GC contact':editor.legacy?'Import GC contact':savedIds.has(editor.item.memberId)?'Edit GC contact':'Add GC contact'}
      description={editor.legacy?'Set the actual project assignment date; it cannot be inferred from the old single-contact field.':
        'Form 19 will eventually receive only the explicitly selected primary.'}
      onClose={()=>{setEditor(null);setWarning('');}}
      actions={<><button type="button" className="secondary-button" onClick={()=>{setEditor(null);setWarning('');}}>Cancel</button>
        {!editor.readOnly && <button type="button" className="primary-button" onClick={saveEntry}>Add to draft</button>}</>}>
      <div className="setup-team-grid">
        <label>Role<select value={editor.item.role} disabled={editor.readOnly||savedIds.has(editor.item.memberId)||editor.legacy}
          onChange={event=>setEditor(v=>({...v,item:{...v.item,role:event.target.value,isPrimary:false}}))}>
          {GC_ROLES.map(role=><option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
        {['name','office','mobile','email'].map(key=><label key={key}>{key==='name'?'Full name':key==='office'?'Office phone':key==='mobile'?'Mobile phone':'Email'}
          <input type={key==='email'?'email':key==='office'||key==='mobile'?'tel':'text'} maxLength={1000}
            value={editor.item[key]||''} disabled={editor.readOnly} onChange={event=>setEditor(v=>({...v,item:{...v.item,[key]:event.target.value}}))}/></label>)}
        <label>Effective date added<input type="date" value={editor.item.dateAdded||''}
          disabled={editor.readOnly||savedIds.has(editor.item.memberId)}
          onChange={event=>setEditor(v=>({...v,item:{...v.item,dateAdded:event.target.value}}))}/></label>
        {editor.item.dateRemoved && <label>Effective date removed<input type="date" value={editor.item.dateRemoved} disabled/></label>}
        <label className="setup-team-check"><input type="checkbox" checked={Boolean(editor.item.isPrimary)}
          disabled={editor.readOnly || !!editor.item.dateRemoved} onChange={event=>setEditor(v=>({...v,item:{...v.item,isPrimary:event.target.checked}}))}/>
          Designate as primary {editor.item.role==='PM'?'GC PM':'GC Superintendent'}</label>
      </div>
      {warning && <p role="alert" className="bid-edit-message error">{warning}</p>}
      <small>Changes appear as bubbles immediately. Use Save draft in Project Setup to persist them to SQL.</small>
    </TeamDialog>}
    {remove && <TeamDialog title="Remove GC contact?" description={`Remove ${remove.name} from this project's active GC team? Contact history is preserved.`}
      onClose={()=>{setRemove(null);setWarning('');}}
      actions={<><button type="button" className="secondary-button" onClick={()=>{setRemove(null);setWarning('');}}>Cancel</button>
        <button type="button" className="setup-team-danger-button" onClick={removeEntry}>Confirm removal</button></>}>
      <label className="setup-team-remove-label">Effective date removed
        <input type="date" min={remove.dateAdded} value={removeDate} onChange={event=>setRemoveDate(event.target.value)}/></label>
      <p className="setup-team-removal-note">The person will remain in historical contacts. If they were primary, the role stays unassigned until you select another primary.</p>
      {warning && <p role="alert" className="bid-edit-message error">{warning}</p>}
    </TeamDialog>}
  </div>;
}

export function RiggsProjectTeam({values,directory,onChange,disabled=false}) {
  const [editor,setEditor]=useState(null);const [remove,setRemove]=useState(null);
  const [replace,setReplace]=useState(null);
  const rows=useMemo(()=>RIGGS_ROLES.flatMap(role=>{
    const value=values?.[role.field];
    const chosen=role.multiple?(Array.isArray(value)?value:[]):(value==null?[]:[value]);
    const choices=directory?.[role.directory]||[];
    return chosen.map(id=>({role,id,label:choices.find(p=>String(p.id)===String(id))?.label||`Unverified ID ${id}`}));
  }),[values,directory]);
  function assign(role,id,originalId=null) {
    if(id==null) return;
    const old=values?.[role.field];
    if(role.multiple) {
      const items=Array.isArray(old)?old:[];
      if (originalId!=null && String(originalId)!==String(id)) {
        if(items.includes(id)) {setEditor(null);return;}
        setReplace({role,id,prior:originalId});setEditor(null);return;
      }
      if(!items.includes(id)) onChange(role.field,[...items,id]);
    } else if(old!=null && old!==id) {
      setReplace({role,id,prior:old});setEditor(null);return;
    } else onChange(role.field,id);
    setEditor(null);
  }
  const removePerson=()=>{
    if(!remove) return;
    const {role,id}=remove;
    onChange(role.field,role.multiple?(values?.[role.field]||[]).filter(existing=>String(existing)!==String(id)):null);
    setRemove(null);
  };
  return <div className="setup-team-section" aria-label="Riggs Project Team">
    <div className="setup-team-toolbar"><div><h4>Team assignments</h4>
      </div>
      <button className="secondary-button" type="button" disabled={disabled||!directory} onClick={()=>setEditor({role:RIGGS_ROLES[0],id:null})}>+ Add team member</button></div>
    <div className="setup-team-chips">{!rows.length && <p className="setup-team-empty">No Riggs team assignments selected.</p>}
      {rows.map(row=><TeamChip key={`${row.role.field}-${row.id}`} label={row.label} role={row.role.label} disabled={disabled}
        onEdit={()=>setEditor({role:row.role,id:row.id,originalId:row.id})} onRemove={()=>setRemove(row)}/>)}</div>
    {!directory && <small>Verified directory unavailable. Saved identities remain unchanged.</small>}
    {editor && <TeamDialog title={editor.id!=null?'Review Riggs team member':'Add Riggs team member'}
      picker onClose={()=>setEditor(null)}
      actions={<><button type="button" className="secondary-button" onClick={()=>setEditor(null)}>Cancel</button>
        <button type="button" className="primary-button" disabled={editor.id==null} onClick={()=>{
          if(editor.originalId===editor.id) {setEditor(null);return;}
          assign(editor.role,editor.id,editor.originalId);
        }}>{editor.originalId!=null?'Update assignment':'Add to draft'}</button></>}>
      <div className="setup-team-grid setup-team-riggs-grid">
        <label>Team role<select value={editor.role.field} disabled={editor.id!=null}
          onChange={event=>setEditor({role:RIGGS_ROLES.find(r=>r.field===event.target.value),id:null})}>
          {RIGGS_ROLES.map(role=><option key={role.field} value={role.field}>{role.label}</option>)}</select></label>
        <ProjectSetupIdentityPicker label="Verified Riggs person" value={editor.id}
          options={directory?.[editor.role.directory]||[]} disabled={!directory}
          onChange={id=>setEditor(v=>({...v,id}))}/>
      </div>
    </TeamDialog>}
    {remove && <TeamDialog title="Remove Riggs team assignment?"
      description={`Remove ${remove.label} from the ${remove.role.label} role? This will affect only the SQL draft, not a live job.`}
      onClose={()=>setRemove(null)}
      actions={<><button type="button" className="secondary-button" onClick={()=>setRemove(null)}>Cancel</button>
        <button type="button" className="setup-team-danger-button" onClick={removePerson}>Confirm removal</button></>}>
      <p className="setup-team-removal-note">The draft's saved revision/operation history will retain the change. Live staffing is not touched.</p>
    </TeamDialog>}
    {replace && <TeamDialog title="Replace Riggs team assignment?"
      description={`Replace the assigned ${replace.role.label}? This does not write to Cognito or change live staffing.`}
      onClose={()=>setReplace(null)}
      actions={<><button type="button" className="secondary-button" onClick={()=>setReplace(null)}>Cancel</button>
        <button type="button" className="primary-button" onClick={()=>{
          const current=values?.[replace.role.field];
          onChange(replace.role.field,replace.role.multiple
            ? (Array.isArray(current)?current:[]).map(id=>String(id)===String(replace.prior)?replace.id:id)
            : replace.id);
          setReplace(null);setEditor(null);
        }}>Replace assignment</button></>}>
      <p className="setup-team-removal-note">No employee directory ID is changed or inferred from a display name.</p>
    </TeamDialog>}
  </div>;
}
