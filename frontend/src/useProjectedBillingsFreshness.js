import { useEffect, useMemo, useRef, useState } from 'react';
import { mergePrimaryPortfolio } from './primaryProjection.js';
import {indexPortfolioRebalance} from './portfolioBalance.js';
import {indexScheduleReview} from './scheduleReview.js';
import { createLatestRead, freshReadPath, readOptions, watchVisibleReads } from './browserFreshness.js';
import {DATA_UPDATED_MESSAGE, DATA_UPDATING_MESSAGE, hasFreshPortfolioSnapshot, isRefreshCooldown} from './refreshFeedback.js';
import {createProgressiveDashboardReads} from './dashboardRefreshStages.js';
import {createReviewPairCoordinator} from './reviewPairCoordinator.js';

// One owner publishes metadata, primary projections and historical-margin reads
// together. Existing baseline API contracts remain unchanged for other callers.
export default function useProjectedBillingsFreshness(options) {
  const latest = useRef(options);
  latest.current = options;
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [cacheStatus, setCacheStatus] = useState(null);
  // Observational Stage 3G4 gate only: NEVER drive visible status from this.
  const [reviewPairEvidence, setReviewPairEvidence] = useState(null);
  const scope = `${options.userKey ?? ''}:${Boolean(options.enabled)}`;

  const reads = useMemo(() => {
    const state = { alive: false, busy: 0, failures: new Map(), manualRefreshInProgress: false };
    const usable = () => state.alive && latest.current.enabled && !latest.current.isEnding();
    const reviewPair = createReviewPairCoordinator({
      onChange: (evidence, acceptedPair) => {
        if (!usable()) return;
        setReviewPairEvidence(evidence);
        latest.current.onAcceptedReviewPair?.(acceptedPair);
      },
    });
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
      publish: (data, config) => {
        if (!usable()) return false;
        latest.current.onCurrent(data);
        if (config.reviewEpoch !== undefined) {
          reviewPair.offerCurrent(config.reviewEpoch, data);
        } else {
          reviewPair.invalidate('UNPAIRED_PRIMARY_READ');
        }
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
      publish: (data, config) => {
        if (!usable()) return false;
        indexPortfolioRebalance(data); // validate before publication
        latest.current.onPortfolioBalance(data);
        if (config.reviewEpoch !== undefined) {
          reviewPair.offerBalance(config.reviewEpoch, data);
        } else {
          reviewPair.invalidate('UNPAIRED_BALANCE_READ');
        }
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
    // Lightweight status metadata; no financial values or user data. A status
    // check must never block the working dashboard if its endpoint is down.
    const updateCacheStatus = async () => {
      if (!usable()) return;
      try {
        const result = await latest.current.fetchJson(
          '/api/projected-billings/dashboard-cache/status',
          readOptions({ passive: true }),
        );
        if (usable() && result?.datasets) {
          setCacheStatus(result);
          return result;
        }
        return null;
      } catch {
        if (usable()) setCacheStatus(null);
      }
    };

    const batch = async config => {
      if (!usable()) return [];
      const reviewEpoch = reviewPair.begin('BATCH');
      const cohortConfig = {...config, reviewEpoch};
      let pairedSuccess = false;
      // Passive 60-second polling must not turn on the visible Refresh spinner.
      // Existing rows stay interactive while background data arrives.
      const showSpinner = !config?.passive;
      if (showSpinner) {
        state.busy += 1;
        setRefreshing(true);
      }
      try {
        const result = await Promise.all([
          current.load(cohortConfig), bids.load(config),
          portfolioBalance.load(cohortConfig), scheduleReview.load(config),
          updateCacheStatus(),
        ]);
        pairedSuccess = result[0]?.status === 'published' && result[2]?.status === 'published';
        if (usable() && current.lastSuccessAt !== null && bids.lastSuccessAt !== null) {
          latest.current.onReady();
        }
        return result;
      } finally {
        reviewPair.finish(reviewEpoch, {successful: pairedSuccess});
        if (showSpinner) {
          state.busy -= 1;
          if (usable() && state.busy === 0) setRefreshing(false);
        }
      }
    };
    const attentionLoad = async config => {
      if (!usable()) return;
      latest.current.onAttentionLoading(true);
      try { return await attention.load(config); }
      finally { if (usable() && !attention.pending) latest.current.onAttentionLoading(false); }
    };
    const refreshAll = async () => {
      if (!usable() || state.manualRefreshInProgress) return;
      let reviewEpoch = null;
      state.manualRefreshInProgress = true;
      state.busy += 1;
      setRefreshing(true);
      latest.current.onRefreshNotice?.(null);
      try {
        // Exactly one POST asks the bridge to rebuild its shared snapshot.
        // Polling below only checks metadata, never launches SQL reads.
        const receipt = await latest.current.fetchJson(
          '/api/projected-billings/dashboard-cache/refresh',
          { method: 'POST', credentials: 'same-origin', cache: 'no-store' },
        );
        if (!receipt?.refreshId) throw new Error('Unable to refresh data. Please try again.');
        // Acknowledge immediately. Current values stay visible and editable;
        // the button only starts a background rebuild, not a blocking page load.
        latest.current.onRefreshNotice?.(DATA_UPDATING_MESSAGE);
        reviewEpoch = reviewPair.begin('MANUAL');
        const progressive = createProgressiveDashboardReads({
          current: config => current.load(config),
          bids: config => bids.load(config),
          portfolioBalance: config => portfolioBalance.load(config),
          scheduleReview: config => scheduleReview.load(config),
        }, receipt.refreshId, {reviewEpoch});
        let status = receipt;
        progressive.startReady(status);
        const deadline = Date.now() + 90_000;
        while (usable() && status.status === 'RUNNING' && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 900));
          if (!usable()) return;
          status = await latest.current.fetchJson(
            '/api/projected-billings/dashboard-cache/status',
            readOptions({ passive: true }),
          );
          // Update an independent dataset as soon as that refresh succeeds.
          // The four primary financial datasets are one consistency group:
          // do not mix new project amounts with old potential-bid amounts.
          progressive.startReady(status);
        }
        if (!usable()) return;
        if (status.status === 'RUNNING') {
          throw new Error('Data is still updating. Please try again.');
        }
        setCacheStatus(status);
        // No fresh=true SQL bypass and no duplicate final full batch. Each
        // stage fetched once, as soon as its snapshot became available.
        const results = await progressive.finish(status, updateCacheStatus);
        // A partially completed rebuild must not certify two cached reads,
        // even if their UUIDs happen to match; fail closed until COMPLETE.
        reviewPair.finish(reviewEpoch, {successful: status.status === 'COMPLETE'
          && results[0]?.status === 'published'
          && results[2]?.status === 'published'});
        if (current.lastSuccessAt !== null && bids.lastSuccessAt !== null) {
          latest.current.onReady();
        }
        if (status.status !== 'COMPLETE') {
          const error = new Error('Data could not be refreshed. Last available values are shown.');
          latest.current.onRefreshNotice?.(null);
          reportError('sharedRefresh', error);
        } else {
          state.failures.delete('sharedRefresh');
          latest.current.onError([...state.failures.values()].join(' ') || null);
          if (hasFreshPortfolioSnapshot(results)) {
            latest.current.onRefreshNotice?.(DATA_UPDATED_MESSAGE);
          } else {
            latest.current.onRefreshNotice?.(null);
          }
        }
      } catch (error) {
        if (reviewEpoch !== null) reviewPair.finish(reviewEpoch, {successful: false});
        if (isRefreshCooldown(error)) {
          // The shared server has already enforced its limits. Re-read the
          // available data rather than turning a harmless repeat click into a
          // red dashboard outage. Never display the cooldown or cache details.
          state.failures.delete('sharedRefresh');
          latest.current.onError([...state.failures.values()].join(' ') || null);
          try {
            const results = await batch({ replace: true, passive: false });
            if (hasFreshPortfolioSnapshot(results)) {
              latest.current.onRefreshNotice?.(DATA_UPDATED_MESSAGE);
            } else {
              latest.current.onRefreshNotice?.(null);
            }
          } catch (readError) {
            latest.current.onRefreshNotice?.(null);
            reportError('sharedRefresh', readError);
          }
        } else {
          latest.current.onRefreshNotice?.(null);
          reportError('sharedRefresh', error);
        }
      } finally {
        state.manualRefreshInProgress = false;
        state.busy -= 1;
        if (usable() && state.busy === 0) setRefreshing(false);
      }
    };
    return { state, usable, reviewPair, current, bids, portfolioBalance,
      scheduleReview, attention, batch, attentionLoad, refreshAll };
  }, [scope]);

  useEffect(() => {
    reads.state.alive = true;
    setLastUpdatedAt(null);
    setRefreshing(false);
    setCacheStatus(null);
    reads.reviewPair.invalidate('SCREEN_RESET');
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
    return watchVisibleReads(reads.batch, {
      allowed: () => reads.usable() && !reads.state.manualRefreshInProgress,
      lastHumanActivityAt: () => latest.current.lastHumanActivityAt?.(),
    });
  }, [reads, options.enabled, options.active]);

  useEffect(() => {
    if (!options.enabled) return undefined;
    return watchVisibleReads(reads.attentionLoad, {
      allowed: reads.usable,
      lastHumanActivityAt: () => latest.current.lastHumanActivityAt?.(),
    });
  }, [reads, options.enabled]);

  return {
    refreshing, lastUpdatedAt, cacheStatus, reviewPairEvidence,
    refreshAll: () => reads.refreshAll(),
    refreshCurrent: () => {
      if (!reads.usable()) return Promise.resolve();
      // Project-specific fresh=true SQL reads are NOT a coordinated refresh.
      // Preserve the visible data flow, but revoke shadow certification.
      reads.reviewPair.invalidate('INDEPENDENT_FRESH_READ');
      return Promise.all([
        reads.current.load({ replace: true, fresh: true, passive: true }),
        reads.portfolioBalance.load({ replace: true, fresh: true, passive: true }),
        reads.scheduleReview.load({ replace: true, fresh: true, passive: true }),
      ]);
    },
    refreshBids: () => reads.usable()
      ? reads.bids.load({ replace: true, fresh: true, passive: true }) : Promise.resolve(),
    refreshAttention: ({ passive = true } = {}) => reads.attentionLoad({ replace: true, passive }),
  };
}
