import {useEffect, useMemo, useRef, useState} from 'react';
import {createLatestRead, readOptions, watchVisibleReads} from './browserFreshness.js';
import {indexScheduleReview} from './scheduleReview.js';

// An independent read enables assigned PEs to receive a schedule notification
// even when they cannot access Projected Billings. It never grants edit rights.
export default function useScheduleReviewAttention(options) {
  const latest = useRef(options);
  latest.current = options;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scope = `${options.userKey ?? ''}:${Boolean(options.enabled)}`;
  const owner = useMemo(() => {
    const state = {alive: false};
    const usable = () => state.alive && latest.current.enabled && !latest.current.isEnding();
    const read = createLatestRead({
      read: config => latest.current.fetchJson(
        '/api/pm-forecast/schedule-review/attention', readOptions(config),
      ),
      publish: data => {
        if (!usable()) return false;
        indexScheduleReview(data); // validation includes per-job deduplication
        setItems(data);
        setError(null);
      },
      failed: err => {
        if (!usable()) return;
        setError(err.message || 'Unable to load schedule-review notifications.');
        latest.current.onSessionError(err);
      },
    });
    const load = async config => {
      if (!usable()) return;
      setLoading(true);
      try { return await read.load(config); }
      finally { if (usable() && !read.pending) setLoading(false); }
    };
    return {state, usable, read, load};
  }, [scope]);
  useEffect(() => {
    owner.state.alive = true;
    setItems([]);
    setLoading(false);
    setError(null);
    return () => {owner.state.alive = false; owner.read.cancel();};
  }, [owner]);
  useEffect(() => {
    if (!options.enabled) return undefined;
    return watchVisibleReads(owner.load, {
      allowed: owner.usable,
      lastHumanActivityAt: () => latest.current.lastHumanActivityAt?.(),
    });
  }, [owner, options.enabled]);
  return {items, loading, error,
    refresh: ({passive = false} = {}) => owner.load({replace: true, passive})};
}
