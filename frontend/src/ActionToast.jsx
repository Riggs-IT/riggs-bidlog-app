import {
  useEffect,
} from 'react';

import {
  createPortal,
} from 'react-dom';


export default function ActionToast({
  message,
  type = 'success',
  actionLabel = null,
  onAction = null,
  onDismiss = null,
}) {
  useEffect(
    () => {
      if (!message) {
        return undefined;
      }

      const timeout = window.setTimeout(
        () => {
          onDismiss?.();
        },
        type === 'error'
          ? 7000
          : type === 'info'
            ? 10000
            : 4000,
      );

      return () => {
        window.clearTimeout(timeout);
      };
    },
    [
      message,
      type,
    ],
  );

  if (!message) {
    return null;
  }

  const error = type === 'error';
  const info = type === 'info';
  const tone = error
    ? 'error'
    : info
      ? 'info'
      : 'success';

  return createPortal(
    <div
      className={`action-toast ${tone}`}
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
    >
      <span
        className="action-toast-icon"
        aria-hidden="true"
      >
        {error ? '!' : info ? '!' : '✓'}
      </span>

      <div className="action-toast-content">
        <strong>
          {error ? 'Action failed' : info ? 'Attention' : 'Success'}
        </strong>

        <span>
          {message}
        </span>
      </div>

      {actionLabel && onAction && (
        <button
          type="button"
          className="action-toast-action"
          onClick={() => {
            onAction();
            onDismiss?.();
          }}
        >
          {actionLabel}
        </button>
      )}

      <button
        type="button"
        className="action-toast-close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss?.()}
      >
        ×
      </button>
    </div>,
    document.body,
  );
}
