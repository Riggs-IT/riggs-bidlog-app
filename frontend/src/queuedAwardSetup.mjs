import {asyncAwardSetupId} from './bidLogWorkspaceRules.mjs';

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
