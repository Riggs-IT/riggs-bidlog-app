import { useEffect, useMemo, useRef, useState } from 'react';
import { mergePrimaryPortfolio } from './primaryProjection.js';
import {indexPortfolioRebalance} from './portfolioBalance.js';
import {indexScheduleReview} from './scheduleReview.js';
import { createLatestRead, freshReadPath, readOptions, watchVisibleReads } from './browserFreshness.js';
import {DATA_UPDATED_MESSAGE, DATA_UPDATING_MESSAGE, DATA_REFRESH_FAILED_MESSAGE, hasFreshPortfolioSnapshot, isRefreshCooldown} from './refreshFeedback.js';
import {createProgressiveDashboardReads} from './dashboardRefreshStages.js';
import {createReviewPairCoordinator, canReuseVerifiedReviewPair, coalesceReviewBatches} from './reviewPairCoordinator.js';
import {createReviewCacheRecovery, recoverableReviewReason} from './reviewCacheRecovery.js';
import {createReviewCohortPublisher} from './reviewCohortPublication.js';

// One owner publishes metadata, primary projections and historical-margin reads
// together. Existing baseline API contracts remain unchanged for other callers.
export default function useProjectedBillingsFreshness(options) {
  const latest = useRef(options);
  latest.current = options;
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [cacheStatus, setCacheStatus] = useState(null);
  // Diagnostic state for the paired read; only an exact accepted pair may
  // drive server financial review labels in Stage 3G6.
  const [reviewPairEvidence, setReviewPairEvidence] = useState(null);
  const [recoveringReview, setRecoveringReview] = useState(false);
  const scope = `${options.userKey ?? ''}:${Boolean(options.enabled)}`;

  const reads = useMemo(() => {
    const state = { alive: false, busy: 0, failures: new Map(), manualRefreshInProgress: false, recoverySerial: 0 };
    const stagedPairs = new Map();
    const usable = () => state.alive && latest.current.enabled && !latest.current.isEnding();
    const publisher = createReviewCohortPublisher({
      publish: cohort => {
        if (usable()) latest.current.onReviewCohort?.(cohort);
      },
    });
    const reviewPair = createReviewPairCoordinator({
      onChange: (evidence, acceptedPair) => {
        if (!usable()) return;
        setReviewPairEvidence(evidence);
        if (evidence.state === 'VERIFIED' && acceptedPair) {
          state.recoverySerial++;
          setRecoveringReview(false);
          // One synchronous publication of the exact PRIMARY, MONTHLY,
          // BALANCE and review certificate, never two independent updates.
          publisher.verified(acceptedPair);
        } else if (['SCREEN_RESET', 'INDEPENDENT_FRESH_READ',
          'UNPAIRED_PRIMARY_READ', 'UNPAIRED_BALANCE_READ'].includes(evidence.reason)) {
          publisher.forget();
          latest.current.onAcceptedReviewPair?.(null);
        }
      },
    });
    const staged = epoch => {
      if (!stagedPairs.has(epoch)) stagedPairs.set(epoch, {current: null, balance: null});
      return stagedPairs.get(epoch);
    };
    function publishUnverified(epoch, verdict, {passive = false} = {}) {
      if (verdict.state !== 'UNAVAILABLE') return;
      const pending = stagedPairs.get(epoch);
      publisher.unavailable({
        current: pending?.current || null,
        balance: pending?.balance || null,
        reason: verdict.reason,
        passive,
      });
    }
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
        if (config.reviewEpoch !== undefined) {
          if (!reviewPair.offerCurrent(config.reviewEpoch, data)) return false;
          staged(config.reviewEpoch).current = data;
        } else {
          // Explicit fresh/job reads intentionally revoke old certification.
          reviewPair.invalidate('UNPAIRED_PRIMARY_READ');
          latest.current.onCurrent(data);
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
        if (config.reviewEpoch !== undefined) {
          if (!reviewPair.offerBalance(config.reviewEpoch, data)) return false;
          staged(config.reviewEpoch).balance = data;
        } else {
          reviewPair.invalidate('UNPAIRED_BALANCE_READ');
          latest.current.onPortfolioBalance(data);
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

    // A passive GET can land during a shared-cache rebuild and receive
    // UNAVAILABLE review evidence alongside valid SQL financial rows. Wait for
    // the EXISTING rebuild to finish using status metadata only; then retry
    // one ordinary paired GET. Never manufacture a Pending classification.
    const recovery = createReviewCacheRecovery({
      readStatus: updateCacheStatus,
      recertify: () => batch({passive: true, maxAgeMs: 0, cacheRecoveryCheck: true}),
      allowed: () => usable() && latest.current.active
        && document.visibilityState === 'visible'
        && !state.manualRefreshInProgress
        && reviewPair.evidence.state !== 'VERIFIED',
    });

    const batch = coalesceReviewBatches(async config => {
      if (!usable()) return [];
      // A rapid focus check often returns `recent` for BOTH financial reads.
      // Keep the previously accepted pair while those exact rows remain shown;
      // a genuine changed read will invalidate it through its publish callback.
      const pairAlreadyRecent = canReuseVerifiedReviewPair(
        reviewPair.evidence, current, portfolioBalance, config,
      );
      const reviewEpoch = pairAlreadyRecent ? null : reviewPair.begin('BATCH');
      if (reviewEpoch !== null) staged(reviewEpoch);
      // A new certificate requires BOTH financial readers to publish. Their
      // independent 30-second max-age clocks can otherwise produce one
      // 'recent' and one 'published' read, revoking a valid Pending label.
      // This is an ordinary cached GET, never fresh=true or a cache rebuild.
      const cohortConfig = pairAlreadyRecent ? config
        : {...config, maxAgeMs: 0, reviewEpoch};
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
        if (reviewEpoch !== null) {
          const verdict = reviewPair.finish(reviewEpoch, {successful: pairedSuccess});
          publishUnverified(reviewEpoch, verdict, {passive: config?.passive === true});
          stagedPairs.delete(reviewEpoch);
          if (verdict.state === 'VERIFIED') recovery.cancel();
          else if (!config?.cacheRecoveryCheck && !state.manualRefreshInProgress
              && recoverableReviewReason(verdict)) {
            const recoverySerial = ++state.recoverySerial;
            setRecoveringReview(true);
            void recovery.start().then(() => {
              if (usable() && state.recoverySerial === recoverySerial) setRecoveringReview(false);
            }, () => {
              if (usable() && state.recoverySerial === recoverySerial) setRecoveringReview(false);
            });
          }
        }
        if (showSpinner) {
          state.busy -= 1;
          if (usable() && state.busy === 0) setRefreshing(false);
        }
      }
    });
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
      recovery.cancel();
      state.busy += 1;
      setRefreshing(true);
      latest.current.onRefreshNotice?.(DATA_UPDATING_MESSAGE);
      try {
        // Exactly one POST asks the bridge to rebuild its shared snapshot.
        // Polling below only checks metadata, never launches SQL reads.
        const receipt = await latest.current.fetchJson(
          '/api/projected-billings/dashboard-cache/refresh',
          { method: 'POST', credentials: 'same-origin', cache: 'no-store' },
        );
        if (!receipt?.refreshId) throw new Error('Unable to refresh data. Please try again.');
        // Financial rows remain visible during the coordinated rebuild.
        reviewEpoch = reviewPair.begin('MANUAL');
        staged(reviewEpoch);
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
        const reviewVerdict = reviewPair.finish(reviewEpoch, {successful: status.status === 'COMPLETE'
          && results[0]?.status === 'published'
          && results[2]?.status === 'published'});
        publishUnverified(reviewEpoch, reviewVerdict);
        stagedPairs.delete(reviewEpoch);
        if (current.lastSuccessAt !== null && bids.lastSuccessAt !== null) {
          latest.current.onReady();
        }
        if (status.status !== 'COMPLETE') {
          const error = new Error('Data could not be refreshed. Last available values are shown.');
          latest.current.onRefreshNotice?.(DATA_REFRESH_FAILED_MESSAGE);
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
        if (reviewEpoch !== null) {
          const verdict = reviewPair.finish(reviewEpoch, {successful: false});
          publishUnverified(reviewEpoch, verdict);
          stagedPairs.delete(reviewEpoch);
        }
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
            latest.current.onRefreshNotice?.(DATA_REFRESH_FAILED_MESSAGE);
            reportError('sharedRefresh', readError);
          }
        } else {
          latest.current.onRefreshNotice?.(DATA_REFRESH_FAILED_MESSAGE);
          reportError('sharedRefresh', error);
        }
      } finally {
        state.manualRefreshInProgress = false;
        state.busy -= 1;
        if (usable() && state.busy === 0) setRefreshing(false);
      }
    };
    return { state, usable, reviewPair, publisher, stagedPairs, current, bids, portfolioBalance,
      scheduleReview, attention, recovery, batch, attentionLoad, refreshAll };
  }, [scope]);

  useEffect(() => {
    reads.state.alive = true;
    setLastUpdatedAt(null);
    setRefreshing(false);
    setCacheStatus(null);
    setRecoveringReview(false);
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
      reads.state.recoverySerial++;
      reads.batch.reset();
      reads.recovery.cancel();
      reads.publisher.forget();
      reads.stagedPairs.clear();
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

  // Expose only the presentation need to App; the paired-read evidence and
  // server financial classification stay owned by this hook/coordinator.
  const reviewClassificationPending = reviewPairEvidence?.state === 'WAITING'
    || recoveringReview;

  return {
    refreshing, lastUpdatedAt, cacheStatus, reviewPairEvidence, recoveringReview,
    reviewClassificationPending,
    refreshAll: () => reads.refreshAll(),
    refreshCurrent: () => {
      if (!reads.usable()) return Promise.resolve();
      // Project-specific fresh=true SQL reads are NOT a coordinated refresh.
      // Preserve the visible data flow, but revoke stale paired evidence.
      reads.reviewPair.invalidate('INDEPENDENT_FRESH_READ');
      reads.recovery.cancel();
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
