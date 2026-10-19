import { useEffect, useMemo, useRef, useState } from 'react';
import FloatingEditorShell from './FloatingEditorShell.jsx';
import BidLogConfirmDialog from './BidLogConfirmDialog.jsx';
import {reconnectMicrosoft, checkMicrosoftReconnect} from './delegatedReconnect.js';
import {
  calculateBidMergePreview,
  MAX_BID_MERGE_SOURCES,
  validMergeBid,
} from './bidMerge.js';
import './BidLogMergeDialog.css';

function displayName(row) {
  return String(row?.bidName || '').trim() || `Bid #${row?.sharePointItemId}`;
}

function responseError(status, detail) {
  if (detail?.code === 'bid_log_merge_requires_reconciliation') {
    return `Merge stopped during ${detail.stage === 'TARGET' ? 'the target update' : 'a source update'}. `
      + `Confirmed merged source IDs: ${(detail.mergedSourceItemIds || []).join(', ') || 'none'}. `
      + `Remaining source IDs: ${(detail.remainingSourceItemIds || []).join(', ') || 'none'}. `
      + 'Review the live SharePoint items and Power Automate runs before attempting another merge.';
  }
  if (status === 409 || detail === 'active_bid_changed') {
    return 'One of these bids changed in SharePoint. Close and reopen Merge Bids to load current versions.';
  }
  if (detail?.message) return detail.message;
  if (status === 403) return 'Your account is not authorized to merge bids.';
  if (status === 503 || status === 502) {
    return 'The merge outcome could not be confirmed. Review the target and source items before trying again.';
  }
  return typeof detail === 'string' ? detail : 'Unable to merge bids.';
}

