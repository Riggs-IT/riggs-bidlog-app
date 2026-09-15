import { useEffect } from 'react';

import './BidLogLifecyclePolish.css';


export default function BidLogConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Continue',
  cancelLabel = 'Cancel',
  showCancel = true,
  danger = false,
  onConfirm,
  onCancel,
}) {
  useEffect(
    () => {
      if (!open) {
        return undefined;
      }

      function onKeyDown(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel?.();
        }
      }

      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    },
    [open, onCancel],
  );

  if (!open) {
    return null;
  }

  return (
    <div
      className="bid-confirm-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onCancel?.();
        }
      }}
    >
      <section
        className="bid-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bid-confirm-title"
      >
        <span className="section-kicker">BID LOG</span>
        <h2 id="bid-confirm-title">{title}</h2>
        <p>{message}</p>

        <div className="bid-confirm-actions">
          {showCancel && (
            <button
              type="button"
              className="bid-confirm-button bid-confirm-cancel"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          )}

          <button
            type="button"
            className={
              danger
                ? 'bid-confirm-button bid-confirm-danger'
                : 'bid-confirm-button bid-confirm-primary'
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
