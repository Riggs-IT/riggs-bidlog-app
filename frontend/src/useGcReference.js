import { useEffect, useSyncExternalStore } from 'react';
import { gcReference } from './gcReference.js';

export function canReadGcReference(user) {
  const role = String(user?.appRole || '').trim().toUpperCase();
  // Retain the existing server's editor-only full-directory boundary.
  return ['ADMIN', 'OPERATIONS'].includes(role) && user?.capabilities?.canViewBidLog !== false;
}

export default function useGcReference(enabled = false) {
  const snapshot = useSyncExternalStore(gcReference.subscribe, gcReference.getSnapshot, gcReference.getSnapshot);
  useEffect(() => {
    if (enabled) void gcReference.load().catch(() => {});
  }, [enabled]);
  return { ...snapshot, refresh: () => gcReference.load({ force: true }).catch(() => {}) };
}
