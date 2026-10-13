import { useEffect, useMemo, useRef, useState } from 'react';
import { mergePrimaryPortfolio } from './primaryProjection.js';
import {indexPortfolioRebalance} from './portfolioBalance.js';
import {indexScheduleReview} from './scheduleReview.js';
import { createLatestRead, freshReadPath, readOptions, watchVisibleReads } from './browserFreshness.js';

// One owner publishes metadata, primary projections and historical-margin reads
// together. Existing baseline API contracts remain unchanged for other callers.
export default function useProjectedBillingsFreshness(options) {
  const latest = useRef(options);
  latest.current = options;
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const scope = `${options.userKey ?? ''}:${Boolean(options.enabled)}`;

  const reads = useMemo(() => {
    const state = { alive: false, busy: 0, failures: new Map() };
    const usable = () => state.alive && latest.current.enabled && !latest.current.isEnding();
    const request = (path, config) => latest.current.fetchJson(
      freshReadPath(path, config.fresh), readOptions(config),
    );
    function reportError(name, error) {
      if (!usable()) return;
      state.failures.set(name, error.message || 'Unable to refresh projected billings.');
      latest.current.onError([...state.failures.values()].join(' '));
      latest.current.onSessionError(error);
    }
    const current = createLatestRead({
      read: async config => {
        const [projects, monthly, primary] = await Promise.all([
          request('/api/projected-billings/current-projects', config),
          request('/api/projected-billings/current-projects/monthly', config),
          request('/api/projected-billings/current-projects/primary-projection', config),
        ]);
        if (!Array.isArray(projects) || !Array.isArray(monthly?.items)) {
          throw new Error('Project data returned an invalid response. Last loaded values were retained.');
        }
        return mergePrimaryPortfolio(projects, monthly, primary);
      },
      publish: data => {
        if (!usable()) return false;
        latest.current.onCurrent(data);
        state.failures.delete('current');
        latest.current.onError([...state.failures.values()].join(' ') || null);
        setLastUpdatedAt(Date.now());
      },
      failed: error => reportError('current', error),
    });
    const bids = createLatestRead({
      read: async config => {
        const data = await request('/api/projected-billings/active-bids/dashboard', config);
        if (!Array.isArray(data?.projects?.items) || !Array.isArray(data?.monthly)) {
          throw new Error('Bid data returned an invalid response. Last loaded values were retained.');
        }
        return data;
      },
      publish: data => {
        if (!usable()) return false;
        latest.current.onBids(data);
        state.failures.delete('bids');
        latest.current.onError([...state.failures.values()].join(' ') || null);
      },
      failed: error => reportError('bids', error),
    });
    // Independent of recipient notifications. A failure must not prevent
    // current-project and bid rows from loading, or claim that 0 need review.
    const portfolioBalance = createLatestRead({
      read: config => request('/api/pm-forecast/portfolio-balance', config),
      publish: data => {
        if (!usable()) return false;
        indexPortfolioRebalance(data); // validate before publication
        latest.current.onPortfolioBalance(data);
        state.failures.delete('portfolioBalance');
        latest.current.onError([...state.failures.values()].join(' ') || null);
      },
      failed: error => reportError('portfolioBalance', error),
    });
    const scheduleReview = createLatestRead({
      read: config => request('/api/pm-forecast/schedule-review', config),
      publish: data => {
        if (!usable()) return false;
        indexScheduleReview(data); // do not turn a bad response into an empty status
        latest.current.onScheduleReview(data);
        state.failures.delete('scheduleReview');
        latest.current.onError([...state.failures.values()].join(' ') || null);
      },
      failed: error => reportError('scheduleReview', error),
    });
    const attention = createLatestRead({
      read: config => latest.current.fetchJson('/api/pm-forecast/attention', readOptions(config)),
      publish: data => {
        if (!usable()) return false;
        if (!Array.isArray(data)) throw new Error('Notifications returned an invalid response.');
        latest.current.onAttention(data);
        latest.current.onAttentionError(null);
      },
      failed: error => {
        if (!usable()) return;
        latest.current.onAttentionError(error.message || 'Unable to load notifications.');
        latest.current.onSessionError(error);
      },
    });
    const batch = async config => {
      if (!usable()) return [];
      state.busy += 1;
      setRefreshing(true);
      try {
        const result = await Promise.all([current.load(config), bids.load(config), portfolioBalance.load(config), scheduleReview.load(config)]);
        if (usable() && current.lastSuccessAt !== null && bids.lastSuccessAt !== null) {
          latest.current.onReady();
        }
        return result;
      } finally {
        state.busy -= 1;
        if (usable() && state.busy === 0) setRefreshing(false);
      }
    };
    const attentionLoad = async config => {
      if (!usable()) return;
      latest.current.onAttentionLoading(true);
      try { return await attention.load(config); }
      finally { if (usable() && !attention.pending) latest.current.onAttentionLoading(false); }
    };
    return { state, usable, current, bids, portfolioBalance, scheduleReview, attention, batch, attentionLoad };
  }, [scope]);

  useEffect(() => {
    reads.state.alive = true;
    setLastUpdatedAt(null);
    setRefreshing(false);
    latest.current.onReset();
    if (options.enabled) {
      latest.current.onInitialLoading(true);
      void reads.batch({ passive: true }).finally(() => {
        if (reads.usable()) latest.current.onInitialLoading(false);
      });
    }
    return () => {
      reads.state.alive = false;
      reads.current.cancel(); reads.bids.cancel(); reads.portfolioBalance.cancel(); reads.scheduleReview.cancel(); reads.attention.cancel();
    };
  }, [reads]);

  useEffect(() => {
    if (!options.enabled || !options.active) return undefined;
    return watchVisibleReads(reads.batch, { allowed: reads.usable });
  }, [reads, options.enabled, options.active]);

  useEffect(() => {
    if (!options.enabled) return undefined;
    return watchVisibleReads(reads.attentionLoad, { allowed: reads.usable });
  }, [reads, options.enabled]);

  return {
    refreshing, lastUpdatedAt,
    refreshAll: () => reads.batch({ replace: true, fresh: true, passive: false }),
    refreshCurrent: () => reads.usable()
      ? Promise.all([
          reads.current.load({ replace: true, fresh: true, passive: true }),
          reads.portfolioBalance.load({ replace: true, fresh: true, passive: true }),
          reads.scheduleReview.load({ replace: true, fresh: true, passive: true }),
        ]) : Promise.resolve(),
    refreshBids: () => reads.usable()
      ? reads.bids.load({ replace: true, fresh: true, passive: true }) : Promise.resolve(),
    refreshAttention: ({ passive = true } = {}) => reads.attentionLoad({ replace: true, passive }),
  };
}
