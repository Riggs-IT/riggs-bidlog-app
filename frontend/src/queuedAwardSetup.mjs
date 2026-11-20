import {asyncAwardSetupId} from './bidLogWorkspaceRules.mjs';

// One queue acknowledgement may come from Bid Log OR Projected Billings.
// Never guess the original SQL BidLogID from this SharePoint item ID.
export function queuedAwardSourceId(event) {
  if (event?.kind !== 'award_queued') return null;
  const value = event.sharePointItemId;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// The SQL worker does not mark COMPLETE until its Awarded operation and
// exactly one draft have been verified. Anything less must not open setup.
export function queuedAwardProgress(progress) {
  const status = String(progress?.status || '');
  if (status === 'COMPLETE') {
    const id = asyncAwardSetupId(progress, true);
    return id === null
      ? {kind: 'review', message: 'Award completed but Project Setup identity was not verified. Review the award; do not submit it again.'}
      : {kind: 'ready', originalBidLogId: id};
  }
  if (status === 'REVIEW') {
    return {kind: 'review', message: 'This award requires lifecycle review. Do not award the bid again.'};
  }
  if (status === 'DRAFT_REVIEW') {
    return {kind: 'review', message: 'The award completed, but its Project Setup draft requires review. Do not award the bid again.'};
  }
  return {kind: 'pending'};
}
