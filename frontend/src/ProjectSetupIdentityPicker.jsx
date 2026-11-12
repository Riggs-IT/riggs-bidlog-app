import {useEffect, useId, useMemo, useRef, useState} from 'react';

// Display names are for search only. The draft receives verified directory IDs.
// Stale IDs remain visible and are never silently replaced by matching names.
export default function ProjectSetupIdentityPicker({label,value,options=[],onChange,multiple=false,
  disabled=false,unavailable=false,help=''}) {
  const inputId = useId();
  const listId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [open,setOpen] = useState(false);
  const [query,setQuery] = useState('');
  const [activeIndex,setActiveIndex] = useState(0);
  const chosen = multiple ? (Array.isArray(value) ? value : []) : (value == null ? [] : [value]);
  const keyed = useMemo(()=>new Map(options.map(item=>[String(item.id),item])),[options]);
  const selected = multiple ? null : keyed.get(String(value));
  const unknown = chosen.filter(id=>!keyed.has(String(id)));
  const canChoose = !disabled && !unavailable;
  const normalized = query.trim().toLocaleLowerCase();
  const matches = useMemo(()=>options.filter(item=>
    (!multiple || !chosen.some(id=>String(id)===String(item.id))) &&
    (!normalized || item.label.toLocaleLowerCase().includes(normalized) || String(item.id).includes(normalized))
  ).slice(0,80),[options,normalized,multiple,chosen.map(String).join('|')]);

  useEffect(()=>{
    if (!open) return undefined;
    const closeIfOutside = event => {
      if (!rootRef.current?.contains(event.target)) {setOpen(false);setQuery('');}
    };
    document.addEventListener('pointerdown',closeIfOutside);
    return ()=>document.removeEventListener('pointerdown',closeIfOutside);
  },[open]);
  useEffect(()=>{if (!canChoose) setOpen(false);},[canChoose]);

  const select = option => {
    if (!option || !canChoose) return;
    if (multiple) {
      if (chosen.length>=200 || chosen.some(id=>String(id)===String(option.id))) return;
      onChange([...chosen,option.id]);
      setQuery('');setActiveIndex(0);
      inputRef.current?.focus();
    } else {
      onChange(option.id);setOpen(false);setQuery('');
    }
  };
  const clear = () => {
    if (!canChoose) return;
    onChange(null);setOpen(false);setQuery('');
  };
  const shownValue = open ? query : multiple ? '' :
    (selected?.label || (value==null ? '' : `Unverified ID ${String(value)}`));

  return <div ref={rootRef} className="bid-edit-field project-setup-identity-picker"
    onBlurCapture={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) {setOpen(false);setQuery('');}
    }}>
    <label htmlFor={inputId}>{label}</label>
    {unavailable ? <div className="project-setup-identity-unavailable" role="status">
      {chosen.length === 0 ? 'Directory unavailable' : multiple
        ? `${chosen.length} saved selection(s) · directory unavailable`
        : `Saved identity: ${String(value)} · directory unavailable`}
    </div> : <>
      <div className="project-setup-combobox-wrap">
        <input ref={inputRef} id={inputId} type="text" role="combobox"
          aria-label={label} aria-haspopup="listbox" aria-autocomplete="list" aria-expanded={open}
          aria-controls={listId} aria-activedescendant={open && matches[activeIndex] ? `${listId}-item-${activeIndex}` : undefined}
          autoComplete="off" spellCheck={false} disabled={!canChoose}
          placeholder={multiple ? 'Search & add…' : 'Select…'}
          value={shownValue}
          onFocus={()=>{if (canChoose) {setOpen(true);setQuery('');setActiveIndex(0);}}}
          onClick={()=>{if(canChoose) setOpen(true);}}
          onChange={event=>{setQuery(event.target.value);setOpen(true);setActiveIndex(0);}}
          onKeyDown={event=>{
            if (!canChoose) return;
            if (event.key==='Escape') {event.preventDefault();setOpen(false);setQuery('');}
            else if (event.key==='ArrowDown') {event.preventDefault();setOpen(true);setActiveIndex(i=>Math.min(i+1,matches.length-1));}
            else if (event.key==='ArrowUp') {event.preventDefault();setActiveIndex(i=>Math.max(i-1,0));}
            else if (event.key==='Enter' && open && matches[activeIndex]) {event.preventDefault();select(matches[activeIndex]);}
          }}/>
        {!multiple && value!=null && canChoose && <button type="button" className="project-setup-combobox-clear"
          aria-label={`Clear ${label}`} title="Clear selection" onClick={clear}>×</button>}
        <span className="project-setup-combobox-caret" aria-hidden="true">⌄</span>
        {open && canChoose && <div id={listId} role="listbox" aria-label={`${label} options`}
          className="project-setup-combobox-list">
          {!matches.length && <div className="project-setup-combobox-empty">No matches</div>}
          {matches.map((item,index)=><button type="button" role="option"
            id={`${listId}-item-${index}`} aria-selected={activeIndex===index}
            key={String(item.id)} className={`project-setup-combobox-option${activeIndex===index?' active':''}`}
            onMouseDown={event=>event.preventDefault()}
            onMouseEnter={()=>setActiveIndex(index)} onClick={()=>select(item)}>{item.label}</button>)}
          {matches.length===80 && <div className="project-setup-combobox-empty">Type to narrow results</div>}
        </div>}
      </div>
      {multiple && chosen.length>0 && <div className="project-setup-identity-selected">
        {chosen.map(id=><span className="project-setup-identity-chip" key={String(id)}>
          <span>{keyed.get(String(id))?.label||`Unverified ID ${String(id)}`}</span>
          {canChoose && <button type="button" aria-label={`Remove ${label} ${String(id)}`}
            onClick={()=>onChange(chosen.filter(existing=>String(existing)!==String(id)))}>×</button>}
        </span>)}
      </div>}
      {unknown.length>0 && <small className="project-setup-identity-warning" role="status">
        {unknown.length} saved selection(s) need review.
      </small>}
    </>}
    {help && <small>{help}</small>}
  </div>;
}
