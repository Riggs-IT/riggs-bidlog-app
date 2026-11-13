"""Project Setup access is resolved from the verified Microsoft/Bid Log session.

ADMIN may read and write SQL drafts. MANAGEMENT_ADMIN may read them for a
watermarked UI preview, but may not create or change drafts. Other roles may
not read this private editor. The Data API/SQL enforce separate read/write
capabilities; browser flags are never a security boundary.
"""
from __future__ import annotations
from fastapi import HTTPException
from .auth import CurrentUser


def _role(user: CurrentUser) -> str:
    return str(user.app_role or "").strip().upper()


def _valid_actor(user: CurrentUser) -> bool:
    return type(user.eid) is int and 0 < user.eid <= 2147483647


def can_review_project_setup(user: CurrentUser) -> bool:
    return _valid_actor(user) and _role(user) in {"ADMIN", "MANAGEMENT_ADMIN"}


def can_edit_project_setup(user: CurrentUser) -> bool:
    return _valid_actor(user) and _role(user) == "ADMIN"


def _require_authenticated_actor(user: CurrentUser) -> None:
    # Preserve the existing Project Setup contract: a session without a valid
    # Riggs actor is unauthenticated (401), not merely unauthorized (403).
    # Identity is resolved by get_current_user from the signed Microsoft
    # session; browser-provided employee IDs are never trusted.
    if not _valid_actor(user):
        raise HTTPException(status_code=401, detail="missing_authenticated_user")


def require_project_setup_reviewer(user: CurrentUser) -> None:
    _require_authenticated_actor(user)
    if not can_review_project_setup(user):
        raise HTTPException(status_code=403, detail="project_setup_reviewers_only")


def require_project_setup_editor(user: CurrentUser) -> None:
    _require_authenticated_actor(user)
    if not can_edit_project_setup(user):
        raise HTTPException(status_code=403, detail="bid_log_admin_required")
