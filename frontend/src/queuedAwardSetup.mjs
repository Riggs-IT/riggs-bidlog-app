import {asyncAwardSetupId} from './bidLogWorkspaceRules.mjs';
import {validateOpsSetupList} from './opsSetupListContract.mjs';

// One queue acknowledgement may come from Bid Log OR Projected Billings.
// Never guess the original SQL BidLogID from this SharePoint item ID.
export function queuedAwardSourceId(event) {
  if (event?.kind !== 'award_queued') return null;
  const value = event.sharePointItemId;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// The project can be ready BEFORE the five losing GCs finish. The Data API
// derives winnerVerified + draftReady from SQL (never from client claims).
// Keep a completed legacy award compatible with the earlier M5 contract.
export function queuedAwardProgress(progress) {
  const status = String(progress?.status || '');
  const id = progress?.originalBidLogId;
  if (['RUNNING', 'COMPLETE'].includes(status)
      && progress?.winnerVerified === true && progress?.draftReady === true
      && Number.isSafeInteger(id) && id > 0) {
    return {kind: 'ready', originalBidLogId: id};
  }
  if (status === 'COMPLETE') {
    const completedId = asyncAwardSetupId(progress, true);
    return completedId === null
      ? {kind: 'review', message: 'Award completed but Project Setup identity was not verified. Review the award; do not submit it again.'}
      : {kind: 'ready', originalBidLogId: completedId};
  }
  if (status === 'REVIEW') {
    return {kind: 'review', message: 'This award requires lifecycle review. Do not award the bid again.'};
  }
  if (status === 'DRAFT_REVIEW') {
    return {kind: 'review', message: 'The award completed, but its Project Setup draft requires review. Do not award the bid again.'};
  }
  return {kind: 'pending'};
}


// Read-only management preview handoff. SQL already verified the winning GC
// and exactly one PENDING_SETUP draft before the caller reaches here.
// No new award, reconciliation, draft-create or edit call is performed.
export async function resolveVerifiedPreviewSetupId(originalBidLogId, {
  fetcher = fetch, signal, maxPages = 20,
} = {}) {
  if (!Number.isSafeInteger(originalBidLogId) || originalBidLogId <= 0) {
    throw new Error('Invalid award identity.');
  }
  const pageSize = 50;
  let cursor = null;
  const seen = new Set();
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({page_size: String(pageSize)});
    if (cursor) {
      query.set('after_created_at_utc', cursor.createdAtUTC);
      query.set('after_setup_id', cursor.setupId);
    }
    const response = await fetcher(`/api/project-setups/ops/awaiting-information?${query}`, {
      method: 'GET', credentials: 'same-origin', cache: 'no-store', signal,
      headers: {'X-Riggs-Passive-Read': '1', Accept: 'application/json'},
    });
    if (!response.ok) throw new Error('Saved draft preview unavailable.');
    const verified = validateOpsSetupList(await response.json(), pageSize);
    const matches = verified.items.filter(item => item.originalBidLogId === originalBidLogId);
    if (matches.length !== 0) {
      if (matches.length !== 1) throw new Error('Ambiguous SQL draft identity.');
      return matches[0].setupId;
    }
    cursor = verified.nextCursor;
    if (cursor === null) break;
    const key = `${cursor.createdAtUTC}:${cursor.setupId}`;
    if (seen.has(key)) throw new Error('Repeated SQL draft cursor.');
    seen.add(key);
  }
  throw new Error('Verified draft is not present in the authorized preview listing.');
}
