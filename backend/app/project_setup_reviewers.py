"""AP4F3V: private Project Setup reviewer gate, separate from Bid Log ADMIN.

Actor EID always comes from server-validated Microsoft session / access resolver.
Never inspect browser-provided EID; client-side capability is only UI decoration.
"""
from __future__ import annotations
from fastapi import HTTPException
from .auth import CurrentUser

REVIEWER_EIDS = frozenset({2021, 176})


def can_review_project_setup(user: CurrentUser) -> bool:
    return (type(user.eid) is int and user.eid in REVIEWER_EIDS
            and str(user.app_role or '').strip().upper() == 'ADMIN')


def require_project_setup_reviewer(user: CurrentUser) -> None:
    if not can_review_project_setup(user):
        raise HTTPException(status_code=403, detail='project_setup_reviewers_only')
