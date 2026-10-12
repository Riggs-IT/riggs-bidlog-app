// The backend is authoritative for idle timeout. /api/auth/me supplies
// sessionIdleTimeoutSeconds from SESSION_IDLE_TIMEOUT_SECONDS.
export const DEFAULT_SESSION_IDLE_TIMEOUT_SECONDS = 3600;

export function resolveSessionIdleTimeoutMs(user) {
  const seconds = user?.sessionIdleTimeoutSeconds;
  if (typeof seconds === 'number' && Number.isSafeInteger(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  // Safe compatibility fallback for an older backend during rollout.
  return DEFAULT_SESSION_IDLE_TIMEOUT_SECONDS * 1000;
}
