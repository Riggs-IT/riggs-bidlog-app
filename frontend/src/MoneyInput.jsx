import {useLayoutEffect, useRef, useState} from 'react';
import {displayMoneyValue, moneyCaretPosition, parseMoneyDraft} from './moneyInput.js';

/**
 * Grouped dollar input. The parent continues to own an unformatted string;
 * no financial rounding, percentages, or API contracts change.
 */
export default function MoneyInput({value, onValueChange, className = '', ...props}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const pendingCaret = useRef(null);
  const raw = String(value ?? '');
  const formatted = displayMoneyValue(raw, editing);

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !inputRef.current) return;
    const nextCaret = pendingCaret.current;
    pendingCaret.current = null;
    if (document.activeElement === inputRef.current) {
      inputRef.current.setSelectionRange(nextCaret, nextCaret);
    }
  }, [formatted]);

  function handleChange(event) {
    const text = event.currentTarget.value;
    const next = parseMoneyDraft(text);
    if (next === null) return; // Ignore unsupported characters or >2 cent digits.
    const nextShown = displayMoneyValue(next, true);
    const desiredCaret = moneyCaretPosition(
      text, event.currentTarget.selectionStart ?? text.length, nextShown,
    );

    if (next === raw) {
      // Inserting a redundant comma doesn't change parent state.
      event.currentTarget.value = nextShown;
      event.currentTarget.setSelectionRange(desiredCaret, desiredCaret);
    } else {
      pendingCaret.current = desiredCaret;
      onValueChange(next);
    }
  }

  return (
    <input
      {...props}
      ref={inputRef}
      className={`money-input${className ? ` ${className}` : ''}`}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={formatted}
      onChange={handleChange}
      onFocus={() => setEditing(true)}
      onBlur={() => { pendingCaret.current = null; setEditing(false); }}
    />
  );
}