async function readBid(id) {
  const response = await window.fetch(`/api/bid-log/active/${id}`, {
    credentials: 'same-origin', cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Unable to load bid #${id} for review (HTTP ${response.status}).`);
  }
  const result = await response.json();
  if (!validMergeBid(result) || !String(result?.etag || '').trim()) {
    throw new Error(`Bid #${id} is no longer an editable active bid, or its version is missing.`);
  }
  return result;
}

export default function BidLogMergeDialog({ bids, targetBid, onClose, onMerged }) {
  const rows = useMemo(
    () => bids.filter(validMergeBid).sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [bids],
  );
  const byId = useMemo(() => new Map(rows.map(row => [Number(row.sharePointItemId), row])), [rows]);
  // The target is selected in its editor. Never let this dialog change it.
  const targetId = Number(targetBid?.sharePointItemId) || 0;
  const [sourceIds, setSourceIds] = useState([]);
  const [search, setSearch] = useState('');
  const [review, setReview] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reconnectNeeded, setReconnectNeeded] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [needsReconciliation, setNeedsReconciliation] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => () => { mounted.current = false; }, []);

  const filteredSources = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return rows.filter(row => {
      if (Number(row.sharePointItemId) === Number(targetId)) return false;
      if (!term) return true;
      return [row.bidName, row.pm, row.generalContractors, row.sharePointItemId]
        .some(value => String(value ?? '').toLocaleLowerCase().includes(term));
    });
  }, [rows, search, targetId]);

  function resetReview() {
    setReview(null);
    setConfirmOpen(false);
    setError('');
  }

  function toggleSource(itemId, checked) {
    setSourceIds(current => checked
      ? current.length >= MAX_BID_MERGE_SOURCES || current.includes(itemId)
        ? current : [...current, itemId]
      : current.filter(id => id !== itemId));
    resetReview();
  }

  async function reviewSelection() {
    const chosenTarget = Number(targetId);
    if (reviewing || saving || !byId.has(chosenTarget) || sourceIds.length < 1) return;
    setReviewing(true);
    setError('');
    try {
      const details = await Promise.all([
        readBid(chosenTarget), ...sourceIds.map(readBid),
      ]);
      if (!mounted.current) return;
      const [target, ...sources] = details;
      if (sources.some(row => Number(row.sharePointItemId) === chosenTarget)) {
        throw new Error('Target bid cannot be one of the source bids.');
      }
      const preview = calculateBidMergePreview(target, sources);
      setReview({ target, sources, preview });
    } catch (exc) {
      if (mounted.current) setError(exc?.message || 'Unable to prepare a safe merge preview.');
    } finally {
      if (mounted.current) setReviewing(false);
    }
  }

  async function commitMerge() {
    if (inFlight.current || !review || needsReconciliation) return;
    inFlight.current = true;
    setSaving(true);
    setError('');
    setConfirmOpen(false);
    const body = {
      targetSharePointItemId: Number(review.target.sharePointItemId),
      targetExpectedEtag: review.target.etag,
      sources: review.sources.map(source => ({
        sharePointItemId: Number(source.sharePointItemId),
        expectedEtag: source.etag,
      })),
    };
    try {
      const response = await window.fetch('/api/bid-log/active/merge', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        const detail = result?.detail;
        if (response.status === 401 && ['delegated_session_expired', 'delegated_session_required'].includes(detail)) {
          setReconnectNeeded(true);
          setError('Microsoft editing access expired. Reconnect before attempting this merge again.');
          return;
        }
        const requiresReview = detail?.requiresReview === true || response.status >= 500;
        if (requiresReview) setNeedsReconciliation(true);
        setError(responseError(response.status, detail));
        return;
      }
      if (!Array.isArray(result?.mergedSourceItemIds)
        || result.mergedSourceItemIds.length !== review.sources.length) {
        setNeedsReconciliation(true);
        setError('Merge returned an incomplete result. Review SharePoint and Power Automate before retrying.');
        return;
      }
      onMerged(result);
    } catch {
      if (mounted.current) {
        setNeedsReconciliation(true);
        setError('The merge request may have applied even though its response was lost. Review SharePoint and Power Automate before retrying.');
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  async function reconnectForMerge() {
    if (reconnecting) return;
    setReconnecting(true);
    try {
      await reconnectMicrosoft();
      setReconnectNeeded(false);
      // Force a new ETag/preview review after reconnect. Never retry merge.
      resetReview();
    } catch (exc) {
      setError(exc.message || 'Microsoft access could not be restored.');
    } finally {
      setReconnecting(false);
    }
  }

  async function checkMergeMicrosoft() {
    if (reconnecting) return;
    setReconnecting(true);
    try {
      await checkMicrosoftReconnect();
      setReconnectNeeded(false);
      resetReview();
    } catch (exc) {
      setError(exc.message || 'Microsoft access is not connected yet.');
    } finally {
      setReconnecting(false);
    }
  }

  return (
    <>
      <FloatingEditorShell
        eyebrow="ACTIVE BIDS"
        title="Merge duplicate bids"
        subtitle={`Into ${displayName(targetBid)} · the selected target bid will remain active.`}
        backLabel="Back to Bid Log"
        onClose={onClose}
        saving={saving || reviewing || confirmOpen}
        className="bid-merge-shell"
        bodyClassName="bid-merge-body"
        footer={
          <footer className="floating-editor-footer bid-merge-footer">
            <span>{needsReconciliation ? 'Review required before retrying' : `${sourceIds.length} source bid${sourceIds.length === 1 ? '' : 's'} selected`}</span>
            <div className="bid-merge-actions">
              <button type="button" className="secondary-button" disabled={saving || reviewing} onClick={onClose}>Close</button>
              {review ? (
                <button type="button" className="secondary-button" disabled={saving || needsReconciliation} onClick={resetReview}>Edit selection</button>
              ) : null}
              <button
                type="button"
                className="bid-log-new-bid-button"
                disabled={saving || reviewing || needsReconciliation || !targetId || !sourceIds.length}
                onClick={() => review ? setConfirmOpen(true) : void reviewSelection()}
              >
                {saving ? 'Merging…' : reviewing ? 'Reviewing…' : review ? 'Confirm Merge' : 'Review Merge'}
              </button>
            </div>
          </footer>
        }
      >
        <div className="bid-merge-layout">
          <section className="bid-merge-section bid-merge-target">
            <div className="bid-merge-target-heading">
              <h3>Target Bid <small>Will remain active</small></h3>
              <span className="bid-merge-keep-label">KEEP</span>
            </div>
            <strong className="bid-merge-target-name">{displayName(targetBid)}</strong>
            <p className="bid-merge-target-label">
              #{targetId} · {byId.get(targetId)?.pm || 'No PM'} · {byId.get(targetId)?.status || 'Unavailable'}
            </p>
            <p className="bid-merge-caption">
              This is the bid you opened. Its financial values, assignment, and due date are preserved.
            </p>
          </section>

          <section className="bid-merge-section">
            <h3>Bids to Merge <small>Deleted by Power Automate after confirmation</small></h3>
            <label className="filter-field">
              <span>Find source bids</span>
              <input type="search" placeholder="Search bid name, PM, GC, or ID…"
                disabled={!!review || saving || reviewing}
                value={search} onChange={event => setSearch(event.target.value)} />
            </label>
            <div className="bid-merge-options" role="group" aria-label="Source bids to merge">
              {filteredSources.map(row => {
                const id = Number(row.sharePointItemId);
                return (
                  <label className="bid-merge-option" key={id}>
                    <input type="checkbox" checked={sourceIds.includes(id)}
                      disabled={!!review || saving || reviewing || (!sourceIds.includes(id) && sourceIds.length >= MAX_BID_MERGE_SOURCES)}
                      onChange={event => toggleSource(id, event.target.checked)} />
                    <span><strong>{displayName(row)}</strong><small>#{id} · {row.pm || 'No PM'} · {row.status}</small></span>
                  </label>
                );
              })}
              {!filteredSources.length && <p>No matching bids.</p>}
            </div>
            <p className="bid-merge-caption">The target is excluded automatically. Select up to {MAX_BID_MERGE_SOURCES} source bids; none will be deleted until you confirm.</p>
          </section>

          {review && (
            <section className="bid-merge-section bid-merge-review">
              <h3>Review Result <small>Only Notes and GCs are combined</small></h3>
              <p><strong>Target:</strong> {displayName(review.target)} (#{review.target.sharePointItemId})</p>
              <p><strong>To be deleted:</strong> {review.sources.map(displayName).join(' · ')}</p>
              <label className="filter-field"><span>Combined General Contractors</span>
                <div className="bid-merge-value">{review.preview.generalContractors.join(' · ') || 'None'}</div>
              </label>
              <label className="filter-field"><span>Combined Notes</span>
                <pre className="bid-merge-notes">{review.preview.notes || 'No notes to combine.'}</pre>
              </label>
              <p className="bid-merge-caption">Estimates, due dates, PM assignments, and other bid values are not added or changed.</p>
            </section>
          )}
        </div>
        {error && <div className="page-alert bid-merge-error" role="alert"><strong>{needsReconciliation ? 'Manual reconciliation required' : 'Merge not completed'}</strong><span>{error}</span></div>}
        {reconnectNeeded && (
          <div className="page-alert bid-merge-error" role="alert">
            <span>Your selection is retained. Reconnect Microsoft, then review the bids again before merging.</span>
            <button type="button" className="secondary-button" disabled={saving || reconnecting}
              onClick={() => { void reconnectForMerge(); }}>
              {reconnecting ? 'Connecting…' : 'Reconnect Microsoft'}
            </button>
            <button type="button" className="secondary-button" disabled={saving || reconnecting}
              onClick={() => { void checkMergeMicrosoft(); }}>Check connection</button>
          </div>
        )}
      </FloatingEditorShell>

      <BidLogConfirmDialog
        open={confirmOpen && !saving}
        title="Merging bids cannot be undone."
        message={`Are you sure you want to proceed? ${review?.sources.length || 0} selected bid(s) will be merged into ${displayName(review?.target)}. The selected bids will be permanently deleted, along with their associated calendar events.`}
        confirmLabel="Merge Bids"
        cancelLabel="Cancel"
        danger
        onConfirm={() => void commitMerge()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
