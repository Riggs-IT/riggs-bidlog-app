import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {
  MONTH_ABBREVIATIONS,
  MONTH_NAMES,
  acceptedBillingMonth,
  billingMonthForYearAndIndex,
  displayBillingMonth,
  monthPopoverPosition,
  yearForBillingMonth,
} from './monthPickerModel.js';

function supportsNativeMonthPicker() {
  if (typeof document === 'undefined') return true;
  const probe = document.createElement('input');
  probe.type = 'month';
  return probe.type === 'month';
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

// Chromium/Edge keep their established native month picker and formatting.
// Firefox desktop, which presents type=month as plain text, gets a month-only
// popup. Neither path can write a partial or empty month to billing state.
export default function MonthInput({value, onChange, label}) {
  const [nativePicker] = useState(supportsNativeMonthPicker);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => yearForBillingMonth(value, new Date().getFullYear()));
  const [position, setPosition] = useState({left: 8, top: 8});
  const rootRef = useRef(null);
  const popupRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (open) (popupRef.current?.querySelector('button.selected') ||
      popupRef.current?.querySelector('button'))?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target) &&
          !popupRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function onScroll(event) {
      if (!popupRef.current?.contains(event.target)) setOpen(false);
    }
    function onFocusIn(event) {
      if (!rootRef.current?.contains(event.target) &&
          !popupRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);

  function selectMonth(monthIndex) {
    const selection = billingMonthForYearAndIndex(year, monthIndex);
    if (selection) onChange(selection);
    setOpen(false);
    triggerRef.current?.focus();
  }

  if (nativePicker) {
    return (
      <input type="month" value={value} aria-label={label}
        onChange={event => {
          const selection = acceptedBillingMonth(value, event.currentTarget.value);
          if (selection === value) {
            event.currentTarget.value = value; // native clear/incomplete input
          } else {
            onChange(selection);
          }
        }} />
    );
  }

  return (
    <div className="month-picker-fallback" ref={rootRef}>
      <button type="button" ref={triggerRef} className="month-picker-trigger"
        aria-label={`${label}: ${displayBillingMonth(value)}`}
        aria-haspopup="dialog" aria-expanded={open}
        onClick={() => {
          if (open) { setOpen(false); return; }
          setYear(yearForBillingMonth(value, new Date().getFullYear()));
          const rect = triggerRef.current.getBoundingClientRect();
          setPosition(monthPopoverPosition(rect, window.innerWidth, window.innerHeight));
          setOpen(true);
        }}>
        <span>{displayBillingMonth(value)}</span>
        <CalendarIcon />
      </button>
      {open && createPortal(
        <div ref={popupRef} className="month-picker-popup" role="dialog"
          aria-label={`Choose ${label}`} style={{left: position.left, top: position.top}}>
          <div className="month-picker-year-row">
            <button type="button" aria-label="Previous year" disabled={year <= 1000}
              onClick={() => setYear(current => Math.max(1000, current - 1))}>‹</button>
            <strong>{year}</strong>
            <button type="button" aria-label="Next year" disabled={year >= 9999}
              onClick={() => setYear(current => Math.min(9999, current + 1))}>›</button>
          </div>
          <div className="month-picker-grid">
            {MONTH_NAMES.map((name, index) => {
              const month = billingMonthForYearAndIndex(year, index);
              return (
                <button type="button" key={name} aria-label={`${name} ${year}`}
                  aria-pressed={month === value}
                  className={month === value ? 'selected' : undefined}
                  onClick={() => selectMonth(index)}>{MONTH_ABBREVIATIONS[index]}</button>
              );
            })}
          </div>
          <button type="button" className="month-picker-this-month" onClick={() => {
            const today = new Date();
            const month = billingMonthForYearAndIndex(today.getFullYear(), today.getMonth());
            if (month) onChange(month);
            setOpen(false);
            triggerRef.current?.focus();
          }}>This month</button>
        </div>,
        document.body,
      )}
    </div>
  );
}
