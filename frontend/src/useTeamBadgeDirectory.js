import {useEffect, useState} from 'react';

const EMPTY = [];

// One passive badge-only read per authenticated App mount. The Data API
// authorizes this via Bid Log view access, independently of billing access.
export default function useTeamBadgeDirectory(userKey, enabled) {
  const key = enabled && userKey != null ? String(userKey) : '';
  const [snapshot, setSnapshot] = useState({key: '', items: EMPTY});

  useEffect(() => {
    if (!key) {
      setSnapshot({key: '', items: EMPTY});
      return undefined;
    }

    const controller = new AbortController();
    async function load() {
      try {
        const response = await window.fetch('/api/bid-log/reference/pm-badges', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
          headers: {'X-Riggs-Passive-Read': '1'},
        });
        if (!response.ok) throw new Error(`Team badge read failed: ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload?.items)) throw new Error('Invalid team badge directory');
        if (!controller.signal.aborted) setSnapshot({key, items: payload.items});
      } catch (error) {
        if (!controller.signal.aborted) {
          // Supplemental decoration: a missing directory never blocks data.
          console.warn('Team badge directory unavailable', error);
          setSnapshot({key, items: EMPTY});
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [key]);

  return snapshot.key === key ? snapshot.items : EMPTY;
}
