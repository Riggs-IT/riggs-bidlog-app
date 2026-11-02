/**
 * Signal that a BUSINESS WRITE received a known application-login 401.
 * The existing App session-error handler owns the redirect to the existing
 * Microsoft sign-in / application-updated screen. No second sign-in UI.
 *
 * Delegated Microsoft editing-session failures are deliberately EXCLUDED:
 * Create/Edit/Merge/Outcome use their own in-editor reconnect popup.
 * This helper never retains payloads or retries a business write.
 */
export const APPLICATION_WRITE_AUTH_EXPIRED_EVENT = 'riggs:application-write-session-expired';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const APP_SESSION_CODES = new Set([
  'authentication_required',
  'invalid_session',
  'session_inactive_timeout',
  'application_updated',
]);

function errorCode(detail) {
  if (typeof detail === 'string') return detail;
  if (typeof detail?.code === 'string') return detail.code;
  if (typeof detail?.detail === 'string') return detail.detail;
  return '';
}

export function classifyWriteAuthFailure(status, detail, method = 'GET') {
  if (Number(status) !== 401 || !WRITE_METHODS.has(String(method).toUpperCase())) {
    return null;
  }
  return APP_SESSION_CODES.has(errorCode(detail)) ? 'application' : null;
}

export function notifyWriteAuthFailure(status, detail, method) {
  const mode = classifyWriteAuthFailure(status, detail, method);
  if (mode === 'application'
    && typeof window !== 'undefined'
    && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(APPLICATION_WRITE_AUTH_EXPIRED_EVENT, {
      detail: {reason: errorCode(detail) === 'application_updated'
        ? 'application_updated' : 'authentication_required'},
    }));
  }
  return mode;
}
