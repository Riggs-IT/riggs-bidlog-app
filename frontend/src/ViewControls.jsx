import './ViewControls.css';
export function RefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" /></svg>;
}
export function RefreshButton({onClick, busy=false, disabled=false, label='Refresh', title, className=''}) {
  return <button type="button" className={`refresh-icon-button ${busy ? 'is-refreshing' : ''} ${className}`}
    onClick={onClick} disabled={disabled || busy} aria-label={label} aria-busy={busy}
    title={title || label}><RefreshIcon /></button>;
}
export function InfoButton({onClick, expanded=false, label='More information', className=''}) {
  return <button type="button" className={`info-icon-button ${className}`}
    onClick={onClick} aria-label={label} aria-expanded={expanded} title={label}>
    <span aria-hidden="true">i</span>
  </button>;
}
export function ShowControls({baseline, onBaseline, running, onRunning}) {
  return <div className="show-controls" role="group" aria-label="Display options">
    <span>Show:</span>
    {onBaseline && <button type="button" className={baseline ? 'active' : ''}
      aria-label="Compare with System Baseline" aria-pressed={baseline} onClick={() => onBaseline(!baseline)}>Baseline</button>}
    {onRunning && <button type="button" className={running ? 'active' : ''}
      aria-label="Show running totals" aria-pressed={running} onClick={() => onRunning(!running)}>Running totals</button>}
  </div>;
}

export function FilterToggleGroup({label, value, onChange, options, allValue='__ALL__', className=''}) {
  const visible = (options || []).filter(option => option?.available !== false);
  if (!visible.length) return null;
  return <div className={`filter-toggle-group ${className}`.trim()}>
    <span className="filter-toggle-label">{label}</span>
    <div className="filter-toggle-buttons" role="group" aria-label={label}>
      {visible.map(option => {
        const active = value === option.value;
        return <button key={option.value} type="button" className={active ? 'active' : ''}
          aria-pressed={active} onClick={() => onChange(active ? allValue : option.value)}>
          {option.label}
        </button>;
      })}
    </div>
  </div>;
}
