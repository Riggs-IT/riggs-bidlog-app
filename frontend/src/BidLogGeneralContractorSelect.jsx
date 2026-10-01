import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { canonicalDirectory, nameKey, selectedRecords, selectContractor } from './gcReference.js';

const EMPTY = Object.freeze([]);

/** IDs identify choices within the picker. The existing API still persists names. */
export default function BidLogGeneralContractorSelect({ value = EMPTY, options = EMPTY, loading = false,
  error = null, disabled = false, multiple = true, onChange, onRetry, onOpen }) {
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [limit, setLimit] = useState(60);
  const [chosenIds, setChosenIds] = useState({});
  const directory = useMemo(() => canonicalDirectory(options), [options]);
  const selected = useMemo(() => selectedRecords(value, directory, chosenIds), [value, directory, chosenIds]);
  const selectedIds = new Set(selected.flatMap(entry => entry.record ? [entry.record.id] : []));
  const matches = useMemo(() => {
    const query = nameKey(search);
    return query ? directory.items.filter(option => option.searchText.includes(query)) : directory.items;
  }, [directory, search]);
  const visible = matches.slice(0, limit);
  const unavailable = loading || Boolean(error);

  useEffect(() => {
    const outside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  useEffect(() => { setActiveIndex(-1); setLimit(60); }, [search, options]);
  useEffect(() => {
    // Do not keep unbounded selections or resurrect a cleared ID on a new form.
    setChosenIds(current => {
      const entries = Object.entries(current).filter(([key, id]) => selected.some(entry => nameKey(entry.name) === key));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [value, directory]);

  function openPicker() {
    if (disabled) return;
    if (!open) onOpen?.();
    setOpen(true);
  }
  function removeName(name) {
    const key = nameKey(name);
    setChosenIds(current => Object.fromEntries(Object.entries(current).filter(([k]) => k !== key)));
    onChange(selected.filter(entry => nameKey(entry.name) !== key).map(entry => entry.name));
  }
  function toggle(option) {
    if (disabled || unavailable) return;
    const next = selectContractor(value, option.id, directory, multiple, chosenIds);
    setChosenIds(next.chosenIds);
    onChange(next.value);
    setSearch('');
    if (!multiple) setOpen(false);
    else searchRef.current?.focus();
  }
  function keyDown(event) {
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
    else if (event.key === 'Tab') setOpen(false);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); openPicker();
      if (!unavailable && visible.length) setActiveIndex(index =>
        (index + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length);
    } else if (event.key === 'Enter') {
      // Typing a name alone never creates a new contractor or submits a parent form.
      event.preventDefault();
      if (open && !unavailable && activeIndex >= 0 && visible[activeIndex]) toggle(visible[activeIndex]);
    }
  }
  return (
    <div ref={rootRef} className={`bid-gc-picker${open ? ' open' : ''}${disabled ? ' disabled' : ''}`}>
      <div className="bid-gc-picker-control" onClick={openPicker}>
        {selected.length > 0 && <div className="bid-gc-selected-list">
          {selected.map(entry => <span key={entry.record ? `gc:${entry.record.id}` : `raw:${nameKey(entry.name)}`}
            className={`bid-gc-selected-chip${entry.currentOnly || entry.ambiguous ? ' current-only' : ''}`}
            title={entry.ambiguous ? 'Saved name matches multiple directory records; identity is not guessed.'
              : entry.currentOnly ? 'Existing value is not in the active General Contractor directory; retained until you change it.'
              : [entry.record.name, entry.record.cityStateZip, entry.record.streetAddress].filter(Boolean).join(' · ')}>
            <span>{entry.record?.name || entry.name}{entry.ambiguous ? ' · record unclear' : entry.currentOnly ? ' · existing value' : ''}</span>
            {!disabled && <button type="button" aria-label={`Remove ${entry.name}`} onClick={event => { event.stopPropagation(); removeName(entry.name); }}>×</button>}
          </span>)}
        </div>}
        <div className="bid-gc-search-row">
          <span className="bid-gc-search-icon" aria-hidden="true">⌕</span>
          <input ref={searchRef} type="search" role="combobox" aria-label="Search General Contractors"
            aria-expanded={open && !disabled} aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={open && !unavailable && visible[activeIndex] ? `${listId}-${visible[activeIndex].id}` : undefined}
            value={search} disabled={disabled} placeholder={selected.length ? multiple ? 'Add another GC…' : 'Search or change GC…' : 'Search General Contractors…'}
            onFocus={openPicker} onChange={event => { setSearch(event.target.value); openPicker(); }} onKeyDown={keyDown}/>
          {selected.length > 0 && !disabled && <button type="button" className="bid-gc-clear-button" onClick={event => { event.stopPropagation(); setChosenIds({}); onChange([]); }}>Clear</button>}
          <button type="button" disabled={disabled} className="bid-gc-chevron bid-gc-chevron-button" aria-label={open ? 'Close contractor picker' : 'Open contractor picker'}
            onClick={event => { event.stopPropagation(); if (open) setOpen(false); else openPicker(); }}>{open ? '⌃' : '⌄'}</button>
        </div>
      </div>
      {open && !disabled && <div className="bid-gc-picker-menu">
        <div className="bid-gc-picker-meta"><span>{loading ? 'Loading General Contractors…' : error ? 'Could not load General Contractors'
          : `${visible.length} of ${matches.length} ${search ? 'matching ' : ''}contractors`}</span><span>{selected.length} selected</span></div>
        {loading && <div className="bid-gc-picker-state">Loading General Contractors…</div>}
        {!loading && error && <div className="bid-gc-picker-state error"><span>{error}</span><button type="button" className="secondary-button" onClick={onRetry}>Retry</button></div>}
        {!unavailable && <>
          <div className="bid-gc-option-list" role="listbox" id={listId} aria-label="General Contractors" aria-multiselectable={multiple ? 'true' : undefined}>
            {visible.map((option, index) => <button type="button" role="option" id={`${listId}-${option.id}`} aria-selected={selectedIds.has(option.id)}
              key={option.id} className={`bid-gc-option${selectedIds.has(option.id) ? ' selected' : ''}${index === activeIndex ? ' keyboard-active' : ''}`}
              onClick={() => toggle(option)}>
              <span className="bid-gc-option-check" aria-hidden="true">{selectedIds.has(option.id) ? '✓' : ''}</span>
              <span className="bid-gc-option-copy"><strong>{option.name}</strong>
                <small>{[option.cityStateZip, option.streetAddress].filter(Boolean).join(' · ') || `Directory record #${option.id}`}</small>
                {(directory.byName.get(nameKey(option.name))?.length || 0) > 1 && <small>Record #{option.id} · bids currently save the company name only</small>}
              </span>
            </button>)}
          </div>
          {!visible.length && <div className="bid-gc-picker-state">No matching contractors. Add or correct the company in the General Contractor directory.</div>}
          {matches.length > limit && <button type="button" className="secondary-button" onClick={() => setLimit(n => n + 60)}>Show more contractors</button>}
        </>}
      </div>}
    </div>
  );
}
